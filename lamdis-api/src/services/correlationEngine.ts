/**
 * Correlation Engine
 *
 * Matches incoming evidence events to:
 * 1. An outcome_instance (by distributed ID)
 * 2. An outcome_type definition (by event type patterns)
 *
 * Strategies:
 *   - Exact match: outcomeInstanceId → find or create instance
 *   - Pattern match: once instance exists, match to outcome type definition
 *     by comparing event types against outcomeType.expectedEventTypes
 *   - Fuzzy match (future): correlate by sessionId/traceId within time window
 */

import { db } from '../db.js';
import { outcomeTypes, outcomeInstances } from '@lamdis/db/schema';
import { eq, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IncomingEvent {
  orgId: string;
  outcomeInstanceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  confirmationLevel?: string;
  emittedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CorrelationResult {
  instanceId: string;
  outcomeTypeId: string | null;
  isNew: boolean;
  matchConfidence: 'exact' | 'pattern' | 'unmatched';
  /** @deprecated use outcomeTypeId */
  workflowId?: string | null;
}

// ---------------------------------------------------------------------------
// Core correlation
// ---------------------------------------------------------------------------

/**
 * Correlate an event to an outcome instance and (if possible) an outcome type definition.
 */
export async function correlateEvent(event: IncomingEvent): Promise<CorrelationResult> {
  const { orgId, outcomeInstanceId, eventType, metadata } = event;

  // 1. Find or create the outcome instance
  const [existing] = await db
    .select({
      id: outcomeInstances.id,
      outcomeTypeId: outcomeInstances.outcomeTypeId,
    })
    .from(outcomeInstances)
    .where(eq(outcomeInstances.id, outcomeInstanceId))
    .limit(1);

  if (existing) {
    // Instance exists — update it
    await updateInstanceStats(outcomeInstanceId, event);

    // If already matched to an outcome type, we're done
    if (existing.outcomeTypeId) {
      return {
        instanceId: outcomeInstanceId,
        outcomeTypeId: existing.outcomeTypeId,
        workflowId: existing.outcomeTypeId,
        isNew: false,
        matchConfidence: 'exact',
      };
    }

    // Try to match to an outcome type definition
    const matchedOutcomeTypeId = await matchToOutcomeType(orgId, outcomeInstanceId);
    return {
      instanceId: outcomeInstanceId,
      outcomeTypeId: matchedOutcomeTypeId,
      workflowId: matchedOutcomeTypeId,
      isNew: false,
      matchConfidence: matchedOutcomeTypeId ? 'pattern' : 'unmatched',
    };
  }

  // 2. Create new instance
  const workflowKey = metadata?.workflowKey as string | undefined;
  const outcomeKey = metadata?.outcomeKey as string | undefined;
  const environment = (metadata?.environment as string) || 'production';

  // Try to find outcome type by key (name match)
  let outcomeTypeId: string | null = null;
  let matchedOutcome: any = null;
  const lookupKey = outcomeKey || workflowKey;
  if (lookupKey) {
    const [matched] = await db
      .select({ id: outcomeTypes.id, storageMode: outcomeTypes.storageMode, vault: outcomeTypes.vault })
      .from(outcomeTypes)
      .where(and(
        eq(outcomeTypes.orgId, orgId),
        eq(outcomeTypes.name, lookupKey),
      ))
      .limit(1);
    if (matched) {
      outcomeTypeId = matched.id;
      matchedOutcome = matched;
    }
  }

  // Inherit storage/vault config from outcome type
  const instanceVault = matchedOutcome?.vault ? {
    immutable: matchedOutcome.vault.immutable,
    deleteAfter: matchedOutcome.vault.retentionDays
      ? new Date(Date.now() + matchedOutcome.vault.retentionDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  } : undefined;

  await db.insert(outcomeInstances).values({
    id: outcomeInstanceId,
    orgId,
    outcomeTypeId: outcomeTypeId || undefined,
    environment,
    trigger: 'sdk',
    status: 'open',
    highestConfirmationLevel: event.confirmationLevel || undefined,
    eventCount: 1,
    firstEventAt: new Date(event.emittedAt),
    lastEventAt: new Date(event.emittedAt),
    storageMode: matchedOutcome?.storageMode || undefined,
    vault: instanceVault,
    metadata: { workflowKey: lookupKey },
  } as any);

  return {
    instanceId: outcomeInstanceId,
    outcomeTypeId,
    workflowId: outcomeTypeId,
    isNew: true,
    matchConfidence: outcomeTypeId ? 'exact' : 'unmatched',
  };
}

// ---------------------------------------------------------------------------
// Pattern matching: match instance to outcome type definition
// ---------------------------------------------------------------------------

/**
 * Try to match an outcome instance to an outcome type definition
 * by comparing accumulated event types against expectedEventTypes.
 */
async function matchToOutcomeType(
  orgId: string,
  instanceId: string,
): Promise<string | null> {
  // Get all event types for this instance
  const eventTypesResult = await db.execute(sql`
    SELECT DISTINCT event_type FROM evidence_events
    WHERE outcome_instance_id = ${instanceId}
  `);

  const instanceEventTypes = new Set(
    (eventTypesResult.rows as any[]).map((r: any) => r.event_type)
  );

  if (instanceEventTypes.size === 0) return null;

  // Get all active outcome types for this org
  const orgOutcomeTypes = await db
    .select({
      id: outcomeTypes.id,
      expectedEventTypes: outcomeTypes.expectedEventTypes,
    })
    .from(outcomeTypes)
    .where(and(
      eq(outcomeTypes.orgId, orgId),
      eq(outcomeTypes.disabled, false),
    ));

  // Score each outcome type by overlap with instance event types
  let bestMatch: { id: string; score: number } | null = null;

  for (const ot of orgOutcomeTypes) {
    const expected = ot.expectedEventTypes || [];
    if (expected.length === 0) continue;

    const matchCount = expected.filter(t => instanceEventTypes.has(t)).length;
    const score = matchCount / expected.length;

    // Require at least 30% overlap to consider a match
    if (score >= 0.3 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: ot.id, score };
    }
  }

  if (bestMatch) {
    // Update the instance with the matched outcome type
    await db
      .update(outcomeInstances)
      .set({ outcomeTypeId: bestMatch.id, updatedAt: new Date() })
      .where(eq(outcomeInstances.id, instanceId));

    return bestMatch.id;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Update instance stats
// ---------------------------------------------------------------------------

async function updateInstanceStats(
  instanceId: string,
  event: IncomingEvent,
): Promise<void> {
  const levelOrder = ['A', 'B', 'C', 'D', 'E'];
  const newLevel = event.confirmationLevel;

  const updates: Record<string, unknown> = {
    eventCount: sql`${outcomeInstances.eventCount} + 1`,
    lastEventAt: new Date(event.emittedAt),
    updatedAt: new Date(),
  };

  // Only update highest confirmation level if the new one is higher
  if (newLevel && levelOrder.includes(newLevel)) {
    updates.highestConfirmationLevel = sql`
      CASE
        WHEN ${outcomeInstances.highestConfirmationLevel} IS NULL THEN ${newLevel}
        WHEN ARRAY_POSITION(ARRAY['A','B','C','D','E'], ${newLevel}) >
             ARRAY_POSITION(ARRAY['A','B','C','D','E'], ${outcomeInstances.highestConfirmationLevel})
        THEN ${newLevel}
        ELSE ${outcomeInstances.highestConfirmationLevel}
      END
    `;
  }

  await db
    .update(outcomeInstances)
    .set(updates as any)
    .where(eq(outcomeInstances.id, instanceId));
}
