#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_KEY = process.env.LAMDIS_API_KEY;
const API_URL = (process.env.LAMDIS_API_URL || 'https://api.lamdis.ai').replace(/\/$/, '');

if (!API_KEY) {
  console.error('LAMDIS_API_KEY environment variable is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/** The API key carries the orgId — we extract it from the first API call. */
let cachedOrgId: string | null = null;

async function apiGet(path: string): Promise<any> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'x-lamdis-api-key': API_KEY!,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Discover the orgId by calling a lightweight endpoint.
 * The API key auth plugin attaches the orgId, but we need to know it
 * for URL construction. We call GET /orgs/:orgId/workflows with
 * a placeholder, but the API key validation will reject if orgId
 * doesn't match. Instead we use a dedicated endpoint if available,
 * or we try the key-info approach.
 *
 * Fallback: parse from a /v1/key-info endpoint, or require
 * LAMDIS_ORG_ID env var.
 */
async function getOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;

  // Try env var first
  if (process.env.LAMDIS_ORG_ID) {
    cachedOrgId = process.env.LAMDIS_ORG_ID;
    return cachedOrgId;
  }

  // Try key-info endpoint
  try {
    const info = await apiGet('/v1/key-info');
    if (info.orgId) {
      cachedOrgId = info.orgId as string;
      return cachedOrgId!;
    }
  } catch {
    // Not available — fall through
  }

  throw new Error(
    'Cannot determine orgId. Set LAMDIS_ORG_ID environment variable or ensure /v1/key-info is available.',
  );
}

// ---------------------------------------------------------------------------
// SDK Reference (static)
// ---------------------------------------------------------------------------

const SDK_REFERENCE = `# @lamdis-ai/sdk — API Reference

## Installation

\`\`\`bash
npm install @lamdis-ai/sdk
\`\`\`

## Quick Start

\`\`\`typescript
import { Lamdis } from '@lamdis-ai/sdk';

const lamdis = new Lamdis({
  apiKey: process.env.LAMDIS_API_KEY!,
  endpoint: 'https://ingest.lamdis.com',
  environment: 'production',
});

const instance = lamdis.startWorkflow('customer-requests-close-account');
await instance.emit('message.received', { content: msg }, { level: 'A' });
await instance.emit('tool.invoked', { tool: 'closeAccount' }, { level: 'B' });
await instance.complete();

// On shutdown
await lamdis.shutdown();
\`\`\`

## Constructor: \`new Lamdis(config)\`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| \`apiKey\` | \`string\` | Yes | — | API key (\`lam_sk_...\`) |
| \`endpoint\` | \`string\` | No | — | Ingestion endpoint URL |
| \`environment\` | \`'ci' \\| 'staging' \\| 'production' \\| 'synthetic'\` | No | \`'production'\` | Environment label |
| \`flushIntervalMs\` | \`number\` | No | \`100\` | Flush interval in ms |
| \`maxBatchSize\` | \`number\` | No | \`50\` | Max events per flush batch |
| \`maxRetries\` | \`number\` | No | \`3\` | Max retry attempts |
| \`debug\` | \`boolean\` | No | \`false\` | Enable debug logging |

## \`lamdis.startWorkflow(workflowKey, source?)\`

Returns a \`WorkflowHandle\` with a UUIDv7 distributed ID. All events emitted via this handle are correlated.

- \`workflowKey\` — the workflow name/key (e.g., \`'customer-requests-close-account'\`)
- \`source\` — optional source identifier for the emitting service

### WorkflowHandle

| Property/Method | Type | Description |
|----------------|------|-------------|
| \`id\` | \`string\` (readonly) | The UUIDv7 workflow instance ID |
| \`emit(eventType, payload, options?)\` | \`Promise<void>\` | Emit an evidence event |
| \`complete()\` | \`Promise<void>\` | Mark workflow complete and flush |

### \`instance.emit(eventType, payload, options?)\`

| Parameter | Type | Description |
|-----------|------|-------------|
| \`eventType\` | \`string\` | Dot-notation event type (e.g., \`'tool.invoked'\`) |
| \`payload\` | \`Record<string, unknown>\` | Event data |
| \`options.level\` | \`'A' \\| 'B' \\| 'C' \\| 'D' \\| 'E'\` | Confirmation level |
| \`options.idempotencyKey\` | \`string\` | Custom idempotency key |
| \`options.metadata\` | \`Record<string, unknown>\` | Extra metadata |

## Confirmation Levels

| Level | Name | Meaning |
|-------|------|---------|
| \`A\` | Observed intent | System decided to act |
| \`B\` | Attempted action | Outbound call made |
| \`C\` | Acknowledged action | Got success response |
| \`D\` | Confirmed system state | Source-of-truth readback |
| \`E\` | End-to-end completed | Full outcome confirmed |

## Event Type Conventions

Use dot-notation. Common patterns:
- \`message.received\`, \`message.sent\` — conversation events
- \`tool.invoked\`, \`tool.completed\`, \`tool.failed\` — tool/function calls
- \`escalation.triggered\`, \`escalation.completed\` — escalation events
- \`account.status.read\`, \`account.status.changed\` — state changes
- \`decision.made\` — decision points
- \`boundary.crossed\` — where visibility ends
- \`workflow.completed\` — lifecycle (auto-emitted by \`complete()\`)
- \`validation.passed\`, \`validation.failed\` — validation events
- \`notification.sent\` — outbound notifications

## Middleware Helpers

### Express

\`\`\`typescript
import { expressMiddleware } from '@lamdis-ai/sdk';

app.use(expressMiddleware());
// req.lamdisInstanceId is now available if X-Lamdis-Instance-Id header was set
\`\`\`

### Fastify

\`\`\`typescript
import { fastifyPlugin } from '@lamdis-ai/sdk';

app.register(fastifyPlugin);
// req.lamdisInstanceId is now available
\`\`\`

### Propagation

\`\`\`typescript
import { propagationHeaders, extractInstanceId } from '@lamdis-ai/sdk';

// When making downstream HTTP calls, propagate the instance ID:
const headers = propagationHeaders(instance.id);
await fetch('https://other-service/api', { headers });

// In the downstream service, extract it:
const instanceId = extractInstanceId(req.headers);
\`\`\`

## \`lamdis.shutdown()\`

Flushes all buffered events. Call this on process shutdown.

\`\`\`typescript
process.on('SIGTERM', async () => {
  await lamdis.shutdown();
  process.exit(0);
});
\`\`\`
`;

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'lamdis',
  version: '0.1.0',
});

