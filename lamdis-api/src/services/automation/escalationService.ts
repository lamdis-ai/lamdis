/**
 * Escalation Service
 *
 * Runs periodically or on-event to:
 * 1. Find outcome instances open longer than timeoutMs → mark stalled
 * 2. Check for conflicting evidence or missing required proof
 * 3. Apply escalation policies from decision boundaries
 * 4. Create attention-required items
 */

import { db } from '../../db.js';
import {
  outcomeTypes,
  outcomeInstances,
  decisionBoundaries,
} from '@lamdis/db/schema';
import { eq, and, lte, isNull, sql } from 'drizzle-orm';
import { approvalChainService } from '../approvals/approvalChainService.js';

export interface EscalationResult {
  stalledCount: number;
  escalatedCount: number;
}

/**
 * Check for stalled or escalation-worthy instances across an org.
 */
export async function checkEscalations(orgId: string): Promise<EscalationResult> {
  const result: EscalationResult = { stalledCount: 0, escalatedCount: 0 };

  // 1. Find instances that have been open beyond their outcome type's timeout
  const openInstances = await db
    .select({
      instanceId: outcomeInstances.id,
      outcomeTypeId: outcomeInstances.outcomeTypeId,
      createdAt: outcomeInstances.createdAt,
      lastEventAt: outcomeInstances.lastEventAt,
      stalledSince: outcomeInstances.stalledSince,
      proofStatus: outcomeInstances.proofStatus,
      automationMode: outcomeInstances.automationMode,
    })
    .from(outcomeInstances)
    .where(and(
      eq(outcomeInstances.orgId, orgId),
      eq(outcomeInstances.status, 'open'),
      isNull(outcomeInstances.stalledSince),
    ));

  // 2. For each open instance, check if it's stalled
  for (const inst of openInstances) {
    if (!inst.outcomeTypeId) continue;

    // Get the outcome type timeout
    const [outcomeType] = await db
      .select({ timeoutMs: outcomeTypes.timeoutMs })
      .from(outcomeTypes)
      .where(eq(outcomeTypes.id, inst.outcomeTypeId))
      .limit(1);

    if (!outcomeType) continue;

    const timeoutMs = outcomeType.timeoutMs || 1800000; // Default 30 min
    const lastActivity = inst.lastEventAt || inst.createdAt;
    const elapsed = Date.now() - new Date(lastActivity).getTime();

    if (elapsed > timeoutMs) {
      // Mark as stalled
      await db
        .update(outcomeInstances)
        .set({
          stalledSince: new Date(),
          escalationReason: `No events received for ${Math.round(elapsed / 60000)} minutes (timeout: ${Math.round(timeoutMs / 60000)}m)`,
          automationMode: 'waiting',
          updatedAt: new Date(),
        })
        .where(eq(outcomeInstances.id, inst.instanceId));

      result.stalledCount++;
    }
  }

  // 3. Check for instances with conflicting evidence (proof_status = 'partial' for too long)
  const partialInstances = await db
    .select({
      id: outcomeInstances.id,
      proofStatus: outcomeInstances.proofStatus,
      confidenceScore: outcomeInstances.confidenceScore,
      createdAt: outcomeInstances.createdAt,
    })
    .from(outcomeInstances)
    .where(and(
      eq(outcomeInstances.orgId, orgId),
      eq(outcomeInstances.status, 'open'),
      eq(outcomeInstances.proofStatus, 'partial'),
      isNull(outcomeInstances.escalationReason),
    ));

  for (const inst of partialInstances) {
    const age = Date.now() - new Date(inst.createdAt).getTime();
    // If partial for more than 1 hour and confidence is low, escalate
    if (age > 3600000 && (inst.confidenceScore || 0) < 0.5) {
      await db
        .update(outcomeInstances)
        .set({
          escalationReason: `Low confidence (${((inst.confidenceScore || 0) * 100).toFixed(0)}%) after ${Math.round(age / 60000)} minutes with partial proof`,
          automationMode: 'waiting',
          updatedAt: new Date(),
        })
        .where(eq(outcomeInstances.id, inst.id));

      result.escalatedCount++;
    }
  }

  return result;
}

/**
 * Run escalation checks for all orgs. Called periodically.
 */
export async function runGlobalEscalationCheck(): Promise<void> {
  // Get distinct orgIds from open instances
  const orgs = await db
    .selectDistinct({ orgId: outcomeInstances.orgId })
    .from(outcomeInstances)
    .where(eq(outcomeInstances.status, 'open'));

  for (const { orgId } of orgs) {
    try {
      const result = await checkEscalations(orgId);
      if (result.stalledCount > 0 || result.escalatedCount > 0) {
        console.log(`[escalation] Org ${orgId.slice(0, 8)}...: ${result.stalledCount} stalled, ${result.escalatedCount} escalated`);
      }
    } catch (err: any) {
      console.error(`[escalation] Error for org ${orgId}:`, err?.message);
    }
  }

  // Approval chain step escalations (timeouts → fallback role).
  try {
    const chain = await approvalChainService.escalateOverdue();
    if (chain.escalated > 0) {
      console.log(`[escalation] approval chain steps escalated: ${chain.escalated}`);
    }
  } catch (err: any) {
    console.error('[escalation] approval chain escalation error:', err?.message);
  }
}
