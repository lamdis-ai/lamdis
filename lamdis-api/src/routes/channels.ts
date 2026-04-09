import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db.js';
import { channels } from '@lamdis/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

function generateDeploymentKey(): string {
  return 'ch_' + crypto.randomBytes(16).toString('hex');
}

export default async function channelRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // List channels
  fastify.get('/orgs/:orgId/channels', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const rows = await db.select().from(channels)
      .where(eq(channels.orgId, orgId))
      .orderBy(desc(channels.createdAt));
    return reply.send(rows);
  });

  // Get channel by ID
  fastify.get('/orgs/:orgId/channels/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const [row] = await db.select().from(channels)
      .where(and(eq(channels.id, id), eq(channels.orgId, orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'Channel not found' });
    return reply.send(row);
  });

  // Get channel by deployment key (public — for chat widget initialization)
  fastify.get('/channels/by-key/:deploymentKey', async (req, reply) => {
    const { deploymentKey } = req.params as { deploymentKey: string };
    const [row] = await db.select().from(channels)
      .where(eq(channels.deploymentKey, deploymentKey))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'Channel not found' });
    if (!row.enabled) return reply.code(403).send({ error: 'Channel is disabled' });
    // Return public-safe fields only
    return reply.send({
      id: row.id,
      name: row.name,
      channelType: row.channelType,
      authMethod: row.authMethod,
      multimodal: row.multimodal,
      permissions: row.permissions,
    });
  });

  // Create channel
  fastify.post('/orgs/:orgId/channels', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as any;

    const [created] = await db.insert(channels).values({
      orgId,
      name: body.name,
      description: body.description || '',
      channelType: body.channelType || 'customer',
      authMethod: body.authMethod || 'email_verification',
      authConfig: body.authConfig || {},
      linkedObjectiveIds: body.linkedObjectiveIds || [],
      permissions: body.permissions || ['provide_evidence', 'view_own_status'],
      multimodal: body.multimodal || {},
      deploymentKey: generateDeploymentKey(),
      enabled: body.enabled !== false,
    }).returning();

    return reply.code(201).send(created);
  });

  // Update channel
  fastify.put('/orgs/:orgId/channels/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as any;

    const [updated] = await db.update(channels)
      .set({
        name: body.name,
        description: body.description,
        channelType: body.channelType,
        authMethod: body.authMethod,
        authConfig: body.authConfig,
        linkedObjectiveIds: body.linkedObjectiveIds,
        permissions: body.permissions,
        multimodal: body.multimodal,
        enabled: body.enabled,
        updatedAt: new Date(),
      })
      .where(and(eq(channels.id, id), eq(channels.orgId, orgId)))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Channel not found' });
    return reply.send(updated);
  });

  // Delete channel
  fastify.delete('/orgs/:orgId/channels/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await db.delete(channels)
      .where(and(eq(channels.id, id), eq(channels.orgId, orgId)));
    return reply.code(204).send();
  });

  // Regenerate deployment key
  fastify.post('/orgs/:orgId/channels/:id/regenerate-key', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const newKey = generateDeploymentKey();
    const [updated] = await db.update(channels)
      .set({ deploymentKey: newKey, updatedAt: new Date() })
      .where(and(eq(channels.id, id), eq(channels.orgId, orgId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: 'Channel not found' });
    return reply.send({ deploymentKey: newKey });
  });
}
