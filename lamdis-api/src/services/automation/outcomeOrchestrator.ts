/**
 * Outcome Orchestrator
 *
 * Tick-based autonomous agent loop. Each tick:
 * 1. Observe — gather current state
 * 2. Think — call LLM planner
 * 3. Act — execute the decided action
 * 4. Record — log activity, emit evidence, update dossier
 * 5. Schedule — ensure next tick is scheduled
 *
 * Ticks are triggered by:
 * - New evidence events (from eventConsumer)
 * - Input request fulfillment (from API route)
 * - Action completion (from actionExecutor)
 * - Periodic scheduler (every 30s for active agents)
 */

import { db } from '../../db.js';
import {
  outcomeInstances,
  outcomeTypes,
  evidenceEvents,
  actions,
  actionExecutions,
  workspaces,
} from '@lamdis/db/schema';
import { agentTasks, inputRequests, agentActivityLog } from '@lamdis/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { callPlanner, type PlannerContext, type PlannerResult, type PlanUpdate, type NextAction, type SystemAction } from './agentPlanner.js';
import { loadPlaybookContextForInstance, summarizePlaybookForPrompt } from '../playbooks/playbookContext.js';
import { executeAction } from './actionExecutor.js';
import { recordIfSignificant } from './dossierGenerator.js';
import * as workspaceManager from '../workspace/workspaceManager.js';
import { generateAndRegisterTool } from '../toolFactory/toolService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentStatus = 'idle' | 'planning' | 'executing' | 'waiting_input' | 'paused' | 'completed' | 'failed';

// ---------------------------------------------------------------------------
// Main orchestrator tick
// ---------------------------------------------------------------------------

/**
 * Run a single orchestrator tick for an agent-enabled outcome instance.
 * Safe to call multiple times — idempotent by design.
 */
