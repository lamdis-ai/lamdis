/**
 * Cross-Objective Coordination Service
 *
 * Manages relationships between objectives: parent/child, peers, shared context.
 * Enables coordinated actions where one objective triggers work in another.
 */

import { db } from '../../db.js';
import { outcomeInstances, outcomeTypes } from '@lamdis/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Sub-objectives
// ---------------------------------------------------------------------------

/**
 * Create a sub-objective linked to a parent.
 */
export async function createSubObjective(orgId: string, parentInstanceId: string, opts: {
  outcomeTypeId?: string;
  goalDescription: string;
  guidelines?: Record<string, unknown>;
  agentEnabled?: boolean;
}) {
  const [parent] = await db.select().from(outcomeInstances)
    .where(and(eq(outcomeInstances.id, parentInstanceId), eq(outcomeInstances.orgId, orgId)))
    .limit(1);

  if (!parent) throw new Error('Parent objective not found');

  const [child] = await db.insert(outcomeInstances).values({
    orgId,
    outcomeTypeId: opts.outcomeTypeId || parent.outcomeTypeId,
    parentObjectiveId: parentInstanceId,
    goalDescription: opts.goalDescription,
    guidelines: opts.guidelines || {},
    agentEnabled: opts.agentEnabled ?? true,
    agentStatus: opts.agentEnabled ? 'planning' : 'idle',
    status: 'open',
    trigger: 'agent',
  } as any).returning();

  // Add child to parent's relatedObjectiveIds
  const parentRelated = ((parent.relatedObjectiveIds || []) as string[]);
  if (!parentRelated.includes(child.id)) {
    parentRelated.push(child.id);
    await db.update(outcomeInstances).set({
      relatedObjectiveIds: parentRelated,
      updatedAt: new Date(),
    } as any).where(eq(outcomeInstances.id, parentInstanceId));
  }

  return child;
}

// ---------------------------------------------------------------------------
// Link objectives (peer relationship)
// ---------------------------------------------------------------------------

export async function linkObjectives(orgId: string, instanceId1: string, instanceId2: string) {
  const [inst1] = await db.select().from(outcomeInstances)
    .where(and(eq(outcomeInstances.id, instanceId1), eq(outcomeInstances.orgId, orgId)))
    .limit(1);
  const [inst2] = await db.select().from(outcomeInstances)
    .where(and(eq(outcomeInstances.id, instanceId2), eq(outcomeInstances.orgId, orgId)))
    .limit(1);

  if (!inst1 || !inst2) throw new Error('One or both objectives not found');

  // Add bidirectional links
  const related1 = ((inst1.relatedObjectiveIds || []) as string[]);
  const related2 = ((inst2.relatedObjectiveIds || []) as string[]);

  if (!related1.includes(instanceId2)) {
    related1.push(instanceId2);
    await db.update(outcomeInstances).set({
      relatedObjectiveIds: related1, updatedAt: new Date(),
    } as any).where(eq(outcomeInstances.id, instanceId1));
  }

  if (!related2.includes(instanceId1)) {
    related2.push(instanceId1);
    await db.update(outcomeInstances).set({
      relatedObjectiveIds: related2, updatedAt: new Date(),
    } as any).where(eq(outcomeInstances.id, instanceId2));
  }
}

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

/**
 * Read shared context from an objective's metadata.
 */
export async function readSharedContext(orgId: string, instanceId: string, key?: string): Promise<Record<string, unknown>> {
  const [inst] = await db.select({ metadata: outcomeInstances.metadata })
    .from(outcomeInstances)
    .where(and(eq(outcomeInstances.id, instanceId), eq(outcomeInstances.orgId, orgId)))
    .limit(1);

  if (!inst) throw new Error('Objective not found');

  const meta = (inst.metadata || {}) as Record<string, unknown>;
  const shared = (meta._sharedContext || {}) as Record<string, unknown>;

  if (key) return { [key]: shared[key] };
  return shared;
}

/**
 * Write to shared context. Only related objectives can write.
 */
export async function writeSharedContext(
  orgId: string,
  writerInstanceId: string,
  targetInstanceId: string,
  key: string,
  value: unknown,
): Promise<void> {
  // Verify the writer is related to the target
  const [target] = await db.select().from(outcomeInstances)
    .where(and(eq(outcomeInstances.id, targetInstanceId), eq(outcomeInstances.orgId, orgId)))
    .limit(1);

  if (!target) throw new Error('Target objective not found');

  const related = (target.relatedObjectiveIds || []) as string[];
  const isRelated = related.includes(writerInstanceId) || target.parentObjectiveId === writerInstanceId;

  if (!isRelated) throw new Error('Writer is not related to target objective — cannot write shared context');

  const meta = (target.metadata || {}) as Record<string, unknown>;
  const shared = (meta._sharedContext || {}) as Record<string, unknown>;
  shared[key] = value;

  await db.update(outcomeInstances).set({
    metadata: { ...meta, _sharedContext: shared },
    updatedAt: new Date(),
  } as any).where(eq(outcomeInstances.id, targetInstanceId));
}

// ---------------------------------------------------------------------------
// Related status
// ---------------------------------------------------------------------------

/**
 * Get aggregated status of all related objectives.
 */
export async function getRelatedStatus(orgId: string, instanceId: string): Promise<Array<{
  id: string;
  goalDescription: string | null;
  status: string | null;
  agentStatus: string | null;
  confidenceScore: number | null;
  relationship: 'parent' | 'child' | 'peer';
}>> {
  const [inst] = await db.select().from(outcomeInstances)
    .where(and(eq(outcomeInstances.id, instanceId), eq(outcomeInstances.orgId, orgId)))
    .limit(1);

  if (!inst) return [];

  const relatedIds = ((inst.relatedObjectiveIds || []) as string[]);
  if (inst.parentObjectiveId) relatedIds.push(inst.parentObjectiveId);

  if (relatedIds.length === 0) return [];

  const related = await db.select({
    id: outcomeInstances.id,
    goalDescription: outcomeInstances.goalDescription,
    status: outcomeInstances.status,
    agentStatus: outcomeInstances.agentStatus,
    confidenceScore: outcomeInstances.confidenceScore,
    parentObjectiveId: outcomeInstances.parentObjectiveId,
  }).from(outcomeInstances)
    .where(and(eq(outcomeInstances.orgId, orgId), inArray(outcomeInstances.id, relatedIds)));

  return related.map(r => ({
    id: r.id,
    goalDescription: r.goalDescription,
    status: r.status,
    agentStatus: r.agentStatus,
    confidenceScore: r.confidenceScore,
    relationship: r.parentObjectiveId === instanceId ? 'child' as const
      : inst.parentObjectiveId === r.id ? 'parent' as const
      : 'peer' as const,
  }));
}
