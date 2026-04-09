/**
 * Proof Evaluator
 *
 * After policy evaluation completes, this service:
 * 1. For each proof expectation on the outcome, evaluates current evidence
 * 2. Computes per-expectation confidence + overall confidence_score
 * 3. Updates outcome_instances.proof_status and confidence_score
 */

import { db } from '../../db.js';
import {
  proofExpectations,
  evidenceEvents,
  outcomeInstances,
} from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { loadPlaybookContextForInstance } from '../playbooks/playbookContext.js';

export interface ProofEvaluationResult {
  instanceId: string;
  proofStatus: 'gathering' | 'partial' | 'sufficient' | 'complete';
  confidenceScore: number;
  perExpectation: Array<{
    expectationId: string;
    name: string;
    met: boolean;
    confidence: number;
    reasoning?: string;
  }>;
}

/**
 * Evaluate proof status for an outcome instance.
 * Called after evaluateInstance() in the event consumer pipeline.
 */
export async function evaluateProof(instanceId: string): Promise<ProofEvaluationResult> {
  // 1. Get the instance
  const [instance] = await db
    .select()
    .from(outcomeInstances)
    .where(eq(outcomeInstances.id, instanceId))
    .limit(1);

  if (!instance || !instance.outcomeTypeId) {
    return {
      instanceId,
      proofStatus: 'gathering',
      confidenceScore: 0,
      perExpectation: [],
    };
  }

  // 2. Get all proof expectations for this outcome type
  const expectations = await db
    .select()
    .from(proofExpectations)
    .where(and(
      eq(proofExpectations.outcomeTypeId, instance.outcomeTypeId),
      eq(proofExpectations.enabled, true),
    ));

  if (expectations.length === 0) {
    return {
      instanceId,
      proofStatus: 'gathering',
      confidenceScore: 0,
      perExpectation: [],
    };
  }

  // 3. Get all evidence events for this instance
  const events = await db
    .select()
    .from(evidenceEvents)
    .where(eq(evidenceEvents.outcomeInstanceId, instanceId))
    .orderBy(evidenceEvents.emittedAt);

  // 4. Evaluate each expectation against evidence
  const checkResults = (instance.checkResults || []) as Array<{ checkId: string; status: string; score?: number; reasoning?: string }>;
  const perExpectation: ProofEvaluationResult['perExpectation'] = [];

  for (const exp of expectations) {
    const checkResult = checkResults.find(cr => cr.checkId === exp.id);
    const threshold = exp.proofThreshold || 0.8;

    let met = false;
    let confidence = 0;
    let reasoning: string | undefined;

    if (checkResult) {
      if (checkResult.status === 'passed') {
        met = true;
        confidence = checkResult.score ?? 1.0;
        reasoning = checkResult.reasoning;
      } else if (checkResult.status === 'failed') {
        met = false;
        confidence = checkResult.score ?? 0;
        reasoning = checkResult.reasoning;
      } else if (checkResult.status === 'skipped') {
        met = false;
        confidence = 0;
        reasoning = 'Insufficient evidence level';
      } else {
        met = false;
        confidence = 0;
        reasoning = `Check status: ${checkResult.status}`;
      }
    } else {
      // No check result yet — still gathering
      confidence = 0;
      reasoning = 'Awaiting evidence';
    }

    // Consider threshold for met status
    if (confidence >= threshold) {
      met = true;
    }

    perExpectation.push({
      expectationId: exp.id,
      name: exp.name,
      met,
      confidence,
      reasoning,
    });
  }

  // 4b. Synthesize implicit expectations from the active playbook's required
  // documents. Each required document becomes an implicit proof gate that is
  // 'met' iff there is at least one evidence event whose payload references
  // the document key (eventType matches `document.<key>` or payload.documentKey).
  const playbook = await loadPlaybookContextForInstance(instanceId);
  if (playbook) {
    for (const req of playbook.documentRequirements) {
      if (!req.required) continue;
      const docEvent = events.find((e) => {
        const payload = (e.payload as Record<string, unknown> | null) ?? {};
        return (
          e.eventType === `document.${req.documentKey}` ||
          payload.documentKey === req.documentKey ||
          payload.documentTemplateId === req.documentTemplateId
        );
      });
      perExpectation.push({
        expectationId: `playbook-doc:${req.id}`,
        name: `Required document: ${req.documentName}`,
        met: !!docEvent,
        confidence: docEvent ? 1.0 : 0,
        reasoning: docEvent ? `Document evidence found (${docEvent.eventType})` : 'No evidence for required document yet',
      });
    }
  }

  // 5. Compute overall proof status and confidence
  const metCount = perExpectation.filter(p => p.met).length;
  const totalCount = perExpectation.length;
  const overallConfidence = totalCount > 0
    ? perExpectation.reduce((sum, p) => sum + p.confidence, 0) / totalCount
    : 0;

  let proofStatus: ProofEvaluationResult['proofStatus'];
  if (metCount === 0 && events.length === 0) {
    proofStatus = 'gathering';
  } else if (metCount === 0) {
    proofStatus = 'gathering';
  } else if (metCount < totalCount) {
    proofStatus = 'partial';
  } else if (overallConfidence >= 0.9) {
    proofStatus = 'complete';
  } else {
    proofStatus = 'sufficient';
  }

  // 6. Update the instance
  await db
    .update(outcomeInstances)
    .set({
      confidenceScore: Math.round(overallConfidence * 1000) / 1000,
      proofStatus,
      updatedAt: new Date(),
    })
    .where(eq(outcomeInstances.id, instanceId));

  return {
    instanceId,
    proofStatus,
    confidenceScore: overallConfidence,
    perExpectation,
  };
}
