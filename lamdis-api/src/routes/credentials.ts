import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hasScope } from './api-keys.js';
import * as credentialVault from '../services/identity/credentialVaultService.js';

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

export default async function credentialRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // CREDENTIALS
  // =========================================================================

  fastify.get('/orgs/:orgId/credentials', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { provider, ownerType } = req.query as { provider?: string; ownerType?: string };
    return reply.send(await credentialVault.listCredentials(orgId, { provider, ownerType }));
  });

  fastify.post('/orgs/:orgId/credentials', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;

    const body = z.object({
      provider: z.string().min(1),
      credentialType: z.enum(['oauth2', 'api_key', 'username_password', 'token', 'certificate']).optional(),
      label: z.string().optional(),
      ownerType: z.enum(['org', 'user', 'agent', 'objective']).optional(),
      ownerRef: z.string().optional(),
      identityId: z.string().uuid().optional(),
      data: z.record(z.unknown()),
      expiresAt: z.string().datetime().optional(),
    }).parse(req.body as any);

    const credential = await credentialVault.storeCredential(orgId, {
      ...body,
      ownerType: body.ownerType || 'org',
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return reply.code(201).send(credential);
  });

  fastify.delete('/orgs/:orgId/credentials/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    await credentialVault.revokeCredential(orgId, id);
    return reply.code(204).send();
  });

  fastify.post('/orgs/:orgId/credentials/:id/rotate', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      data: z.record(z.unknown()),
    }).parse(req.body as any);

    const updated = await credentialVault.rotateCredential(orgId, id, body.data);
    return reply.send({ rotated: true, id: updated?.id });
  });

  // =========================================================================
  // CREDENTIAL REQUESTS (agent → user)
  // =========================================================================

  fastify.get('/orgs/:orgId/credential-requests', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { status, outcomeInstanceId } = req.query as { status?: string; outcomeInstanceId?: string };
    return reply.send(await credentialVault.listCredentialRequests(orgId, { status, outcomeInstanceId }));
  });

  fastify.post('/orgs/:orgId/credential-requests/:id/fulfill', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const userSub = (req as any).user?.sub || 'unknown';

    const body = z.object({
      data: z.record(z.unknown()),
    }).parse(req.body as any);

    const credential = await credentialVault.fulfillCredentialRequest(orgId, id, {
      data: body.data,
      respondedBy: userSub,
    });

    return reply.send(credential);
  });

  fastify.post('/orgs/:orgId/credential-requests/:id/deny', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const userSub = (req as any).user?.sub || 'unknown';

    await credentialVault.denyCredentialRequest(orgId, id, userSub);
    return reply.send({ denied: true });
  });
}
