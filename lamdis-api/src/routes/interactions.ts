import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db.js';
import {
  outcomeTypes,
  outcomeGroups,
  proofExpectations,
  outcomeInstances,
  evidenceEvents,
  analysisJobs,
} from '@lamdis/db/schema';
import { eq, and, desc, asc, count, sql, inArray, gte, lte, isNotNull } from 'drizzle-orm';
import { suggestFromRequirement, suggestAdditionalChecks } from '../services/intelligence/policyIngestionEngine.js';
import { analyzeCode } from '../services/intelligence/codeAnalysisEngine.js';
import { bedrockChatOnce, type ChatMessage } from '../lib/bedrockChat.js';
import { hasScope } from './api-keys.js';
import { createAuditLog, buildAuditContextFromRequest } from '../services/auditService.js';
import { fireInstanceWebhook } from '../services/instanceWebhooks.js';

/**
 * Resolve orgId from either JWT auth or API key auth.
 * For API key requests, verifies the URL orgId matches the key's orgId and checks the required scope.
 * Returns the orgId or sends an error reply and returns null.
 */
function resolveOrgId(
  req: FastifyRequest,
  reply: FastifyReply,
  requiredScope?: string,
): string | null {
  const { orgId } = req.params as { orgId: string };
  const apiKeyAuth = (req as any).apiKeyAuth as { orgId: string; scopes: string[] } | undefined;

  if (apiKeyAuth) {
    // Verify URL orgId matches the API key's org
    if (orgId !== apiKeyAuth.orgId) {
      reply.code(403).send({ error: 'API key does not belong to this organization' });
      return null;
    }
    // Check required scope
    if (requiredScope && !hasScope(apiKeyAuth.scopes, requiredScope)) {
      reply.code(403).send({ error: `API key missing required scope: ${requiredScope}` });
      return null;
    }
    return orgId;
  }

  // JWT auth — orgId comes from URL, access already verified by auth plugin
  return orgId;
}

const EVENT_GEN_MODEL = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001-v1:0';

