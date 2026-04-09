import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { executeHostedJS } from '../services/hosted/executor.js';

export default async function codeExecutionRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // Execute code in sandbox (for testing/debugging)
  fastify.post('/orgs/:orgId/execute', async (req, reply) => {
    const body = req.body as { code: string; input?: any; timeoutMs?: number; netAllow?: string[] };

    if (!body.code?.trim()) {
      return reply.code(400).send({ error: 'Code is required' });
    }

    try {
      const result = await executeHostedJS({
        code: body.code,
        input: body.input || {},
        permissions: { net_allow: body.netAllow || [], env: [] },
        timeoutMs: Math.min(body.timeoutMs || 6000, 30000),
      });

      return reply.send({
        success: result.ok,
        output: result.body,
        logs: result.logs || [],
        error: result.error,
        status: result.status,
      });
    } catch (err: any) {
      return reply.code(500).send({ error: err?.message || 'Execution failed' });
    }
  });
}
