/**
 * Tool Service
 *
 * Manages custom tools — agent-created integrations that are reusable
 * across objectives. Handles search, generation, testing, registration,
 * and deduplication.
 *
 * Base tools (web search, code exec, browser, workspace, credentials)
 * are always available. Custom tools extend them with specific integrations
 * (e.g., "send SMS via Twilio", "post to FB Marketplace").
 */

import { db } from '../../db.js';
import { dynamicTools } from '@lamdis/db/schema';
import { eq, and, ilike, desc } from 'drizzle-orm';
import { executeHostedJS } from '../hosted/executor.js';
import { generateIntegrationCode, type GeneratedToolCode } from '../generative/codeGenerationService.js';
import { executeTool } from '../automation/agentTools.js';
import type { AgentTool, AgentToolResult } from '../automation/agentTools.js';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createTool(orgId: string, def: {
  toolId: string;
  name: string;
  description?: string;
  scope?: string;
  sourceType?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  implementation?: Record<string, unknown>;
  workspaceId?: string;
  outcomeInstanceId?: string;
  apiDocsUrl?: string;
  createdBy?: string;
}) {
  const [tool] = await db.insert(dynamicTools).values({
    orgId,
    toolId: def.toolId,
    name: def.name,
    description: def.description,
    scope: def.scope || 'org',
    sourceType: def.sourceType || 'manual',
    inputSchema: def.inputSchema || {},
    outputSchema: def.outputSchema || {},
    implementation: def.implementation,
    workspaceId: def.workspaceId,
    outcomeInstanceId: def.outcomeInstanceId,
    apiDocsUrl: def.apiDocsUrl,
    status: 'draft',
    createdBy: def.createdBy || 'agent',
  } as any).returning();

  return tool;
}

export async function getTool(orgId: string, toolId: string) {
  const [tool] = await db.select().from(dynamicTools)
    .where(and(eq(dynamicTools.orgId, orgId), eq(dynamicTools.id, toolId)))
    .limit(1);
  return tool || null;
}

export async function listTools(orgId: string, opts?: {
  scope?: string;
  status?: string;
  outcomeInstanceId?: string;
}) {
  let query = db.select().from(dynamicTools)
    .where(eq(dynamicTools.orgId, orgId))
    .orderBy(desc(dynamicTools.createdAt));

  // Additional filtering done in-app since drizzle chaining is complex
  const results = await query;

  return results.filter(t => {
    if (opts?.scope && t.scope !== opts.scope) return false;
    if (opts?.status && t.status !== opts.status) return false;
    if (opts?.outcomeInstanceId && t.outcomeInstanceId !== opts.outcomeInstanceId) return false;
    return true;
  });
}

export async function updateTool(orgId: string, toolId: string, updates: Partial<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  implementation: Record<string, unknown>;
  status: string;
}>) {
  const [updated] = await db.update(dynamicTools)
    .set({ ...updates, updatedAt: new Date() } as any)
    .where(and(eq(dynamicTools.orgId, orgId), eq(dynamicTools.id, toolId)))
    .returning();
  return updated;
}

export async function deleteTool(orgId: string, toolId: string) {
  await db.delete(dynamicTools)
    .where(and(eq(dynamicTools.orgId, orgId), eq(dynamicTools.id, toolId)));
}

// ---------------------------------------------------------------------------
// Find existing tool (deduplication)
// ---------------------------------------------------------------------------

/**
 * Search org's existing tools by purpose/description to avoid creating duplicates.
 * Returns the best match if found.
 */
