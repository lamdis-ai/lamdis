/**
 * Policy Evaluator (Proof Evaluator)
 *
 * When events arrive for an outcome instance, this service:
 * 1. Fetches all proof_expectations for the matched outcome type
 * 2. Fetches all evidence_events for the instance
 * 3. Evaluates each check using the shared check evaluator
 * 4. Updates the outcome_instance with check results and status
 * 5. Fires onPass/onFail actions (webhooks, flag_for_review)
 */

import { db } from '../db.js';
import {
  proofExpectations,
  evidenceEvents,
  outcomeInstances,
  outcomeTypes,
  type CheckResult,
} from '@lamdis/db/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { evaluateCheck, type EvidenceEvent } from './intelligence/checkEvaluator.js';
import { compareConfirmationLevels } from './confirmationLevelResolver.js';
import { getPlaybookDocumentChecks, type VirtualProofExpectation } from './playbooks/playbookEnforcement.js';

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate all proof expectations for an outcome instance.
 * Called after events are correlated to an instance.
 */
export async function evaluateInstance(instanceId: string): Promise<{
  status: string;
  checkResults: CheckResult[];
  totals: { passed: number; failed: number; skipped: number; error: number };
}> {
  // 1. Get the instance
  const [instance] = await db
    .select()
    .from(outcomeInstances)
    .where(eq(outcomeInstances.id, instanceId))
    .limit(1);

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found`);
  }

  // 2. Resolve the outcome type's category id (for category-scoped policies)
  let outcomeTypeCategoryId: string | null = null;
  if (instance.outcomeTypeId) {
    const [ot] = await db
      .select({ categoryId: outcomeTypes.categoryId })
      .from(outcomeTypes)
      .where(eq(outcomeTypes.id, instance.outcomeTypeId))
      .limit(1);
    outcomeTypeCategoryId = ot?.categoryId ?? null;
  }

  // 3. Load proof expectations across all four scopes that apply to this
  // instance: global rules + outcome-type rules + active-playbook rules +
  // category rules. Each scope is gated on its own ref column being set.
  const scopeConditions = [
    // global: matches any instance in this org
    eq(proofExpectations.scope, 'global'),
    // outcome_type: only when the instance has an outcome type
    instance.outcomeTypeId
      ? and(
          eq(proofExpectations.scope, 'outcome_type'),
          eq(proofExpectations.outcomeTypeId, instance.outcomeTypeId),
        )
      : sql`false`,
    // playbook: only when the instance has an active playbook
    instance.activePlaybookId
      ? and(
          eq(proofExpectations.scope, 'playbook'),
          eq(proofExpectations.playbookId, instance.activePlaybookId),
        )
      : sql`false`,
    // category: only when the outcome type has a category
    outcomeTypeCategoryId
      ? and(
          eq(proofExpectations.scope, 'category'),
          eq(proofExpectations.categoryId, outcomeTypeCategoryId),
        )
      : sql`false`,
  ];

  const dbChecks = await db
    .select()
    .from(proofExpectations)
    .where(and(
      eq(proofExpectations.orgId, instance.orgId),
      eq(proofExpectations.enabled, true),
      or(...scopeConditions),
    ));

  // 4. Add virtual checks for playbook document requirements (no DB row,
  // computed at evaluation time from playbook_document_requirements).
  const virtualChecks: VirtualProofExpectation[] = await getPlaybookDocumentChecks(instanceId);

  // Merged check list. Virtual checks share the same evaluation flow.
  const checks: Array<typeof dbChecks[number] | VirtualProofExpectation> = [
    ...dbChecks,
    ...virtualChecks,
  ];

  if (checks.length === 0) {
    return {
      status: 'open',
      checkResults: [],
      totals: { passed: 0, failed: 0, skipped: 0, error: 0 },
    };
  }

  // 3. Get all events for this instance
  const events = await db
    .select()
    .from(evidenceEvents)
    .where(eq(evidenceEvents.outcomeInstanceId, instanceId))
    .orderBy(evidenceEvents.emittedAt);

  const eventList: EvidenceEvent[] = events.map(e => ({
    id: e.id,
    eventType: e.eventType,
    payload: e.payload as Record<string, unknown>,
    confirmationLevel: e.confirmationLevel || undefined,
    emittedAt: e.emittedAt.toISOString(),
    sequenceNumber: e.sequenceNumber || undefined,
    eventSource: e.eventSource || undefined,
  }));

  // 4. Evaluate each check
  const checkResults: CheckResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errorCount = 0;

  for (const check of checks) {
    // Check if the instance has sufficient confirmation level for this check
    const requiredLevel = check.requiredEvidenceLevel || 'A';
    const instanceLevel = instance.highestConfirmationLevel || 'A';

    if (compareConfirmationLevels(instanceLevel, requiredLevel) < 0) {
      // Insufficient evidence level — skip this check
      checkResults.push({
        checkId: check.id,
        checkName: check.name,
        status: 'skipped',
        reasoning: `Requires confirmation level ${requiredLevel}, instance has ${instanceLevel}`,
        evidenceLevel: instanceLevel,
      });
      skipped++;
      continue;
    }

    // Check environment filter
    const appliesTo = check.appliesTo as { environments?: string[]; eventTypes?: string[] } | null;
    if (appliesTo?.environments && !appliesTo.environments.includes(instance.environment || 'production')) {
      checkResults.push({
        checkId: check.id,
        checkName: check.name,
        status: 'skipped',
        reasoning: `Check does not apply to environment "${instance.environment}"`,
      });
      skipped++;
      continue;
    }

    try {
      const startTime = Date.now();
      const config = (check.config || {}) as Record<string, unknown>;

      // Filter events per check based on appliesTo.eventTypes
      const contentCheckTypes = new Set(['judge', 'includes', 'regex', 'json_path']);
      const targetEventTypes = appliesTo?.eventTypes;
      const shouldFilter = contentCheckTypes.has(check.checkType)
        && targetEventTypes && targetEventTypes.length > 0;
      const relevantEvents = shouldFilter
        ? eventList.filter(e => targetEventTypes.includes(e.eventType))
        : eventList;

      const result = await evaluateCheck(
        check.checkType,
        config,
        // For content-based checks, pass the relevant event payloads as data
        relevantEvents.map(e => e.payload),
        relevantEvents,
        {
          orgId: instance.orgId,
          serviceKey: 'policyEvaluator',
          outcomeInstanceId: instance.id,
          outcomeTypeId: instance.outcomeTypeId ?? undefined,
        },
        check.judgeThreshold || 0.75,
      );

      const checkResult: CheckResult = {
        checkId: check.id,
        checkName: check.name,
        status: result.pass ? 'passed' : 'failed',
        score: result.score,
        reasoning: result.reasoning,
        evidenceLevel: instanceLevel,
        evaluatedAt: new Date().toISOString(),
        latencyMs: result.latencyMs,
      };

      checkResults.push(checkResult);

      if (result.pass) {
        passed++;
      } else {
        // Only count as failure if severity is critical or error
        if (check.severity === 'critical' || check.severity === 'error' || !check.severity) {
          failed++;
        } else {
          // Warning/info checks don't cause overall failure
          passed++;
        }
      }
    } catch (err: any) {
      checkResults.push({
        checkId: check.id,
        checkName: check.name,
        status: 'error',
        reasoning: `Evaluation error: ${err?.message}`,
        evaluatedAt: new Date().toISOString(),
      });
      errorCount++;
    }
  }

  // 5. Determine overall status
  const status = failed > 0 || errorCount > 0
    ? 'failed'
    : skipped === checks.length
      ? 'open' // All checks skipped — not enough evidence yet
      : 'passed';

  const totals = { passed, failed, skipped, error: errorCount };

  // 6. Update the instance
  const shouldFlagForReview = checkResults.some(cr => {
    if (cr.status === 'failed') {
      const checkDef = checks.find(c => c.id === cr.checkId);
      const onFail = (checkDef?.onFail || []) as Array<{ type: string }>;
      return onFail.some(a => a.type === 'flag_for_review');
    }
    return false;
  });

  await db
    .update(outcomeInstances)
    .set({
      status: status === 'open' ? 'open' : (status === 'passed' ? 'passed' : 'failed'),
      checkResults,
      totals,
      evaluatedAt: new Date(),
      reviewStatus: shouldFlagForReview ? 'pending_review' : undefined,
      updatedAt: new Date(),
    })
    .where(eq(outcomeInstances.id, instanceId));

  return { status, checkResults, totals };
}
