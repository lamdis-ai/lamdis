import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { workspaces } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { hasScope } from './api-keys.js';
import * as workspaceManager from '../services/workspace/workspaceManager.js';

function resolveOrgId(req: FastifyRequest, reply: FastifyReply, requiredScope?: string): string | null {
  const { orgId } = req.params as { orgId: string };
  const apiKeyAuth = (req as any).apiKeyAuth as { orgId: string; scopes: string[] } | undefined;
  if (apiKeyAuth) {
    if (orgId !== apiKeyAuth.orgId) {
      reply.code(403).send({ error: 'API key does not belong to this organization' });
      return null;
    }
    if (requiredScope && !hasScope(apiKeyAuth.scopes, requiredScope)) {
      reply.code(403).send({ error: `API key missing required scope: ${requiredScope}` });
      return null;
    }
    return orgId;
  }
  return orgId;
}

export default async function workspaceRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // CREATE WORKSPACE
  // =========================================================================

  fastify.post('/orgs/:orgId/workspaces', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;

    const body = z.object({
      name: z.string().min(1),
      outcomeInstanceId: z.string().uuid().optional(),
      envVars: z.record(z.string()).optional(),
    }).parse(req.body as any);

    const workspace = await workspaceManager.createWorkspace(orgId, {
      name: body.name,
      outcomeInstanceId: body.outcomeInstanceId,
      envVars: body.envVars,
    });

    return reply.code(201).send(workspace);
  });

  // =========================================================================
  // LIST WORKSPACES
  // =========================================================================

  fastify.get('/orgs/:orgId/workspaces', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;

    const result = await db.select().from(workspaces)
      .where(and(eq(workspaces.orgId, orgId), eq(workspaces.status, 'active')));

    return reply.send(result);
  });

  // =========================================================================
  // GET WORKSPACE
  // =========================================================================

  fastify.get('/orgs/:orgId/workspaces/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    return reply.send(workspace);
  });

  // =========================================================================
  // DELETE WORKSPACE
  // =========================================================================

  fastify.delete('/orgs/:orgId/workspaces/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    await workspaceManager.deleteWorkspace(id);
    return reply.code(204).send();
  });

  // =========================================================================
  // EXECUTE COMMAND
  // =========================================================================

  fastify.post('/orgs/:orgId/workspaces/:id/exec', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      command: z.string().min(1),
      timeoutMs: z.number().min(1000).max(300000).optional(),
    }).parse(req.body as any);

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    const result = await workspaceManager.execInWorkspace(id, body.command, {
      timeoutMs: body.timeoutMs,
    });

    return reply.send(result);
  });

  // =========================================================================
  // WRITE FILE
  // =========================================================================

  fastify.post('/orgs/:orgId/workspaces/:id/files', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      path: z.string().min(1),
      content: z.string(),
    }).parse(req.body as any);

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    await workspaceManager.writeFile(id, body.path, body.content);
    return reply.send({ written: body.path });
  });

  // =========================================================================
  // READ FILE
  // =========================================================================

  fastify.get('/orgs/:orgId/workspaces/:id/files/*', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const filePath = (req.params as any)['*'] as string;

    if (!filePath) return reply.code(400).send({ error: 'File path required' });

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    try {
      const content = await workspaceManager.readFile(id, filePath);
      return reply.send({ path: filePath, content });
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }
  });

  // =========================================================================
  // LIST FILES
  // =========================================================================

  fastify.get('/orgs/:orgId/workspaces/:id/files', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const { path: dirPath } = req.query as { path?: string };

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    const entries = await workspaceManager.listFiles(id, dirPath || '.');
    return reply.send(entries);
  });

  // =========================================================================
  // LIST SERVICES
  // =========================================================================

  fastify.get('/orgs/:orgId/workspaces/:id/services', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    const services = await workspaceManager.getServices(id);
    return reply.send(services);
  });

  // =========================================================================
  // DEPLOY SERVICE
  // =========================================================================

  fastify.post('/orgs/:orgId/workspaces/:id/deploy', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      name: z.string().min(1),
      command: z.string().min(1),
      port: z.number().optional(),
      healthUrl: z.string().optional(),
    }).parse(req.body as any);

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    const service = await workspaceManager.deployService(id, body);
    return reply.code(201).send(service);
  });

  // =========================================================================
  // STOP SERVICE
  // =========================================================================

  fastify.post('/orgs/:orgId/workspaces/:id/services/:name/stop', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, name } = req.params as { id: string; name: string };

    const workspace = await workspaceManager.getWorkspace(id);
    if (!workspace || workspace.orgId !== orgId) {
      return reply.code(404).send({ error: 'Workspace not found' });
    }

    await workspaceManager.stopService(id, name);
    return reply.send({ stopped: name });
  });
}
