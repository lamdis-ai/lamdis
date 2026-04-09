import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hasScope } from './api-keys.js';
import * as hub from '../services/communication/communicationHub.js';
import { orchestratorTick } from '../services/automation/outcomeOrchestrator.js';

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

export default async function communicationRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // SEND MESSAGE
  // =========================================================================

  fastify.post('/orgs/:orgId/channels/:channelId/send', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { channelId } = req.params as { channelId: string };

    const body = z.object({
      to: z.string().min(1),
      content: z.string().min(1),
      contentType: z.enum(['text', 'template']).optional(),
      mediaUrl: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
      outcomeInstanceId: z.string().uuid().optional(),
    }).parse(req.body as any);

    const result = await hub.sendMessage(orgId, channelId, {
      ...body,
      senderType: 'user',
      senderRef: (req as any).user?.sub,
    });

    return reply.send(result);
  });

  // =========================================================================
  // LIST THREADS FOR CHANNEL
  // =========================================================================

  fastify.get('/orgs/:orgId/channels/:channelId/threads', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { channelId } = req.params as { channelId: string };

    const threads = await hub.listThreads(orgId, channelId);
    return reply.send(threads);
  });

  // =========================================================================
  // GET THREAD MESSAGES
  // =========================================================================

  fastify.get('/orgs/:orgId/threads/:threadId/messages', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { threadId } = req.params as { threadId: string };
    const { limit, offset } = req.query as { limit?: string; offset?: string };

    const msgs = await hub.getThreadMessages(orgId, threadId, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    return reply.send(msgs);
  });

  // =========================================================================
  // INBOUND WEBHOOK (for Twilio, email, etc.)
  // =========================================================================

  fastify.post('/orgs/:orgId/channels/:channelId/inbound', async (req, reply) => {
    const orgId = resolveOrgId(req, reply);
    if (!orgId) return;
    const { channelId } = req.params as { channelId: string };

    try {
      const result = await hub.receiveMessage(orgId, channelId, req.body);

      // Trigger orchestrator tick if routed to an objective
      if (result.routedToInstanceId) {
        orchestratorTick(result.routedToInstanceId).catch(() => {});
      }

      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message });
    }
  });

  // =========================================================================
  // TEST CHANNEL CONNECTIVITY
  // =========================================================================

  fastify.post('/orgs/:orgId/channels/:channelId/test', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { channelId } = req.params as { channelId: string };

    const body = z.object({
      to: z.string().min(1),
    }).parse(req.body as any);

    const result = await hub.sendMessage(orgId, channelId, {
      to: body.to,
      content: 'Test message from Lamdis',
      senderType: 'system',
    });

    return reply.send({ tested: true, result });
  });
}
