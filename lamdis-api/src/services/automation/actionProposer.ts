/**
 * Action Proposer
 *
 * Called when proof_status changes. Checks outcome's key_decisions
 * and automation_boundaries, then proposes or executes actions.
 */

import { db } from '../../db.js';
import {
  outcomeTypes,
  outcomeInstances,
  decisionBoundaries,
  actionExecutions,
} from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { loadPlaybookContextForInstance } from '../playbooks/playbookContext.js';
import { approvalChainService } from '../approvals/approvalChainService.js';

export interface ActionProposalResult {
  instanceId: string;
  proposed: number;
  autoExecuted: number;
  blocked: number;
}

/**
 * Propose actions based on current proof status and automation boundaries.
 */
export async function proposeActions(instanceId: string): Promise<ActionProposalResult> {
  const result: ActionProposalResult = {
    instanceId,
    proposed: 0,
    autoExecuted: 0,
    blocked: 0,
  };

  // 1. Get the instance with its outcome type
  const [instance] = await db
    .select()
    .from(outcomeInstances)
    .where(eq(outcomeInstances.id, instanceId))
    .limit(1);

  if (!instance || !instance.outcomeTypeId) return result;

  // 2. Get the outcome type definition
  const [outcomeType] = await db
    .select()
    .from(outcomeTypes)
    .where(eq(outcomeTypes.id, instance.outcomeTypeId))
    .limit(1);

  if (!outcomeType) return result;

  // Load the active playbook (if any). When present, the playbook's
  // procedure steps and approval chain take precedence: any decision tied
  // to a step that requires approval is gated through approvalChainService
  // instead of being marked auto-executable.
  const playbook = await loadPlaybookContextForInstance(instanceId);
  const playbookRequiresApproval =
    !!playbook?.approvalChainId ||
    (playbook?.procedureSteps ?? []).some((s) => s.requiresApproval);

  const proofStatus = instance.proofStatus || 'gathering';
  const confidenceScore = instance.confidenceScore || 0;
  const keyDecisions = (outcomeType.keyDecisions || []) as Array<{
    name: string;
    description?: string;
    automatable?: boolean;
    actionId?: string;
  }>;
  const automationBounds = (outcomeType.automationBoundaries || {}) as {
    maxAutoApproveRisk?: string;
    requireHumanAbove?: number;
    allowedAutoActions?: string[];
  };

  // Only propose actions when proof is at least partial
  if (proofStatus === 'gathering') return result;

  // 3. Get applicable decision boundaries for this org
  const boundaries = await db
    .select()
    .from(decisionBoundaries)
    .where(eq(decisionBoundaries.orgId, instance.orgId));

  // 4. For each key decision that's automatable, evaluate whether to propose/execute/block
  for (const decision of keyDecisions) {
    if (!decision.automatable) continue;

    const riskClass = outcomeType.riskClass || 'standard';
    const requireHumanThreshold = automationBounds.requireHumanAbove ?? 0.95;

    // Check if action is within allowed auto-actions
    const isAllowedAuto = !automationBounds.allowedAutoActions
      || automationBounds.allowedAutoActions.length === 0
      || (decision.actionId && automationBounds.allowedAutoActions.includes(decision.actionId));

    // Check risk-based auto-approval
    const riskOrder = ['low', 'standard', 'high', 'critical'];
    const maxAutoRisk = automationBounds.maxAutoApproveRisk || 'standard';
    const canAutoApprove = riskOrder.indexOf(riskClass) <= riskOrder.indexOf(maxAutoRisk);

    // Check boundary constraints
    const relevantBoundary = boundaries.find(b => !b.requiresHumanApproval && b.autoExecute);
    const boundaryAllowsAuto = !!relevantBoundary || canAutoApprove;

    // Determine action status
    let status: string;
    let blockedReason: string | undefined;

    if (playbookRequiresApproval) {
      // Playbook gates this action behind an approval chain. Mark the
      // execution as awaiting_approval; approvalChainService.advance() will
      // flip it to 'executing' once the chain resolves.
      status = 'awaiting_approval';
      blockedReason = 'Awaiting approval chain';
      result.blocked++;
    } else if (confidenceScore >= requireHumanThreshold) {
      // Very high confidence — needs human review regardless
      status = 'proposed';
    } else if (proofStatus === 'sufficient' && isAllowedAuto && boundaryAllowsAuto && canAutoApprove) {
      // Auto-execute: proof sufficient, within boundaries, low risk
      status = 'executing';
      result.autoExecuted++;
    } else if (proofStatus === 'partial') {
      // Insufficient proof — block until more evidence
      status = 'blocked';
      blockedReason = `Proof status is '${proofStatus}', confidence: ${(confidenceScore * 100).toFixed(0)}%`;
      result.blocked++;
    } else {
      // Default: propose for human review
      status = 'proposed';
      result.proposed++;
    }

    // 5. Create action execution record
    const [exec] = await db.insert(actionExecutions).values({
      orgId: instance.orgId,
      outcomeInstanceId: instanceId,
      actionId: decision.actionId || undefined,
      proposedBy: 'system',
      evidenceSnapshot: {
        proofStatus,
        confidenceScore,
        eventCount: instance.eventCount,
        checkResults: instance.checkResults,
      },
      proofThresholdMet: proofStatus === 'sufficient' || proofStatus === 'complete',
      riskClass,
      status,
      blockedReason,
      startedAt: status === 'executing' ? new Date() : undefined,
    } as any).returning();

    // If gated by playbook, kick off the approval chain run.
    if (status === 'awaiting_approval' && playbook?.approvalChainId && exec) {
      try {
        await approvalChainService.start({
          orgId: instance.orgId,
          chainId: playbook.approvalChainId,
          outcomeInstanceId: instanceId,
          actionExecutionId: exec.id,
          reason: `Approval required for ${decision.name}`,
        });
      } catch (err) {
        // Don't fail the proposer pass if the chain can't start; the execution
        // remains in awaiting_approval and will be retried on the next tick.
        console.error('approvalChainService.start failed', err);
      }
    }

    // Update instance automation mode
    const automationMode = status === 'executing' ? 'auto'
      : status === 'proposed' ? 'waiting'
      : 'manual';

    await db
      .update(outcomeInstances)
      .set({
        automationMode,
        nextLikelyAction: {
          actionId: decision.actionId,
          name: decision.name,
          confidence: confidenceScore,
        },
        updatedAt: new Date(),
      })
      .where(eq(outcomeInstances.id, instanceId));
  }

  return result;
}
