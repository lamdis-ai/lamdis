import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { actionExecutions } from '@lamdis/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { hasScope } from './api-keys.js';
import { createAuditLog, buildAuditContextFromRequest } from '../services/auditService.js';
import { executeAction } from '../services/automation/actionExecutor.js';

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

export default async function actionExecutionRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // LIST ACTION EXECUTIONS
  // =========================================================================

  fastify.get('/orgs/:orgId/action-executions', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;

    const query = req.query as {
      status?: string;
      outcomeInstanceId?: string;
      riskClass?: string;
      actionId?: string;
      limit?: string;
      offset?: string;
    };

    const conditions = [eq(actionExecutions.orgId, orgId)];
    if (query.status) conditions.push(eq(actionExecutions.status, query.status));
    if (query.outcomeInstanceId) conditions.push(eq(actionExecutions.outcomeInstanceId, query.outcomeInstanceId));
    if (query.riskClass) conditions.push(eq(actionExecutions.riskClass, query.riskClass));
    if (query.actionId) conditions.push(eq(actionExecutions.actionId, query.actionId));

    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const rows = await db.select().from(actionExecutions)
      .where(and(...conditions))
      .orderBy(desc(actionExecutions.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ count: count() }).from(actionExecutions)
      .where(and(...conditions));

    return reply.send({ executions: rows, total: totalRow?.count || 0, limit, offset });
  });

  // =========================================================================
  // GET ACTION EXECUTION DETAIL
  // =========================================================================

  fastify.get('/orgs/:orgId/action-executions/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const [row] = await db.select().from(actionExecutions)
      .where(and(eq(actionExecutions.id, id), eq(actionExecutions.orgId, orgId)))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Action execution not found' });

    return reply.send(row);
  });

  // =========================================================================
  // APPROVE ACTION EXECUTION
  // =========================================================================

  fastify.post('/orgs/:orgId/action-executions/:id/approve', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      notes: z.string().optional(),
    }).parse(req.body as any);

    const [doc] = await db.select().from(actionExecutions)
      .where(and(eq(actionExecutions.id, id), eq(actionExecutions.orgId, orgId)))
      .limit(1);

    if (!doc) return reply.code(404).send({ error: 'Action execution not found' });

    const user = (req as any).user || {};
    const previousStatus = doc.status || 'proposed';

    const [updated] = await db.update(actionExecutions)
      .set({
        status: 'approved',
        approval: {
          approvedBy: user.sub || 'unknown',
          approvedAt: new Date().toISOString(),
          method: 'manual',
          notes: body.notes,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(actionExecutions.id, id), eq(actionExecutions.orgId, orgId)))
      .returning();

    await createAuditLog(buildAuditContextFromRequest(req, orgId), 'action_execution.approved', {
      category: 'compliance',
      severity: 'info',
      resource: { type: 'action_execution', id, name: id, collection: 'action_executions' },
      before: { status: previousStatus },
      after: { status: 'approved' },
      details: { notes: body.notes, approvedBy: user.sub },
    });

    return reply.send(updated);
  });

  // =========================================================================
  // BLOCK ACTION EXECUTION
  // =========================================================================

  fastify.post('/orgs/:orgId/action-executions/:id/block', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      reason: z.string().min(1),
    }).parse(req.body as any);

    const [doc] = await db.select().from(actionExecutions)
      .where(and(eq(actionExecutions.id, id), eq(actionExecutions.orgId, orgId)))
      .limit(1);

    if (!doc) return reply.code(404).send({ error: 'Action execution not found' });

    const user = (req as any).user || {};
    const previousStatus = doc.status || 'proposed';

    const [updated] = await db.update(actionExecutions)
      .set({
        status: 'blocked',
        blockedReason: body.reason,
        updatedAt: new Date(),
      })
      .where(and(eq(actionExecutions.id, id), eq(actionExecutions.orgId, orgId)))
      .returning();

    await createAuditLog(buildAuditContextFromRequest(req, orgId), 'action_execution.blocked', {
      category: 'compliance',
      severity: 'warning',
      resource: { type: 'action_execution', id, name: id, collection: 'action_executions' },
      before: { status: previousStatus },
      after: { status: 'blocked' },
      details: { reason: body.reason, blockedBy: user.sub },
    });

    return reply.send(updated);
  });

  // =========================================================================
  // EXECUTE ACTION — actually invoke the action's HTTP/hosted-JS/mock target
  // =========================================================================

  fastify.post('/orgs/:orgId/action-executions/:id/execute', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      input: z.record(z.unknown()).optional(),
    }).parse(req.body as any);

    // Verify the execution exists and belongs to this org
    const [doc] = await db.select().from(actionExecutions)
      .where(and(eq(actionExecutions.id, id), eq(actionExecutions.orgId, orgId)))
      .limit(1);

    if (!doc) return reply.code(404).send({ error: 'Action execution not found' });

    // Only execute if status allows it
    const allowedStatuses = ['approved', 'executing', 'proposed'];
    if (!allowedStatuses.includes(doc.status || '')) {
      return reply.code(409).send({
        error: `Cannot execute action in status '${doc.status}'. Allowed: ${allowedStatuses.join(', ')}`,
      });
    }

    const previousStatus = doc.status || 'proposed';

    const result = await executeAction(id, body.input);

    await createAuditLog(buildAuditContextFromRequest(req, orgId), 'action_execution.executed', {
      category: 'compliance',
      severity: result.ok ? 'info' : 'warning',
      resource: { type: 'action_execution', id, name: id, collection: 'action_executions' },
      before: { status: previousStatus },
      after: { status: result.ok ? 'completed' : 'failed' },
      details: { ok: result.ok, durationMs: result.durationMs, error: result.error },
    });

    return reply.send(result);
  });
}
