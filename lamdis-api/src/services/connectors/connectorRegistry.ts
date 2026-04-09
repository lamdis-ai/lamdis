/**
 * Connector Registry
 *
 * Singleton catalog of typed Connector implementations. Each connector is
 * registered at module load time. Lookups are by stable key matching
 * connector_types.key in the database.
 */

import type { Connector } from './types.js';

const registry = new Map<string, Connector>();

export function registerConnector(connector: Connector): void {
  if (registry.has(connector.key)) {
    throw new Error(`Connector already registered: ${connector.key}`);
  }
  registry.set(connector.key, connector);
}

export function getConnector(key: string): Connector | undefined {
  return registry.get(key);
}

export function listConnectors(): Connector[] {
  return Array.from(registry.values());
}

export function requireConnector(key: string): Connector {
  const c = registry.get(key);
  if (!c) throw new Error(`Unknown connector type: ${key}`);
  return c;
}
