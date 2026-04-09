/**
 * Approval Chain Service
 *
 * Owns the lifecycle of an approval chain run: starting a chain for a
 * proposed action, opening input requests for the current step, recording
 * decisions, advancing to the next step, and handling escalation.
 *
 * Step semantics:
 *   - serial: one approver from the role must approve before advancing.
 *   - parallel + unanimous (default): all members must approve.
 *   - parallel + quorum(N): N approvals required.
 *   - parallel + first_responder: first decision (approve or reject) wins.
 */

import { db } from '../../db.js';
import {
  approvalChains,
  approvalChainRuns,
  actionExecutions,
  inputRequests,
  type ApprovalChainStep,
} from '@lamdis/db/schema';
import { and, eq } from 'drizzle-orm';
import { approverDirectoryResolver } from './approverDirectoryResolver.js';

// Lazy import to avoid a circular module init between approvals and automation.
async function executeApprovedAction(actionExecutionId: string) {
  const { executeAction } = await import('../automation/actionExecutor.js');
  return executeAction(actionExecutionId);
}

export interface StartChainInput {
  orgId: string;
  chainId: string;
  outcomeInstanceId: string;
  actionExecutionId?: string;
  reason?: string;
}

export interface AdvanceInput {
  orgId: string;
  inputRequestId: string;
  decision: 'approved' | 'rejected';
  userSub: string;
  notes?: string;
}

export type ChainRunStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'escalated' | 'cancelled';

interface StepStateEntry {
  stepIndex: number;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'escalated';
  decisions: Array<{ userSub: string; decision: 'approved' | 'rejected'; at: string; notes?: string }>;
  inputRequestIds: string[];
  startedAt?: string;
  completedAt?: string;
}

async function loadChain(chainId: string) {
  const [row] = await db.select().from(approvalChains).where(eq(approvalChains.id, chainId)).limit(1);
  if (!row) throw new Error(`approval chain not found: ${chainId}`);
  const steps = (row.steps ?? []) as ApprovalChainStep[];
  return { chain: row, steps };
}

function evaluateStep(step: ApprovalChainStep, state: StepStateEntry, totalMembers: number): StepStateEntry['status'] {
  const approvals = state.decisions.filter((d) => d.decision === 'approved').length;
  const rejections = state.decisions.filter((d) => d.decision === 'rejected').length;

  if (step.mode === 'serial') {
    if (approvals >= 1) return 'approved';
    if (rejections >= 1) return 'rejected';
    return 'in_progress';
  }

  const parallelMode = step.parallelMode ?? 'unanimous';
  if (parallelMode === 'first_responder') {
    if (approvals >= 1) return 'approved';
    if (rejections >= 1) return 'rejected';
    return 'in_progress';
  }
  if (parallelMode === 'quorum') {
    const required = step.quorumCount ?? Math.ceil(totalMembers / 2);
    if (approvals >= required) return 'approved';
    // If too many rejections to ever hit the quorum, fail fast.
    if (totalMembers - rejections < required) return 'rejected';
    return 'in_progress';
  }
  // unanimous
  if (rejections >= 1) return 'rejected';
  if (approvals >= totalMembers && totalMembers > 0) return 'approved';
  return 'in_progress';
}

async function openInputRequestsForStep(opts: {
  orgId: string;
  outcomeInstanceId: string;
  chainRunId: string;
  stepIndex: number;
  step: ApprovalChainStep;
  reason?: string;
}): Promise<{ ids: string[]; memberCount: number }> {
  const members = await approverDirectoryResolver.resolve(opts.orgId, opts.step.roleId);
  if (members.length === 0) return { ids: [], memberCount: 0 };

  // For 'serial' and 'first_responder' we still open one request per member;
  // the first decision short-circuits the step. For 'unanimous'/'quorum' the
  // count is intentional.
  const ids: string[] = [];
  for (const m of members) {
    const [row] = await db.insert(inputRequests).values({
      orgId: opts.orgId,
      outcomeInstanceId: opts.outcomeInstanceId,
      requestType: 'approval',
      title: `Approval required (step ${opts.stepIndex + 1})`,
      description: opts.reason ?? `Approval needed from role ${opts.step.roleId}`,
      schema: { approverUserSub: m.userSub, approverEmail: m.email, approverName: m.name },
      status: 'pending',
      priority: 'high',
      approvalChainRunId: opts.chainRunId,
      chainStepIndex: opts.stepIndex,
      approverRoleId: opts.step.roleId,
    }).returning({ id: inputRequests.id });
    if (row) ids.push(row.id);
  }
  return { ids, memberCount: members.length };
}

