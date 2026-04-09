/**
 * Playbook runtime enforcement.
 *
 * Today the planner prompt tells the LLM to "stay inside the playbook" but
 * `actionExecutor.ts` does not validate the connector being used against the
 * playbook's bound connectors. This module is the validation layer:
 *
 *   assertConnectorAllowed()    — gate called by actionExecutor before invoke
 *   getPlaybookDocumentChecks() — virtual proof checks for required documents
 *
 * Both are best-effort: if no playbook is active on the instance, both
 * helpers no-op (no playbook = no enforcement).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  outcomeInstances,
  outcomeTypes,
  playbookSystemBindings,
  playbookDocumentRequirements,
  connectorInstances,
} from '@lamdis/db/schema';

// ───────────────────────────────────────────────────────────────────────────
// Connector enforcement
// ───────────────────────────────────────────────────────────────────────────

export type PlaybookViolationReason = 'unbound_connector' | 'no_connector_link';

export interface PlaybookViolation {
  reason: PlaybookViolationReason;
  /** The connector the action tried to use (if any). */
  connectorInstanceId: string | null;
  connectorInstanceName: string | null;
  /** All connectors actually bound to the active playbook. */
  boundConnectorInstanceIds: string[];
  boundConnectorInstanceNames: Array<{ id: string; name: string }>;
  activePlaybookId: string;
}

export type EnforcementResult =
  | { allowed: true }
  | { allowed: false; violation: PlaybookViolation };

interface CachedBindings {
  ids: string[];
  expiresAt: number;
}

const BINDINGS_TTL_MS = 60_000;
const bindingsCache = new Map<string, CachedBindings>();

function getCachedBindings(playbookId: string): string[] | undefined {
  const hit = bindingsCache.get(playbookId);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    bindingsCache.delete(playbookId);
    return undefined;
  }
  return hit.ids;
}

function setCachedBindings(playbookId: string, ids: string[]): void {
  bindingsCache.set(playbookId, { ids, expiresAt: Date.now() + BINDINGS_TTL_MS });
}

export function invalidatePlaybookBindingsCache(playbookId?: string): void {
  if (playbookId) bindingsCache.delete(playbookId);
  else bindingsCache.clear();
}

/**
 * Resolve the active playbook for an instance. Mirrors the resolution order
 * in `playbookContext.loadPlaybookContextForInstance` so the gate and the
 * planner prompt always agree:
 *   1. instance.activePlaybookId (pinned at creation)
 *   2. outcomeType.defaultPlaybookId (auto-set when a playbook is activated)
 *   3. null (no playbook → no enforcement)
 */
async function loadActivePlaybookId(outcomeInstanceId: string): Promise<string | null> {
  const [instance] = await db
    .select({
      activePlaybookId: outcomeInstances.activePlaybookId,
      outcomeTypeId: outcomeInstances.outcomeTypeId,
    })
    .from(outcomeInstances)
    .where(eq(outcomeInstances.id, outcomeInstanceId))
    .limit(1);
  if (!instance) return null;
  if (instance.activePlaybookId) return instance.activePlaybookId;
  if (!instance.outcomeTypeId) return null;
  const [type] = await db
    .select({ defaultPlaybookId: outcomeTypes.defaultPlaybookId })
    .from(outcomeTypes)
    .where(eq(outcomeTypes.id, instance.outcomeTypeId))
    .limit(1);
  return type?.defaultPlaybookId ?? null;
}

async function loadBoundConnectorInstanceIds(playbookId: string): Promise<string[]> {
  const cached = getCachedBindings(playbookId);
  if (cached) return cached;

  const rows = await db
    .select({ connectorInstanceId: playbookSystemBindings.connectorInstanceId })
    .from(playbookSystemBindings)
    .where(eq(playbookSystemBindings.playbookId, playbookId));

  const ids = rows
    .map((r) => r.connectorInstanceId)
    .filter((id): id is string => !!id);
  setCachedBindings(playbookId, ids);
  return ids;
}

