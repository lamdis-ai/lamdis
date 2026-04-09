import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { decisionDossiers } from '@lamdis/db/schema';
import { eq, and, desc, gte, lte, count, sql } from 'drizzle-orm';
import { hasScope } from './api-keys.js';

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
    if (orgId !== apiKeyAuth.orgId) {
      reply.code(403).send({ error: 'API key does not belong to this organization' });
      return null;
    }
    if (requiredScope && !hasScope(apiKeyAuth.scopes, requiredScope)) {
      reply.code(403).send({ error: `API key missing required scope: ${requiredScope}` });
      return null;
    }
    return orgId;
  }

  return orgId;
}

export default async function proofRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // DECISION DOSSIERS — list with filters
  // =========================================================================

  fastify.get('/orgs/:orgId/dossiers', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;

    const query = req.query as {
      outcomeInstanceId?: string;
      actor?: string;
      riskClass?: string;
      decisionType?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };

    const conditions = [eq(decisionDossiers.orgId, orgId)];

    if (query.outcomeInstanceId) {
      conditions.push(eq(decisionDossiers.outcomeInstanceId, query.outcomeInstanceId));
    }
    if (query.actor) {
      conditions.push(eq(decisionDossiers.actor, query.actor));
    }
    if (query.riskClass) {
      // riskClass maps to risk_assessment->'level' inside the JSONB column
      conditions.push(sql`${decisionDossiers.riskAssessment}->>'level' = ${query.riskClass}`);
    }
    if (query.decisionType) {
      conditions.push(eq(decisionDossiers.decisionType, query.decisionType));
    }
    if (query.from) {
      conditions.push(gte(decisionDossiers.createdAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lte(decisionDossiers.createdAt, new Date(query.to)));
    }

    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const rows = await db.select().from(decisionDossiers)
      .where(and(...conditions))
      .orderBy(desc(decisionDossiers.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ count: count() }).from(decisionDossiers)
      .where(and(...conditions));

    return reply.send({
      dossiers: rows,
      total: totalRow?.count || 0,
      limit,
      offset,
    });
  });

  // =========================================================================
  // DECISION DOSSIER — full detail by ID
  // =========================================================================

  fastify.get('/orgs/:orgId/dossiers/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const [row] = await db.select().from(decisionDossiers)
      .where(and(eq(decisionDossiers.id, id), eq(decisionDossiers.orgId, orgId)))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Dossier not found' });

    return reply.send(row);
  });
}
