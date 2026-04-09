import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hasScope } from './api-keys.js';
import * as scheduler from '../services/scheduling/agentSchedulerService.js';

function resolveOrgId(req: FastifyRequest, reply: FastifyReply, requiredScope?: string): string | null {
  const { orgId } = req.params as { orgId: string };
  const apiKeyAuth = (req as any).apiKeyAuth as { orgId: string; scopes: string[] } | undefined;
  if (apiKeyAuth) {
    if (orgId !== apiKeyAuth.orgId) { reply.code(403).send({ error: 'Forbidden' }); return null; }
    if (requiredScope && !hasScope(apiKeyAuth.scopes, requiredScope)) { reply.code(403).send({ error: 'Missing scope' }); return null; }
    return orgId;
  }
  return orgId;
}

export default async function scheduleRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // Set/update schedule for an instance
  fastify.post('/orgs/:orgId/outcome-instances/:id/schedule', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      scheduleType: z.enum(['polling', 'cron', 'adaptive', 'one_shot']).optional(),
      intervalMs: z.number().min(5000).optional(),
      cronExpression: z.string().optional(),
      adaptiveConfig: z.object({
        baseIntervalMs: z.number(),
        minIntervalMs: z.number(),
        maxIntervalMs: z.number(),
      }).optional(),
    }).parse(req.body as any);

    const schedule = await scheduler.setSchedule(orgId, id, body);
    return reply.send(schedule);
  });

  // Get schedule for an instance
  fastify.get('/orgs/:orgId/outcome-instances/:id/schedule', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const schedule = await scheduler.getSchedule(orgId, id);
    if (!schedule) return reply.send({ hasSchedule: false });
    return reply.send(schedule);
  });

  // Delete schedule
  fastify.delete('/orgs/:orgId/outcome-instances/:id/schedule', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    await scheduler.removeSchedule(orgId, id);
    return reply.code(204).send();
  });

  // List all schedules for an org
  fastify.get('/orgs/:orgId/schedules', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;

    const schedules = await scheduler.listSchedules(orgId);
    return reply.send(schedules);
  });
}
