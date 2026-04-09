import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db.js';
import { runs, workflowInstances } from '@lamdis/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';

const RUNS_SERVICE_URL = process.env.LAMDIS_RUNS_URL || 'http://localhost:3101';

export default async function runRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // Trigger a workflow run
  fastify.post('/orgs/:orgId/runs', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      suiteId?: string;
      workflowIds?: string[];
      envId?: string;
      connKey?: string;
      gitContext?: any;
      webhookUrl?: string;
      trigger?: string;
    };

    try {
      const resp = await fetch(`${RUNS_SERVICE_URL}/internal/workflow-runs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.LAMDIS_API_TOKEN ? { 'x-api-token': process.env.LAMDIS_API_TOKEN } : {}),
        },
        body: JSON.stringify({
          orgId,
          trigger: body.trigger || 'manual',
          suiteId: body.suiteId,
          workflowIds: body.workflowIds,
          envId: body.envId,
          connKey: body.connKey,
          gitContext: body.gitContext,
          webhookUrl: body.webhookUrl,
        }),
      });

      const result = await resp.json();
      if (result.error) {
        return reply.code(400).send(result);
      }
      return reply.code(202).send(result);
    } catch (err: any) {
      return reply.code(503).send({ error: 'Runs service unavailable', details: err?.message });
    }
  });

  // List runs
  fastify.get('/orgs/:orgId/runs', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const query = req.query as { limit?: string; offset?: string; status?: string };

    const conditions = [eq(runs.orgId, orgId)];
    if (query.status) conditions.push(eq(runs.status, query.status));

    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const rows = await db.select().from(runs)
      .where(and(...conditions))
      .orderBy(desc(runs.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ count: count() }).from(runs)
      .where(and(...conditions));

    return reply.send({ runs: rows, total: totalRow?.count || 0, limit, offset });
  });

  // Get run detail
  fastify.get('/orgs/:orgId/runs/:runId', async (req, reply) => {
    const { orgId, runId } = req.params as { orgId: string; runId: string };

    const [run] = await db.select().from(runs)
      .where(and(eq(runs.id, runId), eq(runs.orgId, orgId)))
      .limit(1);

    if (!run) return reply.code(404).send({ error: 'Run not found' });

    // Get associated workflow instances
    const instances = await db.select().from(workflowInstances)
      .where(eq(workflowInstances.runId, runId))
      .orderBy(workflowInstances.createdAt);

    return reply.send({ ...run, instances });
  });

  // Stop a run
  fastify.post('/orgs/:orgId/runs/:runId/stop', async (req, reply) => {
    const { orgId, runId } = req.params as { orgId: string; runId: string };

    const [run] = await db.select().from(runs)
      .where(and(eq(runs.id, runId), eq(runs.orgId, orgId)))
      .limit(1);

    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (run.status !== 'running' && run.status !== 'queued') {
      return reply.code(400).send({ error: 'Run is not active' });
    }

    await db.update(runs)
      .set({ stopRequested: true, updatedAt: new Date() })
      .where(eq(runs.id, runId));

    return reply.send({ status: 'stop_requested' });
  });
}
