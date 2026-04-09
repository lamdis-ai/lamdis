import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { llmBudgets } from '@lamdis/db/schema';
import { createAuditLog, type AuditContext } from '../services/auditService.js';

/**
 * LLM budget CRUD routes. Budgets are checked by the bedrockChat wrapper
 * before every Bedrock call (see lib/bedrockChat.ts + services/llmCostControl).
 *
 * Scopes:
 *   - 'org'              → org-wide cap (scopeRefId is null)
 *   - 'outcome_type'     → cap for one outcomeType (scopeRefId = outcomeTypeId)
 *   - 'outcome_instance' → cap for one instance run
 *   - 'agent_task'       → cap for one agent task
 *   - 'model'            → cap for one Bedrock model id
 */

const scopeEnum = z.enum(['org', 'outcome_type', 'outcome_instance', 'agent_task', 'model']);
const periodEnum = z.enum(['monthly', 'daily', 'lifetime']);
const enforcementEnum = z.enum(['block', 'warn']);

const createBodySchema = z.object({
  scope: scopeEnum,
  scopeRefId: z.string().nullable().optional(),
  periodType: periodEnum.default('monthly'),
  limitUsd: z.number().positive(),
  warningThresholdPct: z.number().int().min(1).max(100).optional().default(80),
  enforcementMode: enforcementEnum.optional().default('block'),
  enabled: z.boolean().optional().default(true),
});

const updateBodySchema = z.object({
  limitUsd: z.number().positive().optional(),
  warningThresholdPct: z.number().int().min(1).max(100).optional(),
  enforcementMode: enforcementEnum.optional(),
  enabled: z.boolean().optional(),
});

function buildAuditContext(req: any, orgId: string): AuditContext {
  return {
    orgId,
    userSub: (req as any).user?.sub,
    userEmail: (req as any).user?.email,
    source: 'api',
    requestId: (req as any).id,
  };
}

const routes: FastifyPluginAsync = async (app) => {
  // List all budgets for an org
  app.get('/:orgId/budgets', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const rows = await db
      .select()
      .from(llmBudgets)
      .where(eq(llmBudgets.orgId, orgId));
    return reply.send({
      items: rows.map((b) => ({ ...b, limitUsd: Number(b.limitUsd) })),
    });
  });

  // Create
  app.post('/:orgId/budgets', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = createBodySchema.parse(req.body);

    // org-scope budgets must have a null scopeRefId; everything else needs one
    if (body.scope === 'org' && body.scopeRefId) {
      return reply.code(400).send({ error: 'org_scope_must_have_null_ref' });
    }
    if (body.scope !== 'org' && !body.scopeRefId) {
      return reply.code(400).send({ error: 'scope_ref_id_required', scope: body.scope });
    }

    const userSub = (req as any).user?.sub;

    try {
      const [created] = await db.insert(llmBudgets).values({
        orgId,
        scope: body.scope,
        scopeRefId: body.scopeRefId ?? null,
        periodType: body.periodType,
        limitUsd: body.limitUsd.toString(),
        warningThresholdPct: body.warningThresholdPct,
        enforcementMode: body.enforcementMode,
        enabled: body.enabled,
        createdBy: userSub,
      } as any).returning();

      await createAuditLog(buildAuditContext(req, orgId), 'llm_budget.created', {
        category: 'compliance',
        severity: 'info',
        resource: { type: 'llm_budget', id: created.id, collection: 'llm_budgets' },
        details: {
          scope: body.scope,
          scopeRefId: body.scopeRefId,
          periodType: body.periodType,
          limitUsd: body.limitUsd,
        },
      });

      return reply.send({ ...created, limitUsd: Number(created.limitUsd) });
    } catch (err: any) {
      // Likely unique constraint violation (duplicate budget for same scope)
      if (err?.code === '23505') {
        return reply.code(409).send({
          error: 'budget_exists',
          message: 'A budget already exists for this org/scope/scopeRefId/period combination.',
        });
      }
      throw err;
    }
  });

  // Update
  app.patch('/:orgId/budgets/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = updateBodySchema.parse(req.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.limitUsd != null) updates.limitUsd = body.limitUsd.toString();
    if (body.warningThresholdPct != null) updates.warningThresholdPct = body.warningThresholdPct;
    if (body.enforcementMode != null) updates.enforcementMode = body.enforcementMode;
    if (body.enabled != null) updates.enabled = body.enabled;

    const [updated] = await db
      .update(llmBudgets)
      .set(updates as any)
      .where(and(eq(llmBudgets.id, id), eq(llmBudgets.orgId, orgId)))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'not_found' });

    await createAuditLog(buildAuditContext(req, orgId), 'llm_budget.updated', {
      category: 'compliance',
      severity: 'info',
      resource: { type: 'llm_budget', id, collection: 'llm_budgets' },
      details: body,
    });

    return reply.send({ ...updated, limitUsd: Number(updated.limitUsd) });
  });

  // Delete
  app.delete('/:orgId/budgets/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const result = await db
      .delete(llmBudgets)
      .where(and(eq(llmBudgets.id, id), eq(llmBudgets.orgId, orgId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'not_found' });

    await createAuditLog(buildAuditContext(req, orgId), 'llm_budget.deleted', {
      category: 'compliance',
      severity: 'warning',
      resource: { type: 'llm_budget', id, collection: 'llm_budgets' },
    });

    return reply.code(204).send();
  });
};

export default routes;
