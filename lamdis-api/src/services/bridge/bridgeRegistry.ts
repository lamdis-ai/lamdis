/**
 * Bridge Connection Registry — shared state for WebSocket bridge connections.
 *
 * Separated from the route handler so agent tools can import it directly
 * without circular dependency issues.
 */

import { randomUUID } from 'crypto';

export interface BridgeConnection {
  orgId: string;
  ws: any;
  capabilities: string[];
  rootDir: string;
  connectedAt: Date;
  pendingRequests: Map<string, {
    resolve: (response: any) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>;
}

export const connections = new Map<string, BridgeConnection>();

function findConnection(orgId: string): BridgeConnection | undefined {
  const exact = connections.get(orgId);
  if (exact) return exact;
  // Fallback: if only one bridge is connected, use it (local dev convenience)
  if (connections.size === 1) return connections.values().next().value;
  return undefined;
}

export function isBridgeConnected(orgId: string): boolean {
  return !!findConnection(orgId);
}

export function getBridgeInfo(orgId: string): { connected: boolean; rootDir?: string; capabilities?: string[] } {
  const conn = findConnection(orgId);
  if (!conn) return { connected: false };
  return { connected: true, rootDir: conn.rootDir, capabilities: conn.capabilities };
}

export async function sendBridgeCommand(orgId: string, command: Record<string, unknown>): Promise<any> {
  const conn = findConnection(orgId);
  if (!conn) throw new Error('No local bridge connected. Run `npx @lamdis/connect` on your machine first.');

  const requestId = randomUUID();
  const TIMEOUT_MS = 30_000;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.pendingRequests.delete(requestId);
      reject(new Error('Bridge command timed out after 30s'));
    }, TIMEOUT_MS);

    conn.pendingRequests.set(requestId, { resolve, reject, timeout });

    conn.ws.send(JSON.stringify({
      type: 'command',
      requestId,
      payload: command,
    }));
  });
}
