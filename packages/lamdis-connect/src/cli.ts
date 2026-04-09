#!/usr/bin/env node
/**
 * lamdis-connect — Local filesystem bridge for the Lamdis agent platform.
 *
 * Usage:
 *   npx @lamdis/connect --dir ~/projects --server wss://api.lamdis.com --token <your-api-key>
 *   npx @lamdis/connect --dir .          # defaults to current directory
 *
 * This opens a WebSocket to Lamdis cloud and lets the agent:
 *   - Search for files by name or content (grep)
 *   - Read file contents
 *   - Find environment variables across .env files
 *   - List directory contents
 *
 * All operations are scoped to the --dir you specify. The agent cannot access anything outside it.
 */

import { startBridge } from './bridge.js';

const args = process.argv.slice(2);

function getArg(flag: string, defaultValue?: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const dir = getArg('--dir', '.');
const server = getArg('--server', process.env.LAMDIS_API_URL || 'ws://localhost:3100');
const token = getArg('--token', process.env.LAMDIS_API_KEY);
const orgId = getArg('--org', process.env.LAMDIS_ORG_ID);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
lamdis-connect — Local filesystem bridge

Usage:
  lamdis-connect [options]

Options:
  --dir <path>      Root directory to expose (default: current directory)
  --server <url>    Lamdis API WebSocket URL (default: ws://localhost:3100)
  --token <key>     API key for authentication (or set LAMDIS_API_KEY)
  --org <id>        Organization ID (or set LAMDIS_ORG_ID)
  --help            Show this help

Environment Variables:
  LAMDIS_API_URL    WebSocket server URL
  LAMDIS_API_KEY    API key
  LAMDIS_ORG_ID     Organization ID

The agent can only access files within the specified directory.
`);
  process.exit(0);
}

if (!token) {
  console.error('Error: --token or LAMDIS_API_KEY required');
  process.exit(1);
}

startBridge({
  rootDir: dir!,
  serverUrl: server!,
  apiKey: token,
  orgId: orgId || '',
});
