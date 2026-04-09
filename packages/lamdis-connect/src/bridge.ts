/**
 * Bridge — WebSocket client that connects to Lamdis cloud
 * and handles filesystem commands from the agent.
 */

import WebSocket from 'ws';
import { resolve, relative, join, basename } from 'path';
import { handleCommand, type BridgeCommand, type BridgeResponse } from './handlers.js';

interface BridgeOptions {
  rootDir: string;
  serverUrl: string;
  apiKey: string;
  orgId: string;
}

export function startBridge(opts: BridgeOptions) {
  const rootDir = resolve(opts.rootDir);
  const wsUrl = `${opts.serverUrl.replace(/^http/, 'ws')}/bridge?token=${encodeURIComponent(opts.apiKey)}&org=${encodeURIComponent(opts.orgId)}`;

  console.log(`\n  lamdis-connect`);
  console.log(`  Root:   ${rootDir}`);
  console.log(`  Server: ${opts.serverUrl}`);
  console.log(`  Status: connecting...\n`);

  let ws: WebSocket;
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 10;
  const RECONNECT_BASE_MS = 2000;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      reconnectAttempts = 0;
      console.log('  ✓ Connected to Lamdis cloud');
      console.log(`  ✓ Filesystem bridge active (scoped to ${rootDir})`);
      console.log('  Waiting for agent commands...\n');

      // Send capabilities handshake
      ws.send(JSON.stringify({
        type: 'handshake',
        capabilities: ['search_files', 'read_file', 'find_env_vars', 'list_dir', 'grep', 'exec_command'],
        rootDir: basename(rootDir),
      }));
    });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (msg.type === 'command') {
          const command = msg.payload as BridgeCommand;
          const requestId = msg.requestId as string;

          console.log(`  → ${command.action}: ${command.pattern || command.path || command.query || ''}`);

          const response = await handleCommand(command, rootDir);

          console.log(`  ← ${response.ok ? '✓' : '✗'} ${response.summary || response.error || ''}`);

          ws.send(JSON.stringify({
            type: 'response',
            requestId,
            payload: response,
          }));
        }
      } catch (err: any) {
        console.error(`  Error processing message: ${err.message}`);
      }
    });

    ws.on('close', (code) => {
      if (code === 1000) {
        console.log('  Connection closed normally.');
        return;
      }

      reconnectAttempts++;
      if (reconnectAttempts > MAX_RECONNECT) {
        console.error(`  Failed to reconnect after ${MAX_RECONNECT} attempts. Exiting.`);
        process.exit(1);
      }

      const delay = RECONNECT_BASE_MS * Math.pow(1.5, reconnectAttempts - 1);
      console.log(`  Disconnected. Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);
      setTimeout(connect, delay);
    });

    ws.on('error', (err) => {
      console.error(`  WebSocket error: ${err.message}`);
    });
  }

  connect();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down bridge...');
    ws?.close(1000);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    ws?.close(1000);
    process.exit(0);
  });
}
