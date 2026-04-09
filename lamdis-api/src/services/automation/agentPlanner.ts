/**
 * Agent Planner
 *
 * LLM-powered task planner that analyzes current outcome state
 * and generates/updates an execution plan. Uses Claude Sonnet via Bedrock.
 */

import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import type { MeterContext } from '../llmCostControl/index.js';

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannerContext {
  outcomeType: {
    name: string;
    description?: string | null;
    successCriteria: Array<{ description: string; weight?: number }>;
    keyDecisions: Array<{ name: string; description?: string; automatable?: boolean }>;
    automationBoundaries: Record<string, unknown>;
    riskClass: string;
  };
  instance: {
    id: string;
    goalDescription: string;
    guidelines: Record<string, unknown>;
    proofStatus: string;
    confidenceScore: number;
    agentStatus: string;
    eventCount: number;
  };
  currentTasks: Array<{
    id: string;
    sequence: number;
    title: string;
    status: string;
    taskType: string;
    actionOutput?: Record<string, unknown> | null;
  }>;
  availableActions: Array<{
    id: string;
    actionId: string;
    title: string;
    description?: string | null;
    method?: string | null;
    inputSchema?: unknown;
    isMock: boolean;
  }>;
  recentEvidence: Array<{
    eventType: string;
    payload: unknown;
    emittedAt: Date;
  }>;
  pendingInputRequests: Array<{
    id: string;
    title: string;
    requestType: string;
    status: string;
  }>;
  recentActionResults: Array<{
    actionId: string | null;
    status: string;
    executionLog?: unknown;
  }>;
  workspace?: {
    exists: boolean;
    workspaceId?: string;
    files?: string[];
    services?: Array<{ name: string; status: string; port?: number }>;
  };
  operationalNotes?: Array<{
    note: string;
    category: 'blocked_source' | 'failed_approach' | 'working_approach' | 'learned';
    tool: string;
    domain?: string;
    createdAt: string;
  }>;
  // Customer-specific playbook context. When present, the planner is
  // constrained to operate inside this playbook: it must use the bound
  // systems, follow the procedure, satisfy required documents, and respect
  // the approval chain. The orchestrator loads this each tick.
  playbook?: {
    name: string;
    version: number;
    summary?: string;
    promptSnippet: string;
    boundConnectorInstanceIds: string[];
    requiredDocumentKeys: string[];
    procedureStepCount: number;
    hasApprovalChain: boolean;
  };
}

export interface PlanUpdate {
  action: 'add' | 'modify' | 'skip' | 'complete';
  taskId?: string; // for modify/skip/complete
  reason?: string; // for complete: what evidence proves it
  task?: {
    title: string;
    description?: string;
    taskType: 'action' | 'input_request' | 'evaluation' | 'planning' | 'wait';
    actionId?: string;
    actionInput?: Record<string, unknown>;
    sequence?: number;
    dependsOn?: string[];
  };
}

export interface NextAction {
  type: 'execute_task' | 'request_input' | 'complete' | 'wait';
  taskId?: string;
  inputRequest?: {
    requestType: 'credentials' | 'images' | 'text' | 'choice' | 'approval' | 'file';
    title: string;
    description: string;
    schema?: Record<string, unknown>;
    priority?: string;
  };
  reason?: string;
}

export interface SystemAction {
  type: 'create_workspace' | 'create_tool' | 'set_schedule' | 'create_channel';
  config: Record<string, unknown>;
}

export interface PlannerResult {
  reasoning: string;
  planUpdates: PlanUpdate[];
  nextAction: NextAction;
  systemActions: SystemAction[];
  progressSummary: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Main planner function
// ---------------------------------------------------------------------------

export async function callPlanner(ctx: PlannerContext, meterContext: MeterContext): Promise<PlannerResult> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(ctx);

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
    maxTokens: 4096,
    temperature: 0.3,
    meterContext: { ...meterContext, serviceKey: 'agentPlanner' },
  });

  return parsePlannerResponse(response);
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are Lamdis, an autonomous agent that drives real-world outcomes to completion.

Your job is to analyze the current state of an outcome, decide what to do next, and produce a structured execution plan.

## Rules
1. Always work toward the user's stated goal while respecting their guidelines.
2. When you need information from the user (photos, credentials, decisions), create an input request — never guess or assume.
3. Prefer parallel execution when tasks are independent.
4. Each action you propose must map to an available action from the action catalog.
5. If no actions are available for what you need, propose an input_request or a wait task.
6. Re-evaluate your plan each time — don't blindly follow stale plans. Skip tasks that are no longer needed.
7. When all success criteria are met, mark the outcome as complete.
8. Keep progress summaries short and factual (1-2 sentences).
9. If you need to write code, run CLI commands, or deploy services — request a workspace via system_actions.
10. If you need an integration that doesn't exist — request a tool be created via system_actions.