function parseJsonResponse<T>(response: string): T {
  let raw = response.trim()
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```\s*$/, '');

  try {
    return JSON.parse(raw) as T;
  } catch {
    raw = raw.replace(/,\s*$/, '');
    const quoteCount = (raw.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) raw += '"';
    let braces = 0, brackets = 0, inString = false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"' && (i === 0 || raw[i - 1] !== '\\')) { inString = !inString; continue; }
      if (inString) continue;
      if (raw[i] === '{') braces++;
      else if (raw[i] === '}') braces--;
      else if (raw[i] === '[') brackets++;
      else if (raw[i] === ']') brackets--;
    }
    raw = raw.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
    braces = 0; brackets = 0; inString = false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"' && (i === 0 || raw[i - 1] !== '\\')) { inString = !inString; continue; }
      if (inString) continue;
      if (raw[i] === '{') braces++;
      else if (raw[i] === '}') braces--;
      else if (raw[i] === '[') brackets++;
      else if (raw[i] === ']') brackets--;
    }
    while (braces > 0) { raw += '}'; braces--; }
    while (brackets > 0) { raw += ']'; brackets--; }
    return JSON.parse(raw) as T;
  }
}

// ---------------------------------------------------------------------------
// Helper: register the same handler at both the new (canonical) and old (alias) path
// ---------------------------------------------------------------------------
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

function dual(
  fastify: FastifyInstance,
  method: HttpMethod,
  newPath: string,
  aliasPath: string,
  handler: (req: FastifyRequest, reply: FastifyReply) => Promise<any>,
) {
  fastify[method](newPath, handler);
  fastify[method](aliasPath, handler);
  // Add /objectives alias for /outcomes routes
  if (newPath.includes('/outcomes')) {
    fastify[method](newPath.replace('/outcomes', '/objectives'), handler);
  }
  if (newPath.includes('/outcome-instances')) {
    fastify[method](newPath.replace('/outcome-instances', '/objective-instances'), handler);
  }
}

export default async function workflowRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // API KEY INFO (for MCP server + external tools)
  // =========================================================================

  // Returns orgId and scopes for the authenticated API key
  fastify.get('/v1/key-info', async (req, reply) => {
    const apiKeyAuth = (req as any).apiKeyAuth as { orgId: string; scopes: string[] } | undefined;
    if (!apiKeyAuth) {
      return reply.code(401).send({ error: 'This endpoint requires API key authentication via x-lamdis-api-key header' });
    }
    return { orgId: apiKeyAuth.orgId, scopes: apiKeyAuth.scopes };
  });

  // =========================================================================
  // OUTCOME TYPES CRUD  (alias: workflows)
  // =========================================================================

  // List outcome types
  dual(fastify, 'get',
    '/orgs/:orgId/outcomes',
    '/orgs/:orgId/workflows',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const rows = await db.select().from(outcomeTypes)
        .where(eq(outcomeTypes.orgId, orgId))
        .orderBy(desc(outcomeTypes.updatedAt));
      return reply.send(rows);
    },
  );

  // Get outcome type by ID
  dual(fastify, 'get',
    '/orgs/:orgId/outcomes/:id',
    '/orgs/:orgId/workflows/:id',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const { id } = req.params as { id: string };
      const [row] = await db.select().from(outcomeTypes)
        .where(and(eq(outcomeTypes.id, id), eq(outcomeTypes.orgId, orgId)))
        .limit(1);
      if (!row) return reply.code(404).send({ error: 'Outcome type not found' });

      // Get proof expectations (full list)
      const proofExpectationsList = await db.select().from(proofExpectations)
        .where(eq(proofExpectations.outcomeTypeId, id))
        .orderBy(asc(proofExpectations.createdAt));

      // Get recent instances
      const recentInstances = await db.select().from(outcomeInstances)
        .where(eq(outcomeInstances.outcomeTypeId, id))
        .orderBy(desc(outcomeInstances.createdAt))
        .limit(10);

      return reply.send({
        ...row,
        checkCount: proofExpectationsList.length,
        proofExpectations: proofExpectationsList,
        recentInstances,
      });
    },
  );

  // Create outcome type
  dual(fastify, 'post',
    '/orgs/:orgId/outcomes',
    '/orgs/:orgId/workflows',
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const body = req.body as any;

      const [created] = await db.insert(outcomeTypes).values({
        orgId,
        suiteId: body.suiteId || null,
        name: body.name,
        description: body.description,
        category: body.category || 'operational',
        tags: body.tags || [],
        labels: body.labels || [],
        expectedEventTypes: body.expectedEventTypes || [],
        boundaryConfig: body.boundaryConfig,
        timeoutMs: body.timeoutMs || 1800000,
        syntheticScript: body.syntheticScript,
        webhook: body.webhook,
        webhookSecondary: body.webhookSecondary,
        storageMode: body.storageMode || 'standard',
        vault: body.vault,
        // New outcome-specific fields
        successCriteria: body.successCriteria || [],
        keyDecisions: body.keyDecisions || [],
        automationBoundaries: body.automationBoundaries || {},
        connectedSystems: body.connectedSystems || [],
        riskClass: body.riskClass || 'standard',
        createdBy: (req as any).user?.sub,
      }).returning();

      return reply.code(201).send(created);
    },
  );

  // Update outcome type
  dual(fastify, 'put',
    '/orgs/:orgId/outcomes/:id',
    '/orgs/:orgId/workflows/:id',
    async (req, reply) => {
      const { orgId, id } = req.params as { orgId: string; id: string };
      const body = req.body as any;

      const [updated] = await db.update(outcomeTypes)
        .set({
          name: body.name,
          description: body.description,
          category: body.category,
          tags: body.tags,
          labels: body.labels,
          expectedEventTypes: body.expectedEventTypes,
          boundaryConfig: body.boundaryConfig,
          timeoutMs: body.timeoutMs,
          syntheticScript: body.syntheticScript,
          suiteId: body.suiteId,
          disabled: body.disabled,
          webhook: body.webhook,
          webhookSecondary: body.webhookSecondary,
          storageMode: body.storageMode,
          vault: body.vault,
          // New outcome-specific fields
          successCriteria: body.successCriteria,
          keyDecisions: body.keyDecisions,
          automationBoundaries: body.automationBoundaries,
          connectedSystems: body.connectedSystems,
          riskClass: body.riskClass,
          updatedAt: new Date(),
        })
        .where(and(eq(outcomeTypes.id, id), eq(outcomeTypes.orgId, orgId)))
        .returning();

      if (!updated) return reply.code(404).send({ error: 'Outcome type not found' });
      return reply.send(updated);
    },
  );

  // Delete outcome type
  dual(fastify, 'delete',
    '/orgs/:orgId/outcomes/:id',
    '/orgs/:orgId/workflows/:id',
    async (req, reply) => {
      const { orgId, id } = req.params as { orgId: string; id: string };
      await db.delete(outcomeTypes)
        .where(and(eq(outcomeTypes.id, id), eq(outcomeTypes.orgId, orgId)));
      return reply.code(204).send();
    },
  );

  // =========================================================================
  // ALL PROOF EXPECTATIONS (cross-outcome-type)
  // =========================================================================

  dual(fastify, 'get',
    '/orgs/:orgId/proof-expectations',
    '/orgs/:orgId/policy-checks',
    async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const { scope } = (req.query || {}) as { scope?: string };
      // LEFT join so global / playbook / category-scoped rules (which have
      // a NULL outcomeTypeId) are still returned. outcomeName is undefined
      // for those rows.
      const conditions = [eq(proofExpectations.orgId, orgId)];
      if (scope) conditions.push(eq(proofExpectations.scope, scope as any));
      const rows = await db.select({
        check: proofExpectations,
        outcomeName: outcomeTypes.name,
      })
        .from(proofExpectations)
        .leftJoin(outcomeTypes, eq(proofExpectations.outcomeTypeId, outcomeTypes.id))
        .where(and(...conditions))
        .orderBy(desc(proofExpectations.createdAt));
      // Return flat shape for the new rules UI; keep `check` nested for
      // legacy callers that expected it.
      return reply.send(rows.map((r) => ({ ...r.check, outcomeName: r.outcomeName ?? null })));
    },
  );

  // =========================================================================
  // PROOF EXPECTATIONS CRUD  (alias: checks)
  // =========================================================================

  // List proof expectations for an outcome type
  // New path uses :outcomeTypeId, alias keeps :workflowId
  fastify.get('/orgs/:orgId/outcomes/:outcomeTypeId/proof-expectations', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { outcomeTypeId } = req.params as { outcomeTypeId: string };
    const rows = await db.select().from(proofExpectations)
      .where(eq(proofExpectations.outcomeTypeId, outcomeTypeId))
      .orderBy(asc(proofExpectations.createdAt));
    return reply.send(rows);
  });

  fastify.get('/orgs/:orgId/workflows/:workflowId/checks', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { workflowId } = req.params as { workflowId: string };
    const rows = await db.select().from(proofExpectations)
      .where(eq(proofExpectations.outcomeTypeId, workflowId))
      .orderBy(asc(proofExpectations.createdAt));
    return reply.send(rows);
  });

  // Create proof expectation
  fastify.post('/orgs/:orgId/outcomes/:outcomeTypeId/proof-expectations', async (req, reply) => {
    const { orgId, outcomeTypeId } = req.params as { orgId: string; outcomeTypeId: string };
    const body = req.body as any;

    const [created] = await db.insert(proofExpectations).values({
      orgId,
      outcomeTypeId,
      name: body.name,
      description: body.description,
      category: body.category || 'compliance',
      severity: body.severity || 'error',
      checkType: body.checkType,
      config: body.config || {},
      requiredEvidenceLevel: body.requiredEvidenceLevel || 'A',
      judgeThreshold: body.judgeThreshold || 0.75,
      onPass: body.onPass || [],
      onFail: body.onFail || [],
      appliesTo: body.appliesTo,
      enabled: body.enabled !== false,
    }).returning();

    return reply.code(201).send(created);
  });

  fastify.post('/orgs/:orgId/workflows/:workflowId/checks', async (req, reply) => {
    const { orgId, workflowId } = req.params as { orgId: string; workflowId: string };
    const body = req.body as any;

    const [created] = await db.insert(proofExpectations).values({
      orgId,
      outcomeTypeId: workflowId,
      name: body.name,
      description: body.description,
      category: body.category || 'compliance',
      severity: body.severity || 'error',
      checkType: body.checkType,
      config: body.config || {},
      requiredEvidenceLevel: body.requiredEvidenceLevel || 'A',
      judgeThreshold: body.judgeThreshold || 0.75,
      onPass: body.onPass || [],
      onFail: body.onFail || [],
      appliesTo: body.appliesTo,
      enabled: body.enabled !== false,
    }).returning();

    return reply.code(201).send(created);
  });

  // Update proof expectation
  fastify.put('/orgs/:orgId/outcomes/:outcomeTypeId/proof-expectations/:checkId', async (req, reply) => {
    const { checkId } = req.params as { orgId: string; outcomeTypeId: string; checkId: string };
    const body = req.body as any;

    const [updated] = await db.update(proofExpectations)
      .set({
        name: body.name,
        description: body.description,
        category: body.category,
        severity: body.severity,
        checkType: body.checkType,
        config: body.config,
        requiredEvidenceLevel: body.requiredEvidenceLevel,
        judgeThreshold: body.judgeThreshold,
        onPass: body.onPass,
        onFail: body.onFail,
        appliesTo: body.appliesTo,
        enabled: body.enabled,
        updatedAt: new Date(),
      })
      .where(eq(proofExpectations.id, checkId))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Proof expectation not found' });
    return reply.send(updated);
  });

  fastify.put('/orgs/:orgId/workflows/:workflowId/checks/:checkId', async (req, reply) => {
    const { checkId } = req.params as { orgId: string; workflowId: string; checkId: string };
    const body = req.body as any;

    const [updated] = await db.update(proofExpectations)
      .set({
        name: body.name,
        description: body.description,
        category: body.category,
        severity: body.severity,
        checkType: body.checkType,
        config: body.config,
        requiredEvidenceLevel: body.requiredEvidenceLevel,
        judgeThreshold: body.judgeThreshold,
        onPass: body.onPass,
        onFail: body.onFail,
        appliesTo: body.appliesTo,
        enabled: body.enabled,
        updatedAt: new Date(),
      })
      .where(eq(proofExpectations.id, checkId))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Check not found' });
    return reply.send(updated);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scoped proof expectations — global / outcome_type / playbook / category
  //
  // The legacy routes above (POST /outcomes/:outcomeTypeId/proof-expectations)
  // still work and implicitly create scope='outcome_type' rows. These new
  // routes accept any of the four scopes via the body, so the policy editor
  // UI can create rules attached at any level.
  // ─────────────────────────────────────────────────────────────────────────

  function validateScopeBody(body: any): { ok: true } | { ok: false; error: string } {
    const scope = body?.scope;
    if (!['global', 'outcome_type', 'playbook', 'category'].includes(scope)) {
      return { ok: false, error: 'scope must be one of global|outcome_type|playbook|category' };
    }
    if (scope === 'outcome_type' && !body.outcomeTypeId) return { ok: false, error: 'outcomeTypeId required when scope=outcome_type' };
    if (scope === 'playbook' && !body.playbookId) return { ok: false, error: 'playbookId required when scope=playbook' };
    if (scope === 'category' && !body.categoryId) return { ok: false, error: 'categoryId required when scope=category' };
    return { ok: true };
  }

  fastify.post('/orgs/:orgId/proof-expectations', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as any;
    const v = validateScopeBody(body);
    if (!v.ok) return reply.code(400).send({ error: v.error });

    const [created] = await db.insert(proofExpectations).values({
      orgId,
      scope: body.scope,
      outcomeTypeId: body.scope === 'outcome_type' ? body.outcomeTypeId : null,
      playbookId: body.scope === 'playbook' ? body.playbookId : null,
      categoryId: body.scope === 'category' ? body.categoryId : null,
      name: body.name,
      description: body.description,
      category: body.category || 'compliance',
      severity: body.severity || 'error',
      checkType: body.checkType,
      config: body.config || {},
      requiredEvidenceLevel: body.requiredEvidenceLevel || 'A',
      judgeThreshold: body.judgeThreshold || 0.75,
      onPass: body.onPass || [],
      onFail: body.onFail || [],
      appliesTo: body.appliesTo,
      enabled: body.enabled !== false,
    } as any).returning();

    return reply.code(201).send(created);
  });

  fastify.put('/orgs/:orgId/proof-expectations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const v = validateScopeBody(body);
    if (!v.ok) return reply.code(400).send({ error: v.error });

    const [updated] = await db.update(proofExpectations).set({
      scope: body.scope,
      outcomeTypeId: body.scope === 'outcome_type' ? body.outcomeTypeId : null,
      playbookId: body.scope === 'playbook' ? body.playbookId : null,
      categoryId: body.scope === 'category' ? body.categoryId : null,
      name: body.name,
      description: body.description,
      category: body.category,
      severity: body.severity,
      checkType: body.checkType,
      config: body.config,
      requiredEvidenceLevel: body.requiredEvidenceLevel,
      judgeThreshold: body.judgeThreshold,
      onPass: body.onPass,
      onFail: body.onFail,
      appliesTo: body.appliesTo,
      enabled: body.enabled,
      updatedAt: new Date(),
    } as any).where(eq(proofExpectations.id, id)).returning();

    if (!updated) return reply.code(404).send({ error: 'Proof expectation not found' });
    return reply.send(updated);
  });

  fastify.delete('/orgs/:orgId/proof-expectations/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const result = await db.delete(proofExpectations)
      .where(and(eq(proofExpectations.id, id), eq(proofExpectations.orgId, orgId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Proof expectation not found' });
    return reply.code(204).send();
  });

  // Delete proof expectation
  fastify.delete('/orgs/:orgId/outcomes/:outcomeTypeId/proof-expectations/:checkId', async (req, reply) => {
    const { checkId } = req.params as { orgId: string; outcomeTypeId: string; checkId: string };
    await db.delete(proofExpectations).where(eq(proofExpectations.id, checkId));
    return reply.code(204).send();
  });

  fastify.delete('/orgs/:orgId/workflows/:workflowId/checks/:checkId', async (req, reply) => {
    const { checkId } = req.params as { orgId: string; workflowId: string; checkId: string };
    await db.delete(proofExpectations).where(eq(proofExpectations.id, checkId));
    return reply.code(204).send();
  });

  // =========================================================================
  // INTELLIGENCE: Generate Event Types from Outcome Context
  // =========================================================================

  /**
   * POST /orgs/:orgId/outcomes/generate-events  (alias: /orgs/:orgId/workflows/generate-events)
   *
   * Given an outcome name/description/category, suggest event types
   * with instrumentation guidance (SDK snippets + confirmation levels).
   */
  dual(fastify, 'post',
    '/orgs/:orgId/outcomes/generate-events',
    '/orgs/:orgId/workflows/generate-events',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const body = req.body as {
        name: string;
        description?: string;
        category?: string;
        existingEventTypes?: string[];
        checks?: Array<{ name: string; checkType: string; requiredEvidenceLevel?: string }>;
      };

      if (!body.name || body.name.trim().length < 2) {
        return reply.code(400).send({ error: 'Outcome type name is required' });
      }

      try {
        const result = await generateEventTypes({
          ...body,
          meterContext: { orgId, serviceKey: 'route.generateEventTypes' },
        });
        return reply.send(result);
      } catch (err: any) {
        req.log.error({ err }, 'Event type generation failed');
        return reply.code(500).send({ error: 'Failed to generate event types', details: err?.message });
      }
    },
  );

  /**
   * POST /orgs/:orgId/outcomes/:id/generate-events  (alias: /orgs/:orgId/workflows/:id/generate-events)
   *
   * Same as above but for an existing outcome type — also considers existing checks from DB.
   */
  dual(fastify, 'post',
    '/orgs/:orgId/outcomes/:id/generate-events',
    '/orgs/:orgId/workflows/:id/generate-events',
    async (req, reply) => {
      const { orgId, id } = req.params as { orgId: string; id: string };

      const [outcomeType] = await db.select().from(outcomeTypes)
        .where(and(eq(outcomeTypes.id, id), eq(outcomeTypes.orgId, orgId)))
        .limit(1);
      if (!outcomeType) return reply.code(404).send({ error: 'Outcome type not found' });

      const existingChecks = await db.select({
        name: proofExpectations.name,
        checkType: proofExpectations.checkType,
        requiredEvidenceLevel: proofExpectations.requiredEvidenceLevel,
      }).from(proofExpectations).where(eq(proofExpectations.outcomeTypeId, id));

      try {
        const result = await generateEventTypes({
          name: outcomeType.name,
          description: outcomeType.description || undefined,
          category: outcomeType.category || undefined,
          existingEventTypes: outcomeType.expectedEventTypes || [],
          checks: existingChecks.map(c => ({
            name: c.name,
            checkType: c.checkType,
            requiredEvidenceLevel: c.requiredEvidenceLevel || undefined,
          })),
          meterContext: { orgId, serviceKey: 'route.generateEventTypes', outcomeTypeId: id },
        });
        return reply.send(result);
      } catch (err: any) {
        req.log.error({ err }, 'Event type generation failed');
        return reply.code(500).send({ error: 'Failed to generate event types', details: err?.message });
      }
    },
  );

  // =========================================================================
  // INTELLIGENCE: Policy Suggestion from Natural Language
  // =========================================================================

  /**
   * POST /orgs/:orgId/outcomes/suggest  (alias: /orgs/:orgId/workflows/suggest)
   *
   * "Give Lamdis a requirement or bad outcome you care about"
   * → Returns structured outcome type + checks + instrumentation snippets
   */
  dual(fastify, 'post',
    '/orgs/:orgId/outcomes/suggest',
    '/orgs/:orgId/workflows/suggest',
    async (req, reply) => {
      const body = req.body as {
        text: string;
        category?: string;
        industry?: string;
        codeContext?: string;
      };

      if (!body.text || body.text.trim().length < 10) {
        return reply.code(400).send({ error: 'Requirement text must be at least 10 characters' });
      }

      const { orgId } = req.params as { orgId: string };

      // Track as analysis job
      const [job] = await db.insert(analysisJobs).values({
        orgId,
        type: 'policy_import',
        status: 'running',
        inputSummary: { text: body.text.slice(0, 200), category: body.category },
        startedAt: new Date(),
      } as any).returning();

      try {
        const suggestion = await suggestFromRequirement({
          text: body.text,
          category: body.category,
          industry: body.industry,
          codeContext: body.codeContext,
        }, { orgId, serviceKey: 'route.policySuggest' });

        if (job) {
          await db.update(analysisJobs).set({
            status: 'completed',
            result: { checksCount: suggestion.checks?.length || 0 },
            completedAt: new Date(),
          }).where(eq(analysisJobs.id, job.id));
        }

        return reply.send(suggestion);
      } catch (err: any) {
        if (job) {
          await db.update(analysisJobs).set({
            status: 'failed',
            error: { message: err?.message },
            completedAt: new Date(),
          }).where(eq(analysisJobs.id, job.id));
        }
        req.log.error({ err }, 'Policy suggestion failed');
        return reply.code(500).send({ error: 'Failed to generate suggestions', details: err?.message });
      }
    },
  );

  /**
   * POST /orgs/:orgId/outcomes/:id/suggest-additional  (alias: /orgs/:orgId/workflows/:id/suggest-additional)
   *
   * Add more checks to an existing outcome type based on new policy text.
   */
  dual(fastify, 'post',
    '/orgs/:orgId/outcomes/:id/suggest-additional',
    '/orgs/:orgId/workflows/:id/suggest-additional',
    async (req, reply) => {
      const { orgId, id } = req.params as { orgId: string; id: string };
      const body = req.body as { text: string };

      const [outcomeType] = await db.select().from(outcomeTypes)
        .where(and(eq(outcomeTypes.id, id), eq(outcomeTypes.orgId, orgId)))
        .limit(1);
      if (!outcomeType) return reply.code(404).send({ error: 'Outcome type not found' });

      const existingChecks = await db.select({ name: proofExpectations.name, checkType: proofExpectations.checkType })
        .from(proofExpectations)
        .where(eq(proofExpectations.outcomeTypeId, id));

      try {
        const result = await suggestAdditionalChecks(
          outcomeType.name,
          outcomeType.description || '',
          outcomeType.expectedEventTypes || [],
          existingChecks,
          body.text,
          { orgId, serviceKey: 'route.suggestAdditionalChecks', outcomeTypeId: id },
        );
        return reply.send(result);
      } catch (err: any) {
        return reply.code(500).send({ error: 'Failed to generate suggestions', details: err?.message });
      }
    },
  );

  /**
   * POST /orgs/:orgId/outcomes/:id/activate-suggestions  (alias: /orgs/:orgId/workflows/:id/activate-suggestions)
   *
   * Take a suggestion object and create real outcome type + proof expectations from it.
   */
  dual(fastify, 'post',
    '/orgs/:orgId/outcomes/:id/activate-suggestions',
    '/orgs/:orgId/workflows/:id/activate-suggestions',
    async (req, reply) => {
      const { orgId, id } = req.params as { orgId: string; id: string };
      const body = req.body as {
        checks: Array<{
          name: string;
          description?: string;
          category?: string;
          severity?: string;
          checkType: string;
          config: Record<string, unknown>;
          requiredEvidenceLevel?: string;
        }>;
        newEventTypes?: string[];
      };

      // Add new event types to the outcome type
      if (body.newEventTypes && body.newEventTypes.length > 0) {
        const [outcomeType] = await db.select({ expectedEventTypes: outcomeTypes.expectedEventTypes })
          .from(outcomeTypes).where(eq(outcomeTypes.id, id)).limit(1);

        if (outcomeType) {
          const existing = new Set(outcomeType.expectedEventTypes || []);
          for (const t of body.newEventTypes) existing.add(t);
          await db.update(outcomeTypes)
            .set({ expectedEventTypes: Array.from(existing), updatedAt: new Date() })
            .where(eq(outcomeTypes.id, id));
        }
      }

      // Create proof expectations
      const created = [];
      for (const check of body.checks) {
        const [row] = await db.insert(proofExpectations).values({
          orgId,
          outcomeTypeId: id,
          name: check.name,
          description: check.description,
          category: (check.category || 'compliance') as any,
          severity: (check.severity || 'error') as any,
          checkType: check.checkType as any,
          config: check.config,
          requiredEvidenceLevel: (check.requiredEvidenceLevel || 'A') as any,
        }).returning();
        created.push(row);
      }

      return reply.code(201).send({ activated: created.length, checks: created });
    },
  );

  // =========================================================================
  // INTELLIGENCE: Code Analysis
  // =========================================================================

  /**
   * POST /orgs/:orgId/code-analysis/analyze
   *
   * Submit code for full analysis: discover outcomes, detect boundaries,
   * suggest instrumentation, and optionally map to existing policies.
   */
  fastify.post('/orgs/:orgId/code-analysis/analyze', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      code: string;
      filePath?: string;
      language?: string;
      description?: string;
      relatedCode?: Array<{ filePath: string; code: string }>;
      mapToExistingPolicies?: boolean;
    };

    if (!body.code || body.code.trim().length < 50) {
      return reply.code(400).send({ error: 'Code must be at least 50 characters' });
    }

    // Optionally get existing outcome type policies to map against
    let existingPolicies: Array<{ name: string; description: string }> | undefined;
    if (body.mapToExistingPolicies) {
      const orgOutcomeTypes = await db.select({
        name: outcomeTypes.name,
        description: outcomeTypes.description,
      }).from(outcomeTypes).where(eq(outcomeTypes.orgId, orgId));

      const orgChecks = await db.select({
        name: proofExpectations.name,
        description: proofExpectations.description,
      }).from(proofExpectations).where(eq(proofExpectations.orgId, orgId));

      existingPolicies = [
        ...orgOutcomeTypes.map(i => ({ name: i.name, description: i.description || '' })),
        ...orgChecks.map(c => ({ name: c.name, description: c.description || '' })),
      ];
    }

    // Track as analysis job
    const [job] = await db.insert(analysisJobs).values({
      orgId,
      type: 'code_analysis',
      status: 'running',
      inputSummary: { filePath: body.filePath, language: body.language, codeLength: body.code.length },
      startedAt: new Date(),
    } as any).returning();

    try {
      const analysis = await analyzeCode(
        {
          code: body.code,
          filePath: body.filePath,
          language: body.language,
          description: body.description,
          relatedCode: body.relatedCode,
        },
        { orgId, serviceKey: 'route.analyzeCode' },
        existingPolicies,
      );

      if (job) {
        await db.update(analysisJobs).set({
          status: 'completed',
          result: {
            workflowsFound: analysis.discoveredWorkflows?.length || 0,
            boundariesFound: analysis.boundaries?.length || 0,
            instrumentationPoints: analysis.instrumentationPoints?.length || 0,
          },
          completedAt: new Date(),
        }).where(eq(analysisJobs.id, job.id));
      }

      return reply.send(analysis);
    } catch (err: any) {
      if (job) {
        await db.update(analysisJobs).set({
          status: 'failed',
          error: { message: err?.message },
          completedAt: new Date(),
        }).where(eq(analysisJobs.id, job.id));
      }
      req.log.error({ err }, 'Code analysis failed');
      return reply.code(500).send({ error: 'Failed to analyze code', details: err?.message });
    }
  });

  // =========================================================================
  // OUTCOME INSTANCES  (alias: instances)
  // =========================================================================

  // List outcome instances
  dual(fastify, 'get',
    '/orgs/:orgId/outcome-instances',
    '/orgs/:orgId/instances',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const query = req.query as {
        workflowId?: string;
        outcomeTypeId?: string;
        environment?: string;
        status?: string;
        reviewStatus?: string;
        needsAttention?: string;
        // New filters
        proofStatus?: string;
        automationMode?: string;
        stalledOnly?: string;
        limit?: string;
        offset?: string;
      };

      const conditions = [eq(outcomeInstances.orgId, orgId)];

      // Accept both outcomeTypeId (new) and workflowId (legacy) filter params
      const typeId = query.outcomeTypeId || query.workflowId;
      if (typeId) conditions.push(eq(outcomeInstances.outcomeTypeId, typeId));

      if (query.environment) conditions.push(eq(outcomeInstances.environment, query.environment));
      if (query.status) conditions.push(eq(outcomeInstances.status, query.status));
      if (query.reviewStatus) conditions.push(eq(outcomeInstances.reviewStatus, query.reviewStatus));
      if (query.needsAttention === 'true') {
        conditions.push(
          and(
            inArray(outcomeInstances.status, ['failed', 'error']),
            inArray(outcomeInstances.reviewStatus, ['pending_review', 'needs_investigation']),
          )!,
        );
      }

      // New filters
      if (query.proofStatus) conditions.push(eq(outcomeInstances.proofStatus, query.proofStatus));
      if (query.automationMode) conditions.push(eq(outcomeInstances.automationMode, query.automationMode));
      if (query.stalledOnly === 'true') {
        conditions.push(isNotNull(outcomeInstances.stalledSince));
      }

      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = parseInt(query.offset || '0', 10);

      const rows = await db.select().from(outcomeInstances)
        .where(and(...conditions))
        .orderBy(desc(outcomeInstances.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await db.select({ count: count() }).from(outcomeInstances)
        .where(and(...conditions));

      // Status counts aggregation
      const statusCounts = await db.select({
        status: outcomeInstances.status,
        reviewStatus: outcomeInstances.reviewStatus,
        count: count(),
      })
        .from(outcomeInstances)
        .where(eq(outcomeInstances.orgId, orgId))
        .groupBy(outcomeInstances.status, outcomeInstances.reviewStatus);

      return reply.send({ instances: rows, total: totalRow?.count || 0, limit, offset, statusCounts });
    },
  );

  // Create outcome instance (used by builder → agent handoff)
  dual(fastify, 'post',
    '/orgs/:orgId/outcome-instances',
    '/orgs/:orgId/instances',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:write');
      if (!orgId) return;

      const body = req.body as {
        outcomeTypeId: string;
        goalDescription?: string;
        guidelines?: Record<string, unknown>;
        agentEnabled?: boolean;
        environment?: string;
      };

      if (!body.outcomeTypeId) {
        return reply.code(400).send({ error: 'outcomeTypeId is required' });
      }

      const [created] = await db.insert(outcomeInstances).values({
        orgId,
        outcomeTypeId: body.outcomeTypeId,
        environment: body.environment || 'production',
        trigger: 'agent',
        status: 'open',
        agentEnabled: body.agentEnabled ?? true,
        agentStatus: body.agentEnabled !== false ? 'idle' : undefined,
        goalDescription: body.goalDescription,
        guidelines: body.guidelines,
      } as any).returning();

      return reply.send(created);
    },
  );

  // Get outcome instance detail with events
  dual(fastify, 'get',
    '/orgs/:orgId/outcome-instances/:id',
    '/orgs/:orgId/instances/:id',
    async (req, reply) => {
      const { orgId, id } = req.params as { orgId: string; id: string };

      const [instance] = await db.select().from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);

      if (!instance) return reply.code(404).send({ error: 'Instance not found' });

      // Get the outcome type definition if matched
      let outcomeTypeDef = null;
      if (instance.outcomeTypeId) {
        const [row] = await db.select().from(outcomeTypes)
          .where(eq(outcomeTypes.id, instance.outcomeTypeId)).limit(1);
        outcomeTypeDef = row || null;
      }

      return reply.send({ ...instance, outcome: outcomeTypeDef, workflow: outcomeTypeDef });
    },
  );

  // Get events for an instance (timeline)
  dual(fastify, 'get',
    '/orgs/:orgId/outcome-instances/:id/events',
    '/orgs/:orgId/instances/:id/events',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const { id } = req.params as { id: string };

      const events = await db.select().from(evidenceEvents)
        .where(eq(evidenceEvents.outcomeInstanceId, id))
        .orderBy(asc(evidenceEvents.emittedAt));

      return reply.send(events);
    },
  );

  // Get timeline visualization data
  dual(fastify, 'get',
    '/orgs/:orgId/outcome-instances/:id/timeline',
    '/orgs/:orgId/instances/:id/timeline',
    async (req, reply) => {
      const { orgId, id } = req.params as { orgId: string; id: string };

      const [instance] = await db.select().from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);

      if (!instance) return reply.code(404).send({ error: 'Instance not found' });

      const events = await db.select().from(evidenceEvents)
        .where(eq(evidenceEvents.outcomeInstanceId, id))
        .orderBy(asc(evidenceEvents.emittedAt));

      // Build timeline entries with confirmation level colors
      const timeline = events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        source: e.eventSource,
        confirmationLevel: e.confirmationLevel || 'A',
        emittedAt: e.emittedAt,
        payload: e.payload,
      }));

      return reply.send({
        instance: {
          id: instance.id,
          status: instance.status,
          highestConfirmationLevel: instance.highestConfirmationLevel,
          checkResults: instance.checkResults,
          totals: instance.totals,
        },
        timeline,
        eventCount: events.length,
      });
    },
  );

  // =========================================================================
  // INSTANCE REVIEW STATUS
  // =========================================================================

  // Update review status
  dual(fastify, 'patch',
    '/orgs/:orgId/outcome-instances/:id/status',
    '/orgs/:orgId/instances/:id/status',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:write');
      if (!orgId) return;
      const { id } = req.params as { id: string };

      const body = z.object({
        reviewStatus: z.enum(['pending_review', 'approved', 'rejected', 'needs_investigation', 'false_positive', 'acknowledged']),
        reason: z.string().optional(),
      }).parse(req.body as any);

      const [doc] = await db.select().from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);
      if (!doc) return reply.code(404).send({ error: 'Instance not found' });

      // Enforce immutability: if vault.immutable and already approved, block change
      if ((doc as any).vault?.immutable && doc.reviewStatus === 'approved') {
        return reply.code(400).send({ error: 'cannot_modify_immutable_approved_record' });
      }

      const previousStatus = doc.reviewStatus || 'pending_review';
      const user = (req as any).user || {};

      const statusHistoryEntry = {
        previousStatus,
        newStatus: body.reviewStatus,
        changedBy: user.sub || 'unknown',
        changedByEmail: user.email,
        changedByName: user.name,
        reason: body.reason,
        changedAt: new Date().toISOString(),
      };

      const existingHistory = (doc as any).statusHistory || [];

      const [updated] = await db.update(outcomeInstances)
        .set({
          reviewStatus: body.reviewStatus,
          statusHistory: [...existingHistory, statusHistoryEntry],
          updatedAt: new Date(),
        } as any)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .returning();

      await createAuditLog(buildAuditContextFromRequest(req, orgId), 'workflow_instance.status_changed', {
        category: 'compliance',
        severity: 'info',
        resource: { type: 'workflow_instance', id, name: id, collection: 'workflow_instances' },
        before: { reviewStatus: previousStatus },
        after: { reviewStatus: body.reviewStatus },
        details: { reason: body.reason, instanceStatus: doc.status },
      });

      // Fire webhook if outcome type has one configured
      if (doc.outcomeTypeId) {
        const [wf] = await db.select({ id: outcomeTypes.id, name: outcomeTypes.name, webhook: outcomeTypes.webhook, webhookSecondary: outcomeTypes.webhookSecondary })
          .from(outcomeTypes).where(eq(outcomeTypes.id, doc.outcomeTypeId)).limit(1);
        if (wf) {
          fireInstanceWebhook(wf as any, { id, status: doc.status, reviewStatus: body.reviewStatus, totals: doc.totals }, 'review_updated');
        }
      }

      return reply.send(updated);
    },
  );

  // Get audit trail / history
  dual(fastify, 'get',
    '/orgs/:orgId/outcome-instances/:id/history',
    '/orgs/:orgId/instances/:id/history',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const { id } = req.params as { id: string };

      const [doc] = await db.select({
        statusHistory: outcomeInstances.statusHistory,
        comments: outcomeInstances.comments,
        reviewStatus: outcomeInstances.reviewStatus,
        status: outcomeInstances.status,
      }).from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);

      if (!doc) return reply.code(404).send({ error: 'Instance not found' });

      return reply.send({
        instanceId: id,
        currentStatus: doc.status,
        reviewStatus: doc.reviewStatus,
        statusHistory: doc.statusHistory || [],
        comments: doc.comments || [],
      });
    },
  );

  // =========================================================================
  // INSTANCE COMMENTS
  // =========================================================================

  // Add comment
  dual(fastify, 'post',
    '/orgs/:orgId/outcome-instances/:id/comments',
    '/orgs/:orgId/instances/:id/comments',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:write');
      if (!orgId) return;
      const { id } = req.params as { id: string };

      const body = z.object({
        text: z.string().min(1).max(5000),
      }).parse(req.body as any);

      const [doc] = await db.select().from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);
      if (!doc) return reply.code(404).send({ error: 'Instance not found' });

      const user = (req as any).user || {};
      const comment = {
        id: crypto.randomUUID(),
        text: body.text,
        authorSub: user.sub || 'unknown',
        authorEmail: user.email,
        authorName: user.name,
        createdAt: new Date().toISOString(),
        edited: false,
      };

      const existingComments = (doc as any).comments || [];

      const [updated] = await db.update(outcomeInstances)
        .set({
          comments: [...existingComments, comment],
          updatedAt: new Date(),
        } as any)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .returning();

      await createAuditLog(buildAuditContextFromRequest(req, orgId), 'workflow_instance.comment_added', {
        category: 'compliance',
        severity: 'info',
        resource: { type: 'workflow_instance', id, name: id, collection: 'workflow_instances' },
        after: { comment },
        details: { commentId: comment.id },
      });

      return reply.send({ comment, comments: (updated as any).comments });
    },
  );

  // Edit own comment
  dual(fastify, 'patch',
    '/orgs/:orgId/outcome-instances/:id/comments/:commentId',
    '/orgs/:orgId/instances/:id/comments/:commentId',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:write');
      if (!orgId) return;
      const { id, commentId } = req.params as { id: string; commentId: string };

      const body = z.object({
        text: z.string().min(1).max(5000),
      }).parse(req.body as any);

      const [doc] = await db.select().from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);
      if (!doc) return reply.code(404).send({ error: 'Instance not found' });

      const user = (req as any).user || {};
      const existingComments: any[] = (doc as any).comments || [];
      const existingComment = existingComments.find((c: any) => c.id === commentId);

      if (!existingComment) return reply.code(404).send({ error: 'comment_not_found' });
      if (existingComment.authorSub !== user.sub) return reply.code(403).send({ error: 'not_comment_author' });

      const updatedComments = existingComments.map((c: any) =>
        c.id === commentId ? { ...c, text: body.text, updatedAt: new Date().toISOString(), edited: true } : c
      );

      const [updated] = await db.update(outcomeInstances)
        .set({ comments: updatedComments, updatedAt: new Date() } as any)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .returning();

      return reply.send(updated);
    },
  );

  // Delete own comment
  dual(fastify, 'delete',
    '/orgs/:orgId/outcome-instances/:id/comments/:commentId',
    '/orgs/:orgId/instances/:id/comments/:commentId',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:write');
      if (!orgId) return;
      const { id, commentId } = req.params as { id: string; commentId: string };

      const [doc] = await db.select().from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);
      if (!doc) return reply.code(404).send({ error: 'Instance not found' });

      const user = (req as any).user || {};
      const existingComments: any[] = (doc as any).comments || [];
      const existingComment = existingComments.find((c: any) => c.id === commentId);

      if (!existingComment) return reply.code(404).send({ error: 'comment_not_found' });
      if (existingComment.authorSub !== user.sub) return reply.code(403).send({ error: 'not_comment_author' });

      const updatedComments = existingComments.filter((c: any) => c.id !== commentId);

      await db.update(outcomeInstances)
        .set({ comments: updatedComments, updatedAt: new Date() } as any)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)));

      return reply.code(204).send();
    },
  );

  // =========================================================================
  // JIT URL for Customer-Owned Vault
  // =========================================================================

  dual(fastify, 'post',
    '/orgs/:orgId/outcome-instances/:id/jit-url',
    '/orgs/:orgId/instances/:id/jit-url',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const { id } = req.params as { id: string };

      const [instance] = await db.select().from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
        .limit(1);
      if (!instance) return reply.code(404).send({ error: 'Instance not found' });
      if ((instance as any).storageMode !== 'customer_owned') {
        return reply.code(400).send({ error: 'JIT URL only available for customer-owned vault instances' });
      }

      const pointer = (instance as any).tracePointer;
      if (!pointer?.key) {
        return reply.code(400).send({ error: 'Instance has no trace pointer' });
      }

      // Vault broker integration would go here — for now return a placeholder
      return reply.send({
        url: `https://vault-broker.placeholder/${pointer.key}`,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        ttlSeconds: 60,
        artifactKey: pointer.key,
        hashSha256: (instance as any).vault?.traceHash,
      });
    },
  );

  // =========================================================================
  // OUTCOME TYPE EXPORT  (alias: workflow export)
  // =========================================================================

  dual(fastify, 'get',
    '/orgs/:orgId/outcomes/:id/export',
    '/orgs/:orgId/workflows/:id/export',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const { id } = req.params as { id: string };
      const query = req.query as { format?: string; from?: string; to?: string; status?: string; reviewStatus?: string; limit?: string };

      const conditions = [eq(outcomeInstances.orgId, orgId), eq(outcomeInstances.outcomeTypeId, id)];
      if (query.status) conditions.push(eq(outcomeInstances.status, query.status));
      if (query.reviewStatus) conditions.push(eq(outcomeInstances.reviewStatus, query.reviewStatus));
      if (query.from) conditions.push(gte(outcomeInstances.createdAt, new Date(query.from)));
      if (query.to) conditions.push(lte(outcomeInstances.createdAt, new Date(query.to)));

      const docs = await db.select().from(outcomeInstances)
        .where(and(...conditions))
        .orderBy(desc(outcomeInstances.createdAt))
        .limit(Math.min(Number(query.limit || 1000), 5000));

      if (query.format === 'csv') {
        const headers = ['instanceId', 'status', 'reviewStatus', 'eventCount', 'confirmationLevel', 'passed', 'failed', 'completedAt'];
        const rows = docs.map((d: any) => [
          d.id,
          d.status || '',
          d.reviewStatus || '',
          d.eventCount || 0,
          d.highestConfirmationLevel || '',
          d.totals?.passed || 0,
          d.totals?.failed || 0,
          d.completedAt?.toISOString() || '',
        ].join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="outcome-export-${id}-${Date.now()}.csv"`);
        return reply.send(csv);
      }

      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="outcome-export-${id}-${Date.now()}.json"`);
      return reply.send(docs);
    },
  );

  // =========================================================================
  // OUTCOME TYPE STATISTICS  (alias: workflow stats)
  // =========================================================================

  dual(fastify, 'get',
    '/orgs/:orgId/outcomes/:id/stats',
    '/orgs/:orgId/workflows/:id/stats',
    async (req, reply) => {
      const orgId = resolveOrgId(req, reply, 'workflows:read');
      if (!orgId) return;
      const { id } = req.params as { id: string };
      const query = req.query as { from?: string; to?: string };

      const from = query.from ? new Date(query.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const to = query.to ? new Date(query.to) : new Date();

      const statsRows = await db.select({
        total: count(),
        passed: sql<number>`sum(case when ${outcomeInstances.status} = 'passed' then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${outcomeInstances.status} = 'failed' then 1 else 0 end)`,
        open: sql<number>`sum(case when ${outcomeInstances.status} = 'open' then 1 else 0 end)`,
        avgEventCount: sql<number>`avg(${outcomeInstances.eventCount})`,
        pendingReviews: sql<number>`sum(case when ${outcomeInstances.reviewStatus} = 'pending_review' then 1 else 0 end)`,
      })
        .from(outcomeInstances)
        .where(and(
          eq(outcomeInstances.orgId, orgId),
          eq(outcomeInstances.outcomeTypeId, id),
          gte(outcomeInstances.createdAt, from),
          lte(outcomeInstances.createdAt, to),
        ));

      const raw = statsRows[0] || {} as any;
      const stats = {
        total: Number(raw.total) || 0,
        passed: Number(raw.passed) || 0,
        failed: Number(raw.failed) || 0,
        open: Number(raw.open) || 0,
        avgEventCount: Number(raw.avgEventCount) || 0,
        pendingReviews: Number(raw.pendingReviews) || 0,
      };

      return reply.send({
        ...stats,
        passRate: stats.total > 0 ? stats.passed / stats.total : 0,
        period: { from: from.toISOString(), to: to.toISOString() },
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Helper: Generate event types with instrumentation guidance
// ---------------------------------------------------------------------------

async function generateEventTypes(input: {
  name: string;
  description?: string;
  category?: string;
  existingEventTypes?: string[];
  checks?: Array<{ name: string; checkType: string; requiredEvidenceLevel?: string }>;
  meterContext: import('../services/llmCostControl/index.js').MeterContext;
}): Promise<{
  eventTypes: string[];
  instrumentation: Array<{ eventType: string; description: string; confirmationLevel: string; sdkCode: string }>;
}> {
  const systemPrompt = `You are an instrumentation architect for Lamdis, an AI workflow monitoring platform. Given a workflow definition, suggest the event types that should be emitted during this workflow, along with SDK instrumentation code for each.

Event types follow dot-notation convention:
- message.received, message.sent — conversation events
- tool.invoked, tool.completed, tool.failed — tool/function calls
- escalation.triggered, escalation.completed — escalation events
- account.status.read, account.status.changed — state change events
- decision.made — decision points
- boundary.crossed — when visibility ends
- interaction.started, interaction.completed — lifecycle events
- validation.passed, validation.failed — validation events
- notification.sent — outbound notifications
- review.flagged, review.completed — human review events

The Lamdis SDK:
\`\`\`typescript
import { Lamdis } from '@lamdis/sdk';
const lamdis = new Lamdis({ apiKey: process.env.LAMDIS_API_KEY, endpoint: 'https://ingest.lamdis.com', environment: 'production' });
const instance = lamdis.startWorkflow('workflow-key');
await instance.emit('event.type', { /* relevant payload fields */ });
await instance.complete();
\`\`\`

Confirmation levels (resolved server-side per workflow, NOT passed in emit):
- 'A': Observed intent (system decided to act)
- 'B': Attempted action (outbound call made)
- 'C': Acknowledged action (got success response)
- 'D': Confirmed system state (source-of-truth readback)
- 'E': End-to-end completed outcome

Return ONLY a valid JSON object:
{
  "eventTypes": ["list of event type strings"],
  "instrumentation": [{
    "eventType": "the.event.type",
    "description": "What this event represents",
    "confirmationLevel": "A|B|C|D|E",
    "sdkCode": "TypeScript snippet showing the emit call (do NOT include level/confirmationLevel — it is resolved server-side)"
  }]
}`;

  const existingNote = input.existingEventTypes?.length
    ? `\nExisting event types (suggest additional ones, don't duplicate): ${input.existingEventTypes.join(', ')}`
    : '';

  const checksNote = input.checks?.length
    ? `\nExisting policy checks:\n${input.checks.map(c => `- ${c.name} (${c.checkType}, needs level ${c.requiredEvidenceLevel || 'A'})`).join('\n')}`
    : '';

  const userPrompt = `Generate event types and instrumentation for this workflow:

Name: ${input.name}
${input.description ? `Description: ${input.description}` : ''}
${input.category ? `Category: ${input.category}` : ''}${existingNote}${checksNote}

Think about every event type from start to finish. Include events that prove each step occurred. Use appropriate confirmation levels.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: EVENT_GEN_MODEL,
    messages,
    temperature: 0.2,
    maxTokens: 4096,
    meterContext: { ...input.meterContext, serviceKey: 'route.generateEventTypes' },
  });

  return parseJsonResponse(response);
}