// --- get_workflows ---
server.tool(
  'get_workflows',
  'List all workflows for the organization (derived from API key)',
  {},
  async () => {
    const orgId = await getOrgId();
    const data = await apiGet(`/orgs/${orgId}/workflows`);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

// --- get_workflow ---
// @ts-expect-error — deep type instantiation in MCP SDK tool() overloads
server.tool(
  'get_workflow',
  'Get a single workflow with its policy checks and recent instances',
  { workflowId: z.string().describe('The workflow UUID') },
  async ({ workflowId }) => {
    const orgId = await getOrgId();
    const [workflow, checks] = await Promise.all([
      apiGet(`/orgs/${orgId}/workflows/${workflowId}`),
      apiGet(`/orgs/${orgId}/workflows/${workflowId}/checks`),
    ]);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...workflow, checks }, null, 2),
      }],
    };
  },
);

// --- get_workflow_checks ---
server.tool(
  'get_workflow_checks',
  'Get policy checks for a workflow',
  { workflowId: z.string().describe('The workflow UUID') },
  async ({ workflowId }) => {
    const orgId = await getOrgId();
    const data = await apiGet(`/orgs/${orgId}/workflows/${workflowId}/checks`);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  },
);

// --- get_sdk_reference ---
server.tool(
  'get_sdk_reference',
  'Returns the @lamdis-ai/sdk API reference — types, methods, examples, confirmation levels, and middleware helpers',
  {},
  async () => {
    return {
      content: [{ type: 'text', text: SDK_REFERENCE }],
    };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start Lamdis MCP server:', err);
  process.exit(1);
});
