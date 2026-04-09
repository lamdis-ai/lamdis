import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { invocationLogs } from '@lamdis/db/schema';
import { env } from '../lib/env.js';

export type InvocationSource = 'hosted' | 'gateway-a2a' | 'gateway-mcp';

const ingestEventSchema = z.object({
  orgId: z.string(),
  orgSlug: z.string().optional(),
  actionKey: z.string().optional(),
  providerKey: z.string().optional(),
  route: z.string().optional(),
  source: z.enum(['gateway-a2a', 'gateway-mcp', 'hosted']) as unknown as z.ZodType<InvocationSource>,
  requestId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  status: z.enum(['success', 'failure']),
  statusCode: z.number().optional(),
  durationMs: z.number().optional(),
  createdAt: z.coerce.date().optional(),
});

export default async function ingestRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // Shared secret header e.g. x-lamdis-ingest-secret
  fastify.post('/analytics/ingest', async (req, reply) => {
    try {
      const secretHeader = req.headers['x-lamdis-ingest-secret'] as string | undefined;
      if (!env.INGEST_SECRET) {
        req.log.warn('INGEST_SECRET not configured; refusing ingestion');
        return reply.code(503).send({ error: 'Ingestion disabled' });
      }
      if (!secretHeader || secretHeader !== env.INGEST_SECRET) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const body = ingestEventSchema.parse(req.body);
      const createdAt = body.createdAt ?? new Date();

      // Idempotent upsert by orgId + source + idempotencyKey if provided, else insert.
      if (body.idempotencyKey) {
        const { createdAt: _ignoreCreatedAt, ...rest } = body as any;
        // Check if record already exists
        const [existing] = await db.select({ id: invocationLogs.id })
          .from(invocationLogs)
          .where(and(
            eq(invocationLogs.orgId, body.orgId),
            eq(invocationLogs.source, body.source),
            eq(invocationLogs.idempotencyKey, body.idempotencyKey)
          ))
          .limit(1);

        if (existing) {
          // Update existing record
          await db.update(invocationLogs)
            .set({ ...rest })
            .where(eq(invocationLogs.id, existing.id));
        } else {
          // Insert new record
          await db.insert(invocationLogs).values({ ...rest, createdAt });
        }
      } else {
        await db.insert(invocationLogs).values({ ...body, createdAt });
      }

      return reply.code(202).send({ accepted: true });
    } catch (err: any) {
      req.log.error({ err }, 'ingest error');
      return reply.code(400).send({ error: 'Invalid payload' });
    }
  });
}
