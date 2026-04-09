import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hasScope } from './api-keys.js';
import * as toolService from '../services/toolFactory/toolService.js';

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

export default async function toolRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // LIST TOOLS
  // =========================================================================

  fastify.get('/orgs/:orgId/tools', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { scope, status } = req.query as { scope?: string; status?: string };

    const tools = await toolService.listTools(orgId, { scope, status });
    return reply.send(tools);
  });

  // =========================================================================
  // GET TOOL
  // =========================================================================

  fastify.get('/orgs/:orgId/tools/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const tool = await toolService.getTool(orgId, id);
    if (!tool) return reply.code(404).send({ error: 'Tool not found' });

    return reply.send(tool);
  });

  // =========================================================================
  // CREATE TOOL
  // =========================================================================

  fastify.post('/orgs/:orgId/tools', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;

    const body = z.object({
      toolId: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
      name: z.string().min(1),
      description: z.string().optional(),
      scope: z.enum(['org', 'objective', 'workspace']).optional(),
      inputSchema: z.record(z.unknown()).optional(),
      outputSchema: z.record(z.unknown()).optional(),
      implementation: z.record(z.unknown()).optional(),
      workspaceId: z.string().uuid().optional(),
      outcomeInstanceId: z.string().uuid().optional(),
      apiDocsUrl: z.string().optional(),
    }).parse(req.body as any);

    const tool = await toolService.createTool(orgId, body);
    return reply.code(201).send(tool);
  });

  // =========================================================================
  // UPDATE TOOL
  // =========================================================================

  fastify.patch('/orgs/:orgId/tools/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      inputSchema: z.record(z.unknown()).optional(),
      outputSchema: z.record(z.unknown()).optional(),
      implementation: z.record(z.unknown()).optional(),
      status: z.enum(['draft', 'testing', 'active', 'disabled']).optional(),
    }).parse(req.body as any);

    const tool = await toolService.updateTool(orgId, id, body);
    if (!tool) return reply.code(404).send({ error: 'Tool not found' });

    return reply.send(tool);
  });

  // =========================================================================
  // DELETE TOOL
  // =========================================================================

  fastify.delete('/orgs/:orgId/tools/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    await toolService.deleteTool(orgId, id);
    return reply.code(204).send();
  });

  // =========================================================================
  // TEST TOOL
  // =========================================================================

  fastify.post('/orgs/:orgId/tools/:id/test', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      input: z.record(z.unknown()),
    }).parse(req.body as any);

    const result = await toolService.testTool(orgId, id, body.input);
    return reply.send(result);
  });

  // =========================================================================
  // PROMOTE TOOL (objective → org scope)
  // =========================================================================

  fastify.post('/orgs/:orgId/tools/:id/promote', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const tool = await toolService.updateTool(orgId, id, { status: 'active' } as any);
    if (!tool) return reply.code(404).send({ error: 'Tool not found' });

    return reply.send(tool);
  });

  // =========================================================================
  // GENERATE TOOL (agent-triggered: search docs, generate code, register)
  // =========================================================================

  fastify.post('/orgs/:orgId/tools/generate', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;

    const body = z.object({
      purpose: z.string().min(1),
      apiHint: z.string().optional(),
      outcomeInstanceId: z.string().uuid().optional(),
      workspaceId: z.string().uuid().optional(),
    }).parse(req.body as any);

    const tool = await toolService.generateAndRegisterTool(orgId, body);
    return reply.code(201).send(tool);
  });
}
