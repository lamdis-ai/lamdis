/**
 * Dossier Generator
 *
 * Called on every significant decision to record the reasoning chain.
 * Snapshots facts known at decision time, evidence IDs considered,
 * proof chain, confidence score, and boundary applied.
 */

import { db } from '../../db.js';
import {
  decisionDossiers,
  evidenceEvents,
  outcomeInstances,
  proofExpectations,
} from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ProofEvaluationResult } from './proofEvaluator.js';
import type { ActionProposalResult } from './actionProposer.js';

/**
 * Record a dossier if the evaluation produced a significant result.
 * "Significant" = status changed, confidence crossed a threshold, or action was proposed.
 */
export async function recordIfSignificant(
  instanceId: string,
  evaluationResult: { status: string; totals: { passed: number; failed: number } },
  proofResult?: ProofEvaluationResult,
  actionResult?: ActionProposalResult,
): Promise<void> {
  // Only record if something meaningful happened
  const isStatusChange = evaluationResult.status !== 'open';
  const hasProofProgress = proofResult && proofResult.proofStatus !== 'gathering';
  const hasActions = actionResult && (actionResult.proposed > 0 || actionResult.autoExecuted > 0 || actionResult.blocked > 0);

  if (!isStatusChange && !hasProofProgress && !hasActions) {
    return; // Not significant enough to record
  }

  // Get instance details
  const [instance] = await db
    .select()
    .from(outcomeInstances)
    .where(eq(outcomeInstances.id, instanceId))
    .limit(1);

  if (!instance) return;

  // Get evidence IDs for this instance
  const events = await db
    .select({ id: evidenceEvents.id, eventType: evidenceEvents.eventType })
    .from(evidenceEvents)
    .where(eq(evidenceEvents.outcomeInstanceId, instanceId))
    .orderBy(evidenceEvents.emittedAt);

  const evidenceIds = events.map(e => e.id);

  // Build proof chain from proofResult
  const proofChain = proofResult?.perExpectation.map(pe => ({
    expectationId: pe.expectationId,
    met: pe.met,
    confidence: pe.confidence,
    reasoning: pe.reasoning,
  })) || [];

  // Determine decision type
  let decisionType: string;
  let summary: string;

  if (hasActions && actionResult!.autoExecuted > 0) {
    decisionType = 'auto_executed';
    summary = `Auto-executed ${actionResult!.autoExecuted} action(s) based on sufficient proof (confidence: ${((proofResult?.confidenceScore || 0) * 100).toFixed(0)}%)`;
  } else if (hasActions && actionResult!.proposed > 0) {
    decisionType = 'action_proposed';
    summary = `Proposed ${actionResult!.proposed} action(s) for human review (confidence: ${((proofResult?.confidenceScore || 0) * 100).toFixed(0)}%)`;
  } else if (hasActions && actionResult!.blocked > 0) {
    decisionType = 'action_blocked';
    summary = `Blocked ${actionResult!.blocked} action(s) due to insufficient proof`;
  } else if (evaluationResult.status === 'failed') {
    decisionType = 'proof_evaluation';
    summary = `Proof evaluation failed: ${evaluationResult.totals.failed} expectation(s) not met`;
  } else if (evaluationResult.status === 'passed') {
    decisionType = 'proof_evaluation';
    summary = `All proof expectations met: ${evaluationResult.totals.passed} passed`;
  } else {
    decisionType = 'proof_evaluation';
    summary = `Proof evaluation in progress: ${proofResult?.proofStatus || 'gathering'}`;
  }

  // Build facts considered
  const factsConsidered = events.map(e => ({
    fact: `Event: ${e.eventType}`,
    source: 'evidence_event',
  }));

  // Insert the dossier
  await db.insert(decisionDossiers).values({
    orgId: instance.orgId,
    outcomeInstanceId: instanceId,
    decisionType,
    summary,
    factsConsidered,
    evidenceIds,
    proofChain,
    confidenceScore: proofResult?.confidenceScore || 0,
    riskAssessment: {
      level: (instance as any).riskClass || 'standard',
      factors: [],
    },
    actor: 'system',
  } as any);
}