export async function orchestratorTick(instanceId: string): Promise<void> {
  // 1. Load instance
  const [instance] = await db.select().from(outcomeInstances)
    .where(eq(outcomeInstances.id, instanceId))
    .limit(1);

  if (!instance) return;
  if (!instance.agentEnabled) return;
  if (instance.agentStatus === 'paused' || instance.agentStatus === 'completed') return;

  // 2. Check for pending input requests — if any, stay waiting
  const pendingInputs = await db.select().from(inputRequests)
    .where(and(
      eq(inputRequests.outcomeInstanceId, instanceId),
      eq(inputRequests.status, 'pending'),
    ));

  if (pendingInputs.length > 0) {
    await updateAgentStatus(instanceId, 'waiting_input');
    return;
  }

  // 3. Load full context for the planner
  try {
    await updateAgentStatus(instanceId, 'planning');
    await logActivity(instanceId, 'thinking', 'Analyzing current state and planning next steps...');

    const ctx = await loadPlannerContext(instanceId, instance);
    const plan = await callPlanner(ctx, {
      orgId: instance.orgId,
      serviceKey: 'agentPlanner',
      outcomeInstanceId: instanceId,
      outcomeTypeId: instance.outcomeTypeId ?? undefined,
    });

    // 4. Apply plan updates
    await applyPlanUpdates(instanceId, instance.orgId, plan.planUpdates);

    // 4.5. Process system actions (workspace creation, tool creation, etc.)
    if (plan.systemActions && plan.systemActions.length > 0) {
      await processSystemActions(instanceId, instance.orgId, plan.systemActions);
    }

    // 5. Update current plan summary on instance
    const allTasks = await db.select().from(agentTasks)
      .where(eq(agentTasks.outcomeInstanceId, instanceId));
    const completedCount = allTasks.filter(t => t.status === 'completed').length;

    await db.update(outcomeInstances).set({
      currentPlan: {
        taskCount: allTasks.length,
        completedCount,
        nextStep: plan.progressSummary,
        lastUpdated: new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(outcomeInstances.id, instanceId));

    // 6. Execute next action
    await executeNextAction(instanceId, instance.orgId, plan.nextAction, plan);

    // 7. Log planning activity
    await logActivity(instanceId, 'planning', plan.progressSummary, {
      reasoning: plan.reasoning,
      confidence: plan.confidence,
      planUpdates: plan.planUpdates.length,
    });

  } catch (err: any) {
    console.error(`[orchestrator] Tick error for ${instanceId}:`, err?.message);
    await logActivity(instanceId, 'error', `Planning error: ${err?.message}`);
    // Don't fail the instance — let the next tick retry
  }
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

async function loadPlannerContext(instanceId: string, instance: any): Promise<PlannerContext> {
  // Load outcome type
  const [outcomeType] = instance.outcomeTypeId
    ? await db.select().from(outcomeTypes).where(eq(outcomeTypes.id, instance.outcomeTypeId)).limit(1)
    : [null];

  // Load current tasks
  const currentTasks = await db.select().from(agentTasks)
    .where(eq(agentTasks.outcomeInstanceId, instanceId))
    .orderBy(agentTasks.sequence);

  // Load available actions for this org
  const availableActions = await db.select({
    id: actions.id,
    actionId: actions.actionId,
    title: actions.title,
    description: actions.description,
    method: actions.method,
    inputSchema: actions.inputSchema,
    isMock: actions.isMock,
  }).from(actions)
    .where(and(eq(actions.orgId, instance.orgId), eq(actions.enabled, true)));

  // Load recent evidence
  const recentEvidence = await db.select({
    eventType: evidenceEvents.eventType,
    payload: evidenceEvents.payload,
    emittedAt: evidenceEvents.emittedAt,
  }).from(evidenceEvents)
    .where(eq(evidenceEvents.outcomeInstanceId, instanceId))
    .orderBy(desc(evidenceEvents.emittedAt))
    .limit(30);

  // Load pending input requests
  const pendingInputs = await db.select({
    id: inputRequests.id,
    title: inputRequests.title,
    requestType: inputRequests.requestType,
    status: inputRequests.status,
  }).from(inputRequests)
    .where(eq(inputRequests.outcomeInstanceId, instanceId));

  // Load recent action execution results
  const recentActions = await db.select({
    actionId: actionExecutions.actionId,
    status: actionExecutions.status,
    executionLog: actionExecutions.executionLog,
  }).from(actionExecutions)
    .where(eq(actionExecutions.outcomeInstanceId, instanceId))
    .orderBy(desc(actionExecutions.createdAt))
    .limit(10);

  // Load workspace context
  let workspaceCtx: PlannerContext['workspace'] = { exists: false };
  if (instance.workspaceId) {
    const ws = await workspaceManager.getWorkspace(instance.workspaceId);
    if (ws && ws.status === 'active') {
      const files = await workspaceManager.listFiles(instance.workspaceId);
      const services = await workspaceManager.getServices(instance.workspaceId);
      workspaceCtx = {
        exists: true,
        workspaceId: ws.id,
        files: files.map(f => f.path),
        services: services.map(s => ({ name: s.name, status: s.status, port: s.port })),
      };
    }
  } else {
    // Check if there's a workspace linked by outcomeInstanceId
    const [linkedWs] = await db.select().from(workspaces)
      .where(and(eq(workspaces.orgId, instance.orgId), eq(workspaces.outcomeInstanceId, instanceId)))
      .limit(1);
    if (linkedWs && linkedWs.status === 'active') {
      // Link the workspace to the instance
      await db.update(outcomeInstances).set({ workspaceId: linkedWs.id } as any)
        .where(eq(outcomeInstances.id, instanceId));
      const files = await workspaceManager.listFiles(linkedWs.id);
      const services = await workspaceManager.getServices(linkedWs.id);
      workspaceCtx = {
        exists: true,
        workspaceId: linkedWs.id,
        files: files.map(f => f.path),
        services: services.map(s => ({ name: s.name, status: s.status, port: s.port })),
      };
    }
  }

  return {
    outcomeType: {
      name: outcomeType?.name || 'Unknown',
      description: outcomeType?.description,
      successCriteria: (outcomeType?.successCriteria || []) as Array<{ description: string; weight?: number }>,
      keyDecisions: (outcomeType?.keyDecisions || []) as Array<{ name: string; description?: string; automatable?: boolean }>,
      automationBoundaries: (outcomeType?.automationBoundaries || {}) as Record<string, unknown>,
      riskClass: outcomeType?.riskClass || 'standard',
    },
    instance: {
      id: instanceId,
      goalDescription: instance.goalDescription || '',
      guidelines: (instance.guidelines || {}) as Record<string, unknown>,
      proofStatus: instance.proofStatus || 'gathering',
      confidenceScore: instance.confidenceScore || 0,
      agentStatus: instance.agentStatus || 'idle',
      eventCount: instance.eventCount || 0,
    },
    currentTasks: currentTasks.map(t => ({
      id: t.id,
      sequence: t.sequence,
      title: t.title,
      status: t.status || 'planned',
      taskType: t.taskType,
      actionOutput: t.actionOutput as Record<string, unknown> | null,
    })),
    availableActions: (availableActions as any[]).map(a => ({
      id: a.id,
      actionId: a.actionId,
      title: a.title,
      description: a.description,
      method: a.method,
      inputSchema: a.inputSchema,
      isMock: a.isMock ?? false,
    })),
    recentEvidence: recentEvidence as Array<{ eventType: string; payload: unknown; emittedAt: Date }>,
    pendingInputRequests: pendingInputs.map(r => ({
      id: r.id,
      title: r.title,
      requestType: r.requestType,
      status: r.status || 'pending',
    })),
    recentActionResults: recentActions.map(r => ({
      actionId: r.actionId,
      status: r.status || 'proposed',
      executionLog: r.executionLog,
    })),
    workspace: workspaceCtx,
    operationalNotes: ((instance as any).operationalNotes || []) as Array<{
      note: string;
      category: 'blocked_source' | 'failed_approach' | 'working_approach' | 'learned';
      tool: string;
      domain?: string;
      createdAt: string;
    }>,
    playbook: await loadPlannerPlaybookContext(instanceId, instance),
  };
}

/**
 * Load the customer-specific playbook for this instance and project it into
 * the planner-friendly shape. Also handles auto-migration to a newer playbook
 * version: when the active playbook for the outcome type has advanced beyond
 * the version this instance is pinned to, switch the instance over and emit
 * a `playbook_version_changed` evidence event for the audit trail.
 */
async function loadPlannerPlaybookContext(
  instanceId: string,
  instance: any,
): Promise<PlannerContext['playbook']> {
  const ctx = await loadPlaybookContextForInstance(instanceId);
  if (!ctx) return undefined;

  const pinnedVersion = instance.playbookVersion as number | null;
  if (pinnedVersion != null && pinnedVersion !== ctx.version) {
    // Auto-migrate to the newer version on the next tick.
    await db
      .update(outcomeInstances)
      .set({ activePlaybookId: ctx.playbookId, playbookVersion: ctx.version, updatedAt: new Date() })
      .where(eq(outcomeInstances.id, instanceId));
    await db.insert(evidenceEvents).values({
      orgId: instance.orgId,
      outcomeInstanceId: instanceId,
      eventType: 'playbook_version_changed',
      eventSource: 'orchestrator',
      payload: { from: pinnedVersion, to: ctx.version, playbookId: ctx.playbookId },
      emittedAt: new Date(),
    } as any);
  } else if (pinnedVersion == null) {
    // First time pinning the playbook to this instance.
    await db
      .update(outcomeInstances)
      .set({ activePlaybookId: ctx.playbookId, playbookVersion: ctx.version, updatedAt: new Date() })
      .where(eq(outcomeInstances.id, instanceId));
  }

  return {
    name: ctx.name,
    version: ctx.version,
    summary: ctx.summary ?? undefined,
    promptSnippet: summarizePlaybookForPrompt(ctx),
    boundConnectorInstanceIds: ctx.bindings
      .map((b) => b.connectorInstanceId)
      .filter((id): id is string => !!id),
    requiredDocumentKeys: ctx.documentRequirements.filter((r) => r.required).map((r) => r.documentKey),
    procedureStepCount: ctx.procedureSteps.length,
    hasApprovalChain: !!ctx.approvalChainId,
  };
}

// ---------------------------------------------------------------------------
// Plan application
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TERMINAL_STATUSES = ['completed', 'failed', 'skipped'];

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titlesAreSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  // Check if one contains the other (catches "Search for Vespa photos" vs "Search for Vespa photos on eBay")
  if (na.includes(nb) || nb.includes(na)) return true;
  // Word overlap: if 70%+ words match, consider similar
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 && intersection / union >= 0.7;
}

async function applyPlanUpdates(instanceId: string, orgId: string, updates: PlanUpdate[]): Promise<void> {
  // Pre-load existing non-terminal tasks for dedup checks
  const existingTasks = await db.select({ id: agentTasks.id, title: agentTasks.title, status: agentTasks.status })
    .from(agentTasks)
    .where(eq(agentTasks.outcomeInstanceId, instanceId));
  const activeTasks = existingTasks.filter(t => !TERMINAL_STATUSES.includes(t.status || ''));

  for (const update of updates) {
    try {
      // Skip modify/skip/complete if the taskId isn't a valid UUID (LLM sometimes returns numbers)
      if ((update.action === 'modify' || update.action === 'skip' || update.action === 'complete') && update.taskId && !UUID_RE.test(update.taskId)) {
        continue;
      }
      if (update.action === 'add' && update.task) {
        // Dedup: skip if a similar active task already exists
        const duplicate = activeTasks.find(t => titlesAreSimilar(t.title, update.task!.title));
        if (duplicate) {
          console.log(`[orchestrator] Skipping duplicate task "${update.task.title}" — similar to existing "${duplicate.title}" (${duplicate.id})`);
          continue;
        }

        await db.insert(agentTasks).values({
          orgId,
          outcomeInstanceId: instanceId,
          sequence: update.task.sequence || 0,
          title: update.task.title,
          description: update.task.description,
          taskType: update.task.taskType,
          actionId: (update.task.actionId && UUID_RE.test(update.task.actionId)) ? update.task.actionId : undefined,
          actionInput: update.task.actionInput,
          dependsOn: update.task.dependsOn || [],
          status: 'planned',
        } as any);

        // Track newly added task for intra-batch dedup
        activeTasks.push({ id: 'new', title: update.task.title, status: 'planned' });
      } else if (update.action === 'modify' && update.taskId && update.task) {
        const setFields: Record<string, unknown> = { updatedAt: new Date() };
        if (update.task.title) setFields.title = update.task.title;
        if (update.task.description) setFields.description = update.task.description;
        if (update.task.sequence !== undefined) setFields.sequence = update.task.sequence;
        await db.update(agentTasks).set(setFields as any)
          .where(eq(agentTasks.id, update.taskId));
      } else if (update.action === 'skip' && update.taskId) {
        await db.update(agentTasks).set({
          status: 'skipped',
          updatedAt: new Date(),
        } as any).where(eq(agentTasks.id, update.taskId));
      } else if (update.action === 'complete' && update.taskId) {
        await db.update(agentTasks).set({
          status: 'completed',
          description: update.reason ? `Completed by planner: ${update.reason}` : undefined,
          completedAt: new Date(),
          updatedAt: new Date(),
        } as any).where(eq(agentTasks.id, update.taskId));
        console.log(`[orchestrator] Completed task ${update.taskId}: ${update.reason || ''}`);
      }
    } catch (err: any) {
      console.error(`[orchestrator] Failed to apply plan update:`, err?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Next action execution
// ---------------------------------------------------------------------------

async function executeNextAction(
  instanceId: string,
  orgId: string,
  nextAction: NextAction,
  plan: PlannerResult,
): Promise<void> {
  switch (nextAction.type) {
    case 'execute_task': {
      if (!nextAction.taskId) break;

      // Find the task
      const [task] = await db.select().from(agentTasks)
        .where(eq(agentTasks.id, nextAction.taskId))
        .limit(1);

      if (!task) break;

      // Mark task as in_progress
      await db.update(agentTasks).set({
        status: 'in_progress',
        startedAt: new Date(),
        updatedAt: new Date(),
      } as any).where(eq(agentTasks.id, task.id));

      await updateAgentStatus(instanceId, 'executing');
      await logActivity(instanceId, 'executing', `Executing: ${task.title}`, undefined, task.id);

      if (task.taskType === 'action' && task.actionId) {
        // Create an action execution record and execute it
        const [exec] = await db.insert(actionExecutions).values({
          orgId,
          outcomeInstanceId: instanceId,
          actionId: task.actionId,
          proposedBy: 'system',
          evidenceSnapshot: { actionInput: task.actionInput },
          proofThresholdMet: true,
          riskClass: 'standard',
          status: 'executing',
          startedAt: new Date(),
        } as any).returning();

        const result = await executeAction(exec.id, task.actionInput as Record<string, unknown>);

        // Update task with result
        await db.update(agentTasks).set({
          status: result.ok ? 'completed' : 'failed',
          actionOutput: result.result as Record<string, unknown>,
          completedAt: new Date(),
          retryCount: result.ok ? task.retryCount : (task.retryCount || 0) + 1,
          updatedAt: new Date(),
        } as any).where(eq(agentTasks.id, task.id));

        if (result.ok) {
          await logActivity(instanceId, 'completed', `Completed: ${task.title}`, { result: result.result }, task.id);
        } else {
          await logActivity(instanceId, 'error', `Failed: ${task.title} — ${result.error}`, { error: result.error }, task.id);
        }
      } else if (task.taskType === 'wait') {
        // Wait tasks just sit until the next tick
        await updateAgentStatus(instanceId, 'executing');
      }
      break;
    }

    case 'request_input': {
      if (!nextAction.inputRequest) break;

      // Create the input request
      const [req] = await db.insert(inputRequests).values({
        orgId,
        outcomeInstanceId: instanceId,
        requestType: nextAction.inputRequest.requestType,
        title: nextAction.inputRequest.title,
        description: nextAction.inputRequest.description,
        schema: nextAction.inputRequest.schema || {},
        priority: nextAction.inputRequest.priority || 'normal',
        status: 'pending',
      } as any).returning();

      // Optionally link to a task
      if (nextAction.taskId) {
        await db.update(agentTasks).set({
          inputRequestId: req.id,
          status: 'blocked',
          blockedReason: `Waiting for user input: ${nextAction.inputRequest.title}`,
          updatedAt: new Date(),
        } as any).where(eq(agentTasks.id, nextAction.taskId));
      }

      await updateAgentStatus(instanceId, 'waiting_input');
      await logActivity(instanceId, 'requesting_input',
        `Requesting: ${nextAction.inputRequest.title}`, { requestId: req.id });
      break;
    }

    case 'complete': {
      await db.update(outcomeInstances).set({
        agentStatus: 'completed',
        status: 'passed',
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(outcomeInstances.id, instanceId));

      await logActivity(instanceId, 'completed',
        `Outcome achieved: ${plan.reasoning}`);
      break;
    }

    case 'wait':
    default: {
      // Stay in current state, wait for next event or scheduled tick
      await updateAgentStatus(instanceId, 'executing');
      await logActivity(instanceId, 'waiting',
        nextAction.reason || 'Waiting for external events...');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// System actions — infrastructure changes requested by the planner
// ---------------------------------------------------------------------------

async function processSystemActions(
  instanceId: string,
  orgId: string,
  systemActions: SystemAction[],
): Promise<void> {
  for (const sa of systemActions) {
    try {
      switch (sa.type) {
        case 'create_workspace': {
          const name = (sa.config.name as string) || 'Agent Workspace';
          const ws = await workspaceManager.getOrCreateWorkspaceForInstance(orgId, instanceId, name);
          await db.update(outcomeInstances).set({
            workspaceId: ws.id,
            updatedAt: new Date(),
          } as any).where(eq(outcomeInstances.id, instanceId));
          await logActivity(instanceId, 'executing', `Created workspace: ${name}`, { workspaceId: ws.id });
          break;
        }
        case 'create_tool': {
          const purpose = (sa.config.purpose as string) || 'custom integration';
          const apiHint = sa.config.apiHint as string | undefined;
          const tool = await generateAndRegisterTool(orgId, {
            purpose,
            apiHint,
            outcomeInstanceId: instanceId,
          });
          await logActivity(instanceId, 'executing',
            `${tool.reuseCount > 0 ? 'Reusing' : 'Created'} tool: ${tool.name}`,
            { toolId: tool.id, reused: (tool.reuseCount || 0) > 0 });
          break;
        }
        // Future: set_schedule, create_channel
        default:
          console.log(`[orchestrator] Unknown system action type: ${sa.type}`);
      }
    } catch (err: any) {
      console.error(`[orchestrator] System action ${sa.type} failed:`, err?.message);
      await logActivity(instanceId, 'error', `System action ${sa.type} failed: ${err?.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateAgentStatus(instanceId: string, status: AgentStatus): Promise<void> {
  await db.update(outcomeInstances).set({
    agentStatus: status,
    updatedAt: new Date(),
  }).where(eq(outcomeInstances.id, instanceId));
}

async function logActivity(
  instanceId: string,
  activityType: string,
  summary: string,
  details?: Record<string, unknown>,
  taskId?: string,
): Promise<void> {
  try {
    // Get orgId from instance
    const [inst] = await db.select({ orgId: outcomeInstances.orgId })
      .from(outcomeInstances)
      .where(eq(outcomeInstances.id, instanceId))
      .limit(1);

    if (!inst) return;

    await db.insert(agentActivityLog).values({
      orgId: inst.orgId,
      outcomeInstanceId: instanceId,
      agentTaskId: taskId || undefined,
      activityType,
      summary,
      details: details || undefined,
    } as any);
  } catch (err: any) {
    console.error(`[orchestrator] Failed to log activity:`, err?.message);
  }
}

// ---------------------------------------------------------------------------
// Periodic scheduler for active agent instances
// ---------------------------------------------------------------------------

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startAgentScheduler(): void {
  if (schedulerInterval) return;

  const intervalMs = parseInt(process.env.AGENT_TICK_INTERVAL_MS || '30000', 10);

  schedulerInterval = setInterval(async () => {
    try {
      // Find all agent-enabled instances that are not paused/completed
      const activeInstances = await db.select({ id: outcomeInstances.id })
        .from(outcomeInstances)
        .where(and(
          eq(outcomeInstances.agentEnabled, true),
        ))
        .limit(50); // Process up to 50 per tick

      const runnable = activeInstances.filter(i => true); // all loaded are agent-enabled

      for (const inst of runnable) {
        try {
          await orchestratorTick(inst.id);
        } catch (err: any) {
          console.error(`[agent-scheduler] Tick error for ${inst.id}:`, err?.message);
        }
      }
    } catch (err: any) {
      console.error('[agent-scheduler] Scheduler error:', err?.message);
    }
  }, intervalMs);

  console.log(`[agent-scheduler] Started (interval: ${intervalMs}ms)`);
}

export function stopAgentScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[agent-scheduler] Stopped');
  }
}
