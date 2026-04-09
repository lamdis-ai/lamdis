import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hasScope } from './api-keys.js';
import * as identityService from '../services/identity/identityService.js';

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

export default async function identityRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  fastify.get('/orgs/:orgId/identities', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    return reply.send(await identityService.listIdentities(orgId));
  });

  fastify.post('/orgs/:orgId/identities', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;

    const body = z.object({
      name: z.string().min(1),
      identityType: z.enum(['system_agent', 'user_delegate', 'service_account']).optional(),
      delegateForUserSub: z.string().optional(),
      capabilities: z.array(z.string()).optional(),
      credentialPolicy: z.enum(['own', 'delegate', 'org_shared']).optional(),
    }).parse(req.body as any);

    const identity = await identityService.createIdentity(orgId, body);
    return reply.code(201).send(identity);
  });

  fastify.patch('/orgs/:orgId/identities/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      name: z.string().optional(),
      capabilities: z.array(z.string()).optional(),
      credentialPolicy: z.enum(['own', 'delegate', 'org_shared']).optional(),
    }).parse(req.body as any);

    const identity = await identityService.updateIdentity(orgId, id, body);
    if (!identity) return reply.code(404).send({ error: 'Identity not found' });
    return reply.send(identity);
  });

  fastify.post('/orgs/:orgId/identities/:id/suspend', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    await identityService.suspendIdentity(orgId, id);
    return reply.send({ suspended: true });
  });
}