## Response Format
You MUST respond with a JSON object (no markdown fences, no extra text) with this exact schema:
{
  "reasoning": "1-3 sentences explaining your analysis",
  "plan_updates": [
    { "action": "add", "task": { "title": "...", "taskType": "action|input_request|wait", "actionId": "...", "actionInput": {}, "sequence": 1 } },
    { "action": "modify", "taskId": "...", "task": { "title": "..." } },
    { "action": "skip", "taskId": "..." },
    { "action": "complete", "taskId": "...", "reason": "facts/evidence proving the task is done (e.g. 'photos already received via Twilio MMS', 'twilio.auth_token present in facts')" }
  ],
  // CRITICAL: When the current facts or recent evidence already prove a planned/in_progress task is satisfied, emit a "complete" plan_update INSTEAD of re-running the work. Examples:
  //   - Task "user provides photos" + facts.listings.photos has filenames → { "action": "complete", "taskId": "...", "reason": "7 photos in workspace from inbound Twilio MMS" }
  //   - Task "configure twilio" + facts.twilio.auth_token + recent evidence shows agent.twilio.sms_sent succeeded → complete
  //   - Task "find X credentials" + facts contain X.* → complete
  "next_action": {
    "type": "execute_task|request_input|complete|wait",
    "task_id": "...",
    "input_request": { "request_type": "...", "title": "...", "description": "...", "schema": {}, "priority": "normal" },
    "reason": "..."
  },
  "system_actions": [
    { "type": "create_workspace", "config": { "name": "..." } },
    { "type": "create_tool", "config": { "purpose": "...", "apiHint": "..." } },
    { "type": "set_schedule", "config": { "intervalMs": 3600000, "type": "adaptive" } },
    { "type": "create_channel", "config": { "medium": "sms", "provider": "twilio" } }
  ],
  "progress_summary": "Short status for the user",
  "confidence": 0.75
}

system_actions are optional infrastructure actions processed before next_action. Use them when you need a workspace, tool, schedule, or communication channel that doesn't exist yet.`;
}