export async function findExistingTool(orgId: string, purpose: string): Promise<any | null> {
  // Simple keyword search — could be enhanced with embeddings later
  const keywords = purpose.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const allTools = await db.select().from(dynamicTools)
    .where(and(eq(dynamicTools.orgId, orgId), eq(dynamicTools.status, 'active')));

  for (const tool of allTools) {
    const desc = (tool.description || '').toLowerCase() + ' ' + (tool.name || '').toLowerCase();
    const matchCount = keywords.filter(kw => desc.includes(kw)).length;
    if (matchCount >= Math.ceil(keywords.length * 0.5)) {
      return tool;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Generate + register a custom tool
// ---------------------------------------------------------------------------

/**
 * Full pipeline: search for API docs, generate integration code, register as tool.
 * Called by the orchestrator when the planner emits a create_tool system action.
 */
export async function generateAndRegisterTool(orgId: string, opts: {
  purpose: string;
  apiHint?: string;
  outcomeInstanceId?: string;
  workspaceId?: string;
}): Promise<any> {
  // 1. Check for existing tool
  const existing = await findExistingTool(orgId, opts.purpose);
  if (existing) {
    // Increment reuse count
    await db.update(dynamicTools).set({
      reuseCount: (existing.reuseCount || 0) + 1,
      updatedAt: new Date(),
    } as any).where(eq(dynamicTools.id, existing.id));
    return existing;
  }

  // 2. Search for API docs
  let apiDocs = '';
  if (opts.apiHint) {
    const searchResult = await executeTool('web_search', { query: `${opts.apiHint} API documentation` });
    if (searchResult.ok && searchResult.result) {
      const results = (searchResult.result as any)?.value?.results || [];
      if (results.length > 0) {
        // Fetch the top result
        const fetchResult = await executeTool('web_fetch', { url: results[0].url });
        if (fetchResult.ok && fetchResult.result) {
          apiDocs = (fetchResult.result as any)?.value?.text || '';
        }
      }
    }
  }

  // 3. Generate integration code
  let generated: import('../generative/codeGenerationService.js').GeneratedToolCode;
  try {
    generated = await generateIntegrationCode(opts.purpose, apiDocs, {
      orgId,
      serviceKey: 'toolFactory.generateIntegration',
      outcomeInstanceId: opts.outcomeInstanceId,
    });
  } catch (err: any) {
    console.error('[toolService] Code generation failed:', err?.message);
    // Return a stub tool that the agent can refine later
    generated = {
      name: opts.purpose.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40),
      description: opts.purpose,
      code: `async function run(input) { return { kind: 'error', error: 'Tool not yet implemented: ${opts.purpose.replace(/'/g, '')}' }; }`,
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {},
      permissions: {},
      testInput: {},
    };
  }

  // 4. Create a slug from the name
  const toolSlug = generated.name.replace(/[^a-z0-9_]/g, '_').slice(0, 50);

  // 5. Register the tool
  const tool = await createTool(orgId, {
    toolId: toolSlug,
    name: generated.name,
    description: generated.description,
    scope: opts.outcomeInstanceId ? 'objective' : 'org',
    sourceType: 'generated',
    inputSchema: generated.inputSchema,
    outputSchema: generated.outputSchema,
    implementation: {
      type: 'hosted_js',
      code: generated.code,
      permissions: generated.permissions,
    },
    workspaceId: opts.workspaceId,
    outcomeInstanceId: opts.outcomeInstanceId,
    apiDocsUrl: opts.apiHint,
    createdBy: 'agent',
  });

  return tool;
}

// ---------------------------------------------------------------------------
// Test a custom tool
// ---------------------------------------------------------------------------

export async function testTool(orgId: string, toolId: string, testInput: Record<string, unknown>): Promise<{
  passed: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}> {
  const tool = await getTool(orgId, toolId);
  if (!tool) throw new Error('Tool not found');

  const impl = tool.implementation as any;
  if (!impl?.code) throw new Error('Tool has no implementation code');

  const startTime = Date.now();

  try {
    const result = await executeHostedJS({
      code: impl.code,
      input: testInput,
      permissions: impl.permissions || {},
      timeoutMs: 15000,
    });

    const durationMs = Date.now() - startTime;
    const passed = result.ok !== false;

    // Save test result
    const testResults = ((tool.testResults || []) as any[]);
    testResults.push({
      input: testInput,
      actual: result.ok ? result.body : result.error,
      passed,
      testedAt: new Date().toISOString(),
    });

    await db.update(dynamicTools).set({
      testResults,
      status: passed ? 'active' : 'failed',
      updatedAt: new Date(),
    } as any).where(eq(dynamicTools.id, toolId));

    return { passed, result: result.ok ? result.body : undefined, error: result.error, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return { passed: false, error: err?.message, durationMs };
  }
}

// ---------------------------------------------------------------------------
// Promote scope (objective → org)
// ---------------------------------------------------------------------------

export async function promoteTool(orgId: string, toolId: string) {
  return updateTool(orgId, toolId, { status: 'active' } as any);
}

// ---------------------------------------------------------------------------
// Build AgentTool instances from custom tools
// ---------------------------------------------------------------------------

/**
 * Load custom tools as AgentTool instances for the agent to use.
 * Merges org-scoped + objective-scoped tools.
 */
export async function getCustomAgentTools(orgId: string, instanceId?: string): Promise<AgentTool[]> {
  const tools = await listTools(orgId, { status: 'active' });

  // Filter to org-scoped and matching objective-scoped
  const applicable = tools.filter(t =>
    t.scope === 'org' ||
    (t.scope === 'objective' && t.outcomeInstanceId === instanceId)
  );

  return applicable.map(t => {
    const impl = t.implementation as any;

    return {
      name: t.toolId,
      description: t.description || t.name,
      inputSchema: (t.inputSchema || {}) as Record<string, unknown>,
      async execute(input: Record<string, unknown>): Promise<AgentToolResult> {
        if (impl?.type === 'hosted_js' && impl.code) {
          const result = await executeHostedJS({
            code: impl.code,
            input,
            permissions: impl.permissions || {},
            timeoutMs: 15000,
          });

          // Track usage
          db.update(dynamicTools).set({
            reuseCount: (t.reuseCount || 0) + 1,
            updatedAt: new Date(),
          } as any).where(eq(dynamicTools.id, t.id)).catch(() => {});

          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, result: result.body };
        }

        if (impl?.type === 'http' && impl.httpConfig) {
          // HTTP-based tool execution
          try {
            const config = impl.httpConfig;
            const url = `${config.baseUrl}${config.path}`;
            const resp = await fetch(url, {
              method: config.method || 'GET',
              headers: { 'Content-Type': 'application/json', ...config.headers },
              ...(config.method !== 'GET' ? { body: JSON.stringify(input) } : {}),
            });
            const data = await resp.json().catch(() => resp.text());
            return { ok: resp.ok, result: data, error: resp.ok ? undefined : `HTTP ${resp.status}` };
          } catch (err: any) {
            return { ok: false, error: err?.message };
          }
        }

        return { ok: false, error: `Unsupported implementation type: ${impl?.type}` };
      },
    } satisfies AgentTool;
  });
}
