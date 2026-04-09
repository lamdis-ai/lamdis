import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db.js';
import { categories } from '@lamdis/db/schema';
import { eq, and, isNull, count } from 'drizzle-orm';

export default async function categoryRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // List categories (filter by entityType, parentId)
  fastify.get('/orgs/:orgId/categories', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const query = req.query as { entityType?: string; parentId?: string };

    const conditions = [eq(categories.orgId, orgId)];
    if (query.entityType) conditions.push(eq(categories.entityType, query.entityType as any));
    if (query.parentId === 'null') {
      conditions.push(isNull(categories.parentId));
    } else if (query.parentId) {
      conditions.push(eq(categories.parentId, query.parentId));
    }

    const rows = await db.select().from(categories)
      .where(and(...conditions))
      .orderBy(categories.sortOrder);

    return reply.send(rows);
  });

  // Create category
  fastify.post('/orgs/:orgId/categories', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      name: string;
      slug?: string;
      parentId?: string;
      entityType?: string;
      color?: string;
      sortOrder?: number;
    };

    if (!body.name?.trim()) {
      return reply.code(400).send({ error: 'Name is required' });
    }

    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const [created] = await db.insert(categories).values({
      orgId,
      name: body.name.trim(),
      slug,
      parentId: body.parentId || null,
      entityType: (body.entityType || 'all') as any,
      color: body.color,
      sortOrder: body.sortOrder || 0,
    }).returning();

    return reply.code(201).send(created);
  });

  // Update category
  fastify.put('/orgs/:orgId/categories/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as {
      name?: string;
      slug?: string;
      parentId?: string;
      entityType?: string;
      color?: string;
      sortOrder?: number;
    };

    const [updated] = await db.update(categories)
      .set({
        name: body.name,
        slug: body.slug,
        parentId: body.parentId,
        entityType: body.entityType as any,
        color: body.color,
        sortOrder: body.sortOrder,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.id, id), eq(categories.orgId, orgId)))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Category not found' });
    return reply.send(updated);
  });

  // Delete category (only if no children or references)
  fastify.delete('/orgs/:orgId/categories/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };

    // Check for children
    const [childCount] = await db.select({ count: count() }).from(categories)
      .where(eq(categories.parentId, id));
    if (childCount && Number(childCount.count) > 0) {
      return reply.code(409).send({ error: 'Cannot delete category with subcategories' });
    }

    await db.delete(categories)
      .where(and(eq(categories.id, id), eq(categories.orgId, orgId)));
    return reply.code(204).send();
  });
}