function buildUserPrompt(ctx: PlannerContext): string {
  const parts: string[] = [];

  parts.push(`## Outcome Goal
Name: ${ctx.outcomeType.name}
${ctx.outcomeType.description ? `Description: ${ctx.outcomeType.description}` : ''}
Goal: ${ctx.instance.goalDescription}
Risk class: ${ctx.outcomeType.riskClass}`);

  if (ctx.playbook) {
    parts.push(`## Customer Playbook (BINDING)
${ctx.playbook.promptSnippet}

You MUST stay inside this playbook. Do not invent new systems, document templates, or approver roles. If a step you need is not covered, request input or escalate via system_actions.`);
  }

  if (ctx.instance.guidelines && Object.keys(ctx.instance.guidelines).length > 0) {
    parts.push(`## User Guidelines\n${JSON.stringify(ctx.instance.guidelines, null, 2)}`);
  }

  parts.push(`## Success Criteria\n${ctx.outcomeType.successCriteria.map((c, i) => `${i + 1}. ${c.description}${c.weight ? ` (weight: ${c.weight})` : ''}`).join('\n')}`);

  parts.push(`## Current State
Proof status: ${ctx.instance.proofStatus}
Confidence: ${(ctx.instance.confidenceScore * 100).toFixed(0)}%
Evidence events: ${ctx.instance.eventCount}
Agent status: ${ctx.instance.agentStatus}`);

  if (ctx.currentTasks.length > 0) {
    parts.push(`## Current Plan (${ctx.currentTasks.length} tasks)\n${ctx.currentTasks.map(t =>
      `- [${t.status}] #${t.sequence} ${t.title} (type: ${t.taskType})${t.actionOutput ? ' → has output' : ''}`
    ).join('\n')}`);
  } else {
    parts.push('## Current Plan\nNo tasks yet — create an initial plan.');
  }

  if (ctx.availableActions.length > 0) {
    parts.push(`## Available Actions\n${ctx.availableActions.map(a =>
      `- ${a.actionId}: ${a.title}${a.description ? ` — ${a.description}` : ''}${a.isMock ? ' [MOCK]' : ''} (id: ${a.id})`
    ).join('\n')}`);
  } else {
    parts.push('## Available Actions\nNo actions available. You can only request input or wait.');
  }

  if (ctx.recentEvidence.length > 0) {
    const recent = ctx.recentEvidence.slice(0, 20);
    parts.push(`## Recent Evidence (latest ${recent.length})\n${recent.map(e =>
      `- ${e.eventType}: ${JSON.stringify(e.payload).slice(0, 200)}`
    ).join('\n')}`);
  }

  if (ctx.pendingInputRequests.length > 0) {
    parts.push(`## Pending Input Requests\n${ctx.pendingInputRequests.map(r =>
      `- [${r.status}] ${r.title} (type: ${r.requestType}, id: ${r.id})`
    ).join('\n')}`);
  }

  if (ctx.recentActionResults.length > 0) {
    parts.push(`## Recent Action Results\n${ctx.recentActionResults.map(r =>
      `- ${r.actionId || 'unknown'}: ${r.status}`
    ).join('\n')}`);
  }

  // Workspace context
  if (ctx.workspace) {
    if (ctx.workspace.exists) {
      parts.push(`## Workspace\nYou have a workspace (id: ${ctx.workspace.workspaceId}).`);
      if (ctx.workspace.files && ctx.workspace.files.length > 0) {
        parts.push(`Files:\n${ctx.workspace.files.slice(0, 30).map(f => `- ${f}`).join('\n')}`);
      }
      if (ctx.workspace.services && ctx.workspace.services.length > 0) {
        parts.push(`Running services:\n${ctx.workspace.services.map(s => `- ${s.name} (${s.status}${s.port ? `, port ${s.port}` : ''})`).join('\n')}`);
      }
    } else {
      parts.push('## Workspace\nNo workspace yet. If you need to write code or run commands, include a "create_workspace" system_action.');
    }
  }

  // Operational notes — learnings from tool successes/failures
  if (ctx.operationalNotes && ctx.operationalNotes.length > 0) {
    const blocked = ctx.operationalNotes.filter(n => n.category === 'blocked_source');
    const failed = ctx.operationalNotes.filter(n => n.category === 'failed_approach');
    const working = ctx.operationalNotes.filter(n => n.category === 'working_approach');
    const learned = ctx.operationalNotes.filter(n => n.category === 'learned');

    let notesText = '## Operational Notes (learnings from previous attempts — DO NOT repeat failed approaches)\n';
    if (blocked.length > 0) {
      notesText += 'BLOCKED SOURCES (do NOT plan tasks targeting these):\n';
      blocked.forEach(n => notesText += `- ${n.note}\n`);
    }
    if (failed.length > 0) {
      notesText += 'FAILED APPROACHES:\n';
      failed.forEach(n => notesText += `- ${n.note}\n`);
    }
    if (working.length > 0) {
      notesText += 'WORKING SOURCES (prefer these):\n';
      working.forEach(n => notesText += `- ${n.note}\n`);
    }
    if (learned.length > 0) {
      notesText += 'LEARNED:\n';
      learned.forEach(n => notesText += `- ${n.note}\n`);
    }
    parts.push(notesText);
  }

  parts.push('## Your Decision\nAnalyze the above and respond with your JSON plan. Do NOT create tasks that duplicate existing non-terminal tasks (planned, ready, in_progress, blocked). If a similar task already exists, modify it instead or skip it.');

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parsePlannerResponse(raw: string): PlannerResult {
  // Try to extract JSON from the response
  let json: any;
  try {
    // Try direct parse first
    json = JSON.parse(raw.trim());
  } catch {
    // Try extracting from markdown fences
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      json = JSON.parse(match[1].trim());
    } else {
      // Try finding first { to last }
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end > start) {
        json = JSON.parse(raw.slice(start, end + 1));
      } else {
        throw new Error('Could not parse planner response as JSON');
      }
    }
  }

  return {
    reasoning: json.reasoning || 'No reasoning provided',
    planUpdates: (json.plan_updates || []).map((u: any) => ({
      action: u.action,
      taskId: u.taskId || u.task_id,
      reason: u.reason,
      task: u.task ? {
        title: u.task.title,
        description: u.task.description,
        taskType: u.task.taskType || u.task.task_type,
        actionId: u.task.actionId || u.task.action_id,
        actionInput: u.task.actionInput || u.task.action_input,
        sequence: u.task.sequence,
        dependsOn: u.task.dependsOn || u.task.depends_on,
      } : undefined,
    })),
    nextAction: {
      type: json.next_action?.type || 'wait',
      taskId: json.next_action?.task_id || json.next_action?.taskId,
      inputRequest: json.next_action?.input_request ? {
        requestType: json.next_action.input_request.request_type || json.next_action.input_request.requestType,
        title: json.next_action.input_request.title,
        description: json.next_action.input_request.description,
        schema: json.next_action.input_request.schema,
        priority: json.next_action.input_request.priority,
      } : undefined,
      reason: json.next_action?.reason,
    },
    systemActions: (json.system_actions || json.systemActions || []).map((sa: any) => ({
      type: sa.type,
      config: sa.config || {},
    })),
    progressSummary: json.progress_summary || json.progressSummary || '',
    confidence: json.confidence ?? 0.5,
  };
}
