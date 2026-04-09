/**
 * Connector Tool Bridge
 *
 * Exposes a stored connector instance's capabilities to the agent's existing
 * tool catalog as virtual tools. The orchestrator/planner sees these as
 * normal tools the agent can call; the bridge routes invocation through the
 * connector client.
 *
 * This is the fallback mechanism that lets typed connectors degrade
 * gracefully into the dynamicTools/agentTools surface area without each
 * connector needing bespoke planner integration.
 */

import { db } from '../../db.js';
import { connectorInstances, connectorTypes } from '@lamdis/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getConnector } from './connectorRegistry.js';
import type { ConnectorCapability, ConnectorCallContext } from './types.js';

export interface BridgedTool {
  /** Stable id used by the agent: `connector:<instanceId>:<capability>`. */
  id: string;
  name: string;
  description: string;
  capability: ConnectorCapability;
  connectorInstanceId: string;
  connectorTypeKey: string;
  invoke: (input: unknown, ctx: ConnectorCallContext) => Promise<unknown>;
}

interface BridgeOptions {
  orgId: string;
  /** When set, only bridge instances that match these ids (e.g. playbook bindings). */
  instanceIds?: string[];
}

export const connectorToolBridge = {
  async listTools(opts: BridgeOptions): Promise<BridgedTool[]> {
    const filters = [eq(connectorInstances.orgId, opts.orgId), eq(connectorInstances.status, 'active')];
    let instances = await db
      .select()
      .from(connectorInstances)
      .where(and(...filters));
    if (opts.instanceIds && opts.instanceIds.length > 0) {
      instances = instances.filter((i) => opts.instanceIds!.includes(i.id));
    }
    if (instances.length === 0) return [];

    const typeIds = Array.from(new Set(instances.map((i) => i.connectorTypeId)));
    const types = await db.select().from(connectorTypes).where(inArray(connectorTypes.id, typeIds));
    const typeById = new Map(types.map((t) => [t.id, t]));

    const out: BridgedTool[] = [];
    for (const inst of instances) {
      const type = typeById.get(inst.connectorTypeId);
      if (!type) continue;
      const connector = getConnector(type.key);
      if (!connector) continue;
      const client = connector.client(
        {
          id: inst.id,
          orgId: inst.orgId,
          connectorTypeId: inst.connectorTypeId,
          name: inst.name,
          config: (inst.config ?? {}) as Record<string, unknown>,
          credentialVaultEntryId: inst.credentialVaultEntryId,
          status: inst.status ?? 'active',
        },
        undefined, // secret resolution deferred
      );
      for (const cap of client.capabilities) {
        out.push({
          id: `connector:${inst.id}:${cap}`,
          name: `${type.key}.${cap}`,
          description: `${type.displayName} — ${cap} (instance: ${inst.name})`,
          capability: cap,
          connectorInstanceId: inst.id,
          connectorTypeKey: type.key,
          invoke: (input, ctx) => client.invoke(cap, input, ctx),
        });
      }
    }
    return out;
  },
};
