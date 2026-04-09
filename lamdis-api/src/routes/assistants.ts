import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { assistants } from '@lamdis/db/schema';

const assistantsRoutes: FastifyPluginAsync = async (app) => {
  // List
  app.get('/orgs/:id/assistants', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params as any);
    const items = await db
      .select()
      .from(assistants)
      .where(eq(assistants.orgId, id))
      .orderBy(desc(assistants.createdAt));
    return { assistants: items };
  });
  // Create
  app.post('/orgs/:id/assistants', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params as any);
    const body = z.object({ key: z.string(), name: z.string(), description: z.string().optional(), requestId: z.string().optional(), connectionKey: z.string().optional(), version: z.string().optional(), labels: z.array(z.string()).optional() }).parse(req.body as any);
    try {
      const [row] = await db.insert(assistants).values({ orgId: id, ...body }).returning();
      return row;
    } catch (e: any) {
      return reply.code(400).send({ error: e?.message || 'create_failed' });
    }
  });
  // Get one
  app.get('/orgs/:id/assistants/:assistantId', async (req, reply) => {
    const { id, assistantId } = z.object({ id: z.string(), assistantId: z.string() }).parse(req.params as any);
    const [doc] = await db
      .select()
      .from(assistants)
      .where(and(eq(assistants.id, assistantId), eq(assistants.orgId, id)))
      .limit(1);
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });
  // Update
  app.patch('/orgs/:id/assistants/:assistantId', async (req, reply) => {
    const { id, assistantId } = z.object({ id: z.string(), assistantId: z.string() }).parse(req.params as any);
    const updates = req.body as any;
    const [doc] = await db
      .update(assistants)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(assistants.id, assistantId), eq(assistants.orgId, id)))
      .returning();
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });
  // Delete
  app.delete('/orgs/:id/assistants/:assistantId', async (req, reply) => {
    const { id, assistantId } = z.object({ id: z.string(), assistantId: z.string() }).parse(req.params as any);
    await db
      .delete(assistants)
      .where(and(eq(assistants.id, assistantId), eq(assistants.orgId, id)));
    return reply.code(204).send();
  });
};

export default assistantsRoutes;
