/**
 * Bridge Route — WebSocket endpoint for local filesystem connectors.
 *
 * Uses shared bridgeRegistry for connection state so agent tools
 * can import it directly without circular dependencies.
 */

import type { FastifyInstance } from 'fastify';
import { connections, type BridgeConnection } from '../services/bridge/bridgeRegistry.js';

// Re-export for backward compat
export { isBridgeConnected, getBridgeInfo, sendBridgeCommand } from '../services/bridge/bridgeRegistry.js';

export default async function bridgeRoutes(app: FastifyInstance) {
  // Diagnostic: check bridge status (no auth needed)
  app.get('/bridge/status', async (req, reply) => {
    return {
      connections: connections.size,
      orgs: Array.from(connections.keys()),
      registryRef: connections === (await import('../services/bridge/bridgeRegistry.js')).connections ? 'same' : 'DIFFERENT',
    };
  });

  app.get('/bridge', { websocket: true }, (connection: any, req) => {
    // @fastify/websocket v10: connection is a SocketStream (duplex stream)
    // The raw WebSocket is at connection.socket — use that for send/close
    // But listen for events on the connection (stream) itself
    const socket = connection.socket || connection;
    const stream = connection; // the SocketStream for event listeners
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const orgId = url.searchParams.get('org');

    if (!token || !orgId) {
      socket.close(4001, 'Missing token or org parameter');
      return;
    }

    const conn: BridgeConnection = {
      orgId,
      ws: socket,
      capabilities: [],
      rootDir: '',
      connectedAt: new Date(),
      pendingRequests: new Map(),
    };

    // Replace any existing connection for this org
    const existing = connections.get(orgId);
    if (existing) {
      existing.ws.close(1000, 'Replaced by new connection');
      existing.pendingRequests.forEach(p => {
        clearTimeout(p.timeout);
        p.reject(new Error('Bridge reconnected'));
      });
    }

    connections.set(orgId, conn);
    console.log(`[bridge] Client connected for org ${orgId}`);

    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15_000);

    // @fastify/websocket v10 + Fastify 4: connection IS the WebSocket object.
    // Use 'message' event (not 'data' which is for Node streams).
    function handleMessage(raw: any) {
      try {
        const data = typeof raw === 'string' ? raw : (raw instanceof Buffer ? raw.toString() : raw.data?.toString() ?? raw.toString());
        const msg = JSON.parse(data);

        if (msg.type === 'handshake') {
          conn.capabilities = msg.capabilities || [];
          conn.rootDir = msg.rootDir || '';
          console.log(`[bridge] Org ${orgId}: capabilities=${conn.capabilities.join(',')}, root=${conn.rootDir}`);
          return;
        }

        if (msg.type === 'pong') return;

        if (msg.type === 'response') {
          const pending = conn.pendingRequests.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            conn.pendingRequests.delete(msg.requestId);
            pending.resolve(msg.payload);
          }
          return;
        }
      } catch (err: any) {
        console.error(`[bridge] Error parsing message from org ${orgId}:`, err.message);
      }
    }

    // Listen on both 'message' (WebSocket) and 'data' (stream) to cover all versions
    connection.on('message', handleMessage);
    if (connection !== socket) {
      socket.on('message', handleMessage);
    }

    function handleClose() {
      clearInterval(pingInterval);
      conn.pendingRequests.forEach(p => {
        clearTimeout(p.timeout);
        p.reject(new Error('Bridge disconnected'));
      });
      if (connections.get(orgId) === conn) {
        connections.delete(orgId);
      }
      console.log(`[bridge] Client disconnected for org ${orgId}`);
    }

    connection.on('end', handleClose);
    connection.on('close', handleClose);

    function handleError(err: Error) {
      console.error(`[bridge] WebSocket error for org ${orgId}:`, err.message);
    }

    connection.on('error', handleError);
    if (connection !== socket) {
      socket.on('error', handleError);
    }
  });
}