async function loadConnectorInstanceNames(ids: string[]): Promise<Array<{ id: string; name: string }>> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: connectorInstances.id, name: connectorInstances.name })
    .from(connectorInstances);
  // In-memory filter avoids the dual-install drizzle inArray type noise.
  const set = new Set(ids);
  return rows.filter((r) => set.has(r.id));
}

/**
 * Returns `{ allowed: true }` if any of these are true:
 *   - the instance has no active playbook (no enforcement context)
 *   - the playbook has no connector bindings at all (treated as unconstrained)
 *   - the action's connector is in the playbook's bound set
 *
 * Returns a violation otherwise. Caller decides what to do (block + escalate).
 */
export async function assertConnectorAllowed(
  outcomeInstanceId: string,
  connectorInstanceId: string | null,
): Promise<EnforcementResult> {
  const activePlaybookId = await loadActivePlaybookId(outcomeInstanceId);
  if (!activePlaybookId) return { allowed: true };

  const boundIds = await loadBoundConnectorInstanceIds(activePlaybookId);
  // Empty bindings → playbook hasn't pinned its systems yet, don't block.
  if (boundIds.length === 0) return { allowed: true };

  if (connectorInstanceId && boundIds.includes(connectorInstanceId)) {
    return { allowed: true };
  }

  const boundNames = await loadConnectorInstanceNames(boundIds);
  let blockedName: string | null = null;
  if (connectorInstanceId) {
    const [row] = await db
      .select({ name: connectorInstances.name })
      .from(connectorInstances)
      .where(eq(connectorInstances.id, connectorInstanceId))
      .limit(1);
    blockedName = row?.name ?? null;
  }

  return {
    allowed: false,
    violation: {
      reason: connectorInstanceId ? 'unbound_connector' : 'no_connector_link',
      connectorInstanceId,
      connectorInstanceName: blockedName,
      boundConnectorInstanceIds: boundIds,
      boundConnectorInstanceNames: boundNames,
      activePlaybookId,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Document requirement checks (virtual proof_expectations)
// ───────────────────────────────────────────────────────────────────────────

/**
 * A minimal proof_expectation shape produced at evaluation time. Not stored
 * in the DB. Returned by getPlaybookDocumentChecks() and merged with the
 * real proof_expectations rows by policyEvaluator.
 */
export interface VirtualProofExpectation {
  id: string; // synthetic, prefixed with 'virtual:'
  name: string;
  description: string;
  checkType: 'playbook_document_present';
  config: { documentTemplateId: string };
  severity: 'critical' | 'error' | 'warning' | 'info';
  requiredEvidenceLevel: 'A' | 'B' | 'C' | 'D' | 'E';
  judgeThreshold: number;
  enabled: true;
  appliesTo: null;
  category: 'compliance';
  onFail: Array<{ type: string; config?: unknown }>;
  onPass: Array<{ type: string; config?: unknown }>;
}

/**
 * Returns one virtual check per row in `playbook_document_requirements` for
 * the instance's active playbook (only required=true rows). Empty if no
 * playbook is active or no requirements exist.
 */
export async function getPlaybookDocumentChecks(
  outcomeInstanceId: string,
): Promise<VirtualProofExpectation[]> {
  const activePlaybookId = await loadActivePlaybookId(outcomeInstanceId);
  if (!activePlaybookId) return [];

  const rows = await db
    .select()
    .from(playbookDocumentRequirements)
    .where(and(
      eq(playbookDocumentRequirements.playbookId, activePlaybookId),
      eq(playbookDocumentRequirements.required, true),
    ));

  return rows.map((r) => ({
    id: `virtual:doc-req:${r.id}`,
    name: `Required document: ${r.documentTemplateId}`,
    description: 'Playbook requires this document to be present before completion.',
    checkType: 'playbook_document_present' as const,
    config: { documentTemplateId: r.documentTemplateId },
    severity: 'critical' as const,
    requiredEvidenceLevel: 'B' as const,
    judgeThreshold: 1,
    enabled: true as const,
    appliesTo: null,
    category: 'compliance' as const,
    onFail: [],
    onPass: [],
  }));
}
