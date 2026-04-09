import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { validateApiKey } from './api-keys.js';
import { publishEvents } from '../lib/natsPublisher.js';

const confirmationLevels = ['A', 'B', 'C', 'D', 'E'] as const;

const eventSchema = z.object({
  workflowInstanceId: z.string().uuid(),
  eventType: z.string().min(1).max(256),
  payload: z.record(z.unknown()),
  confirmationLevel: z.enum(confirmationLevels).optional(),
  emittedAt: z.string().datetime(),
  idempotencyKey: z.string().max(512).optional(),
  sequenceNumber: z.number().int().nonnegative().optional(),
  source: z.string().max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

/**
 * High-throughput event ingestion endpoint.
 * Formerly the standalone lamdis-ingest service — now merged into lamdis-api.
 *
 * POST /v1/events — accepts batches of up to 100 SDK events,
 * validates, authenticates via API key, publishes to NATS JetStream.
 */
export default async function eventsIngestRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post('/v1/events', async (req, reply) => {
    // --- Auth via API key ---
    const apiKey = req.headers['x-lamdis-api-key'] as string | undefined;
    if (!apiKey) {
      return reply.code(401).send({ error: 'Missing x-lamdis-api-key header' });
    }

    const result = await validateApiKey(apiKey);
    if (!result.valid) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    // --- Scope check ---
    const scopes = result.scopes || [];
    const hasScope = scopes.some((scope: string) => {
      if (scope === '*') return true;
      if (scope === 'ingest:events') return true;
      if (scope.endsWith(':*') && 'ingest:events'.startsWith(scope.slice(0, -1))) return true;
      return false;
    });

    if (!hasScope) {
      return reply.code(403).send({ error: 'API key missing required scope: ingest:events' });
    }

    // --- Validate ---
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid payload',
        details: parsed.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const { events } = parsed.data;

    // Stamp each event with orgId and receivedAt
    const stamped = events.map(e => ({
      ...e,
      orgId: result.orgId,
      receivedAt: new Date().toISOString(),
    }));

    // --- Publish to NATS ---
    try {
      await publishEvents(result.orgId!, stamped);
    } catch (err: any) {
      req.log.error({ err }, 'Failed to publish to NATS');
      return reply.code(503).send({ error: 'Event queue unavailable' });
    }

    return reply.code(202).send({
      accepted: events.length,
      duplicates: 0,
    });
  });
}
