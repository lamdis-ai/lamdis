import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { runOutcomeBuilder } from '../lib/assistant/outcome-builder.js';

export default async function outcomeBuilderRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post('/orgs/:orgId/outcome-builder/chat', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { message: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> };

    if (!body.message?.trim()) {
      return reply.code(400).send({ error: 'Message is required' });
    }

    try {
      const result = await runOutcomeBuilder(orgId, body.message, body.history || []);
      return reply.send(result);
    } catch (err: any) {
      fastify.log.error(err, 'outcome-builder error');
      return reply.code(500).send({ error: err?.message || 'Builder failed' });
    }
  });
}