export const approvalChainService = {
  async start(input: StartChainInput): Promise<{ runId: string; status: ChainRunStatus }> {
    const { chain, steps } = await loadChain(input.chainId);

    const [run] = await db
      .insert(approvalChainRuns)
      .values({
        orgId: input.orgId,
        chainId: chain.id,
        outcomeInstanceId: input.outcomeInstanceId,
        actionExecutionId: input.actionExecutionId,
        currentStepIndex: 0,
        status: 'in_progress',
        stepState: [],
      })
      .returning();
    if (!run) throw new Error('failed to create approval chain run');

    if (steps.length === 0) {
      await db.update(approvalChainRuns).set({ status: 'approved', completedAt: new Date() }).where(eq(approvalChainRuns.id, run.id));
      return { runId: run.id, status: 'approved' };
    }

    const firstStep = steps[0]!;
    const opened = await openInputRequestsForStep({
      orgId: input.orgId,
      outcomeInstanceId: input.outcomeInstanceId,
      chainRunId: run.id,
      stepIndex: 0,
      step: firstStep,
      reason: input.reason,
    });

    const initialState: StepStateEntry = {
      stepIndex: 0,
      status: 'in_progress',
      decisions: [],
      inputRequestIds: opened.ids,
      startedAt: new Date().toISOString(),
    };
    await db
      .update(approvalChainRuns)
      .set({ stepState: [initialState], updatedAt: new Date() })
      .where(eq(approvalChainRuns.id, run.id));

    return { runId: run.id, status: 'in_progress' };
  },

  async advance(input: AdvanceInput): Promise<{ runId: string; status: ChainRunStatus }> {
    const [request] = await db
      .select()
      .from(inputRequests)
      .where(and(eq(inputRequests.orgId, input.orgId), eq(inputRequests.id, input.inputRequestId)))
      .limit(1);
    if (!request || !request.approvalChainRunId) {
      throw new Error('input request is not part of an approval chain');
    }

    const [run] = await db
      .select()
      .from(approvalChainRuns)
      .where(eq(approvalChainRuns.id, request.approvalChainRunId))
      .limit(1);
    if (!run) throw new Error('approval chain run not found');

    const { steps } = await loadChain(run.chainId);
    const stepIndex = request.chainStepIndex ?? run.currentStepIndex ?? 0;
    const step = steps[stepIndex];
    if (!step) throw new Error('chain step out of range');

    const stepStates: StepStateEntry[] = (run.stepState as StepStateEntry[] | null) ?? [];
    const current = stepStates.find((s) => s.stepIndex === stepIndex);
    if (!current) throw new Error('step state missing');

    current.decisions.push({
      userSub: input.userSub,
      decision: input.decision,
      at: new Date().toISOString(),
      notes: input.notes,
    });

    // Mark this input request fulfilled.
    await db
      .update(inputRequests)
      .set({
        status: 'fulfilled',
        response: { decision: input.decision, notes: input.notes },
        respondedBy: input.userSub,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inputRequests.id, input.inputRequestId));

    const totalMembers = current.inputRequestIds.length || 1;
    const newStepStatus = evaluateStep(step, current, totalMembers);
    current.status = newStepStatus;
    if (newStepStatus !== 'in_progress') current.completedAt = new Date().toISOString();

    let runStatus: ChainRunStatus = 'in_progress';
    let nextIndex = stepIndex;

    if (newStepStatus === 'rejected') {
      runStatus = 'rejected';
    } else if (newStepStatus === 'approved') {
      if (stepIndex + 1 >= steps.length) {
        runStatus = 'approved';
      } else {
        nextIndex = stepIndex + 1;
        const nextStep = steps[nextIndex]!;
        const opened = await openInputRequestsForStep({
          orgId: input.orgId,
          outcomeInstanceId: run.outcomeInstanceId ?? '',
          chainRunId: run.id,
          stepIndex: nextIndex,
          step: nextStep,
        });
        stepStates.push({
          stepIndex: nextIndex,
          status: 'in_progress',
          decisions: [],
          inputRequestIds: opened.ids,
          startedAt: new Date().toISOString(),
        });
      }
    }

    await db
      .update(approvalChainRuns)
      .set({
        stepState: stepStates,
        currentStepIndex: nextIndex,
        status: runStatus,
        completedAt: runStatus === 'approved' || runStatus === 'rejected' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(approvalChainRuns.id, run.id));

    // Resolve the gated action execution.
    if (run.actionExecutionId && (runStatus === 'approved' || runStatus === 'rejected')) {
      if (runStatus === 'approved') {
        await db
          .update(actionExecutions)
          .set({
            status: 'approved',
            approval: { approvedBy: input.userSub, approvedAt: new Date().toISOString(), method: 'chain' },
            updatedAt: new Date(),
          })
          .where(eq(actionExecutions.id, run.actionExecutionId));
        // Fire and forget — executor handles its own error reporting.
        void executeApprovedAction(run.actionExecutionId);
      } else {
        await db
          .update(actionExecutions)
          .set({
            status: 'blocked',
            blockedReason: 'Approval chain rejected',
            updatedAt: new Date(),
          })
          .where(eq(actionExecutions.id, run.actionExecutionId));
      }
    }

    return { runId: run.id, status: runStatus };
  },

  /**
   * Cron-driven escalation pass. For each in-flight chain run, checks the
   * current step's escalationAfterMins and either re-opens requests against
   * the fallback role or marks the run escalated.
   */
  async escalateOverdue(now: Date = new Date()): Promise<{ escalated: number }> {
    const runs = await db
      .select()
      .from(approvalChainRuns)
      .where(eq(approvalChainRuns.status, 'in_progress'));
    let escalated = 0;
    for (const run of runs) {
      const { steps } = await loadChain(run.chainId);
      const stepStates = (run.stepState as StepStateEntry[] | null) ?? [];
      const current = stepStates.find((s) => s.stepIndex === (run.currentStepIndex ?? 0));
      const step = steps[run.currentStepIndex ?? 0];
      if (!current || !step || !step.escalationAfterMins || !current.startedAt) continue;
      const startedAt = new Date(current.startedAt).getTime();
      if (now.getTime() - startedAt < step.escalationAfterMins * 60_000) continue;

      // Open requests against the fallback role if defined; otherwise mark escalated.
      const fallbackRoleId = step.fallbackRoleId ?? null;
      if (!fallbackRoleId) {
        await db
          .update(approvalChainRuns)
          .set({ status: 'escalated', updatedAt: new Date() })
          .where(eq(approvalChainRuns.id, run.id));
        escalated++;
        continue;
      }
      const opened = await openInputRequestsForStep({
        orgId: run.orgId,
        outcomeInstanceId: run.outcomeInstanceId ?? '',
        chainRunId: run.id,
        stepIndex: current.stepIndex,
        step: { ...step, roleId: fallbackRoleId },
        reason: 'Escalated to fallback role after timeout',
      });
      current.inputRequestIds.push(...opened.ids);
      await db
        .update(approvalChainRuns)
        .set({ stepState: stepStates, updatedAt: new Date() })
        .where(eq(approvalChainRuns.id, run.id));
      escalated++;
    }
    return { escalated };
  },
};
