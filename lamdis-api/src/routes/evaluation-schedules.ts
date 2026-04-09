import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db.js';
import { evaluationSchedules } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';

export default async function evaluationScheduleRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // List schedules for an org
  fastify.get('/orgs/:orgId/evaluation-schedules', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const rows = await db.select().from(evaluationSchedules)
      .where(eq(evaluationSchedules.orgId, orgId));
    return reply.send(rows);
  });

  // Get schedule for a specific objective type
  fastify.get('/orgs/:orgId/objectives/:objectiveTypeId/evaluation-schedule', async (req, reply) => {
    const { orgId, objectiveTypeId } = req.params as { orgId: string; objectiveTypeId: string };
    const [row] = await db.select().from(evaluationSchedules)
      .where(and(eq(evaluationSchedules.orgId, orgId), eq(evaluationSchedules.objectiveTypeId, objectiveTypeId)))
      .limit(1);
    return reply.send(row || null);
  });

  // Create or update schedule (upsert by org + objective)
  fastify.post('/orgs/:orgId/objectives/:objectiveTypeId/evaluation-schedule', async (req, reply) => {
    const { orgId, objectiveTypeId } = req.params as { orgId: string; objectiveTypeId: string };
    const body = req.body as any;

    const intervalMinutes = body.intervalMinutes || 60;
    const enabled = body.enabled !== false;
    const nextRunAt = enabled ? new Date(Date.now() + intervalMinutes * 60_000) : null;

    // Check if exists
    const [existing] = await db.select().from(evaluationSchedules)
      .where(and(eq(evaluationSchedules.orgId, orgId), eq(evaluationSchedules.objectiveTypeId, objectiveTypeId)))
      .limit(1);

    if (existing) {
      const [updated] = await db.update(evaluationSchedules)
        .set({
          intervalMinutes,
          enabled,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(evaluationSchedules.id, existing.id))
        .returning();
      return reply.send(updated);
    }

    const [created] = await db.insert(evaluationSchedules).values({
      orgId,
      objectiveTypeId,
      intervalMinutes,
      enabled,
      nextRunAt,
    }).returning();

    return reply.code(201).send(created);
  });

  // Delete schedule
  fastify.delete('/orgs/:orgId/objectives/:objectiveTypeId/evaluation-schedule', async (req, reply) => {
    const { orgId, objectiveTypeId } = req.params as { orgId: string; objectiveTypeId: string };
    await db.delete(evaluationSchedules)
      .where(and(eq(evaluationSchedules.orgId, orgId), eq(evaluationSchedules.objectiveTypeId, objectiveTypeId)));
    return reply.code(204).send();
  });
}
