/**
 * Connector Instance Service — CRUD + health for stored connector instances.
 *
 * Persists configured connections, links them to credential vault entries,
 * runs ping health checks, and writes results to connection_health.
 */

import { db } from '../../db.js';
import {
  connectorInstances,
  connectorTypes,
  connectionHealth,
} from '@lamdis/db/schema';
import { and, eq } from 'drizzle-orm';
import { getConnector, requireConnector } from './connectorRegistry.js';
import type { ConnectorInstanceRecord } from './types.js';

interface CreateInput {
  orgId: string;
  connectorTypeKey: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  credentialVaultEntryId?: string | null;
  scope?: 'org' | 'objective' | 'workspace';
  scopeRef?: string | null;
  createdBy?: string;
}

async function loadInstance(id: string): Promise<ConnectorInstanceRecord | null> {
  const rows = await db.select().from(connectorInstances).where(eq(connectorInstances.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    connectorTypeId: row.connectorTypeId,
    name: row.name,
    config: (row.config ?? {}) as Record<string, unknown>,
    credentialVaultEntryId: row.credentialVaultEntryId,
    status: row.status ?? 'active',
  };
}

async function lookupTypeByKey(key: string) {
  const rows = await db.select().from(connectorTypes).where(eq(connectorTypes.key, key)).limit(1);
  return rows[0] ?? null;
}

export const connectorInstanceService = {
  async create(input: CreateInput) {
    const type = await lookupTypeByKey(input.connectorTypeKey);
    if (!type) throw new Error(`Unknown connector type: ${input.connectorTypeKey}`);

    const connector = requireConnector(input.connectorTypeKey);
    // Validate config against the connector's schema before persisting.
    connector.configSchema.parse(input.config);

    const [row] = await db.insert(connectorInstances).values({
      orgId: input.orgId,
      connectorTypeId: type.id,
      name: input.name,
      description: input.description,
      config: input.config,
      credentialVaultEntryId: input.credentialVaultEntryId ?? null,
      scope: input.scope ?? 'org',
      scopeRef: input.scopeRef ?? null,
      createdBy: input.createdBy,
    }).returning();
    return row;
  },

  async list(orgId: string) {
    return db.select().from(connectorInstances).where(eq(connectorInstances.orgId, orgId));
  },

  async get(orgId: string, id: string) {
    const rows = await db
      .select()
      .from(connectorInstances)
      .where(and(eq(connectorInstances.orgId, orgId), eq(connectorInstances.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  async ping(id: string): Promise<{ ok: boolean; reason?: string }> {
    const instance = await loadInstance(id);
    if (!instance) return { ok: false, reason: 'instance not found' };
    const type = await db
      .select()
      .from(connectorTypes)
      .where(eq(connectorTypes.id, instance.connectorTypeId))
      .limit(1);
    const typeKey = type[0]?.key;
    if (!typeKey) return { ok: false, reason: 'connector type missing' };
    const connector = getConnector(typeKey);
    if (!connector) return { ok: false, reason: `unknown connector ${typeKey}` };
    // Note: secret decryption is intentionally deferred to a follow-up that
    // wires the credential vault decrypt path through here. For health checks
    // we pass undefined; connectors should handle a missing secret gracefully.
    const client = connector.client(instance, undefined);
    const result = await client.ping();

    await db.insert(connectionHealth).values({
      orgId: instance.orgId,
      connectorInstanceId: instance.id,
      category: 'action_tool',
      authStatus: result.ok ? 'healthy' : 'error',
      lastHealthCheck: new Date(),
      lastFailureReason: result.ok ? null : (result.reason ?? 'unknown'),
    });

    return result;
  },
};
