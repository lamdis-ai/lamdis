import type { FastifyPluginAsync } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db.js';
import { knowledgeCategories } from '@lamdis/db/schema';

const routes: FastifyPluginAsync = async (app) => {
  // List
  app.get('/orgs/:id/knowledge-categories', async (req) => {
    const { id } = req.params as any;
    const categories = await db
      .select()
      .from(knowledgeCategories)
      .where(eq(knowledgeCategories.orgId, id))
      .orderBy(asc(knowledgeCategories.order), asc(knowledgeCategories.path));
    return { categories };
  });

  // Create or update (upsert by path)
  app.post('/orgs/:id/knowledge-categories', async (req) => {
    const { id } = req.params as any;
    const body = (req.body || {}) as any;
    const { path, name, description, order } = body || {};
    if (!path || !name) return { error: 'path_and_name_required' } as any;

    const now = new Date();

    // Try to find existing category
    const [existing] = await db
      .select()
      .from(knowledgeCategories)
      .where(and(eq(knowledgeCategories.orgId, id), eq(knowledgeCategories.path, path)))
      .limit(1);

    if (existing) {
      // Update
      await db
        .update(knowledgeCategories)
        .set({
          name,
          description: description || '',
          order: typeof order === 'number' ? order : 0,
          updatedAt: now,
        })
        .where(eq(knowledgeCategories.id, existing.id));
    } else {
      // Insert
      await db
        .insert(knowledgeCategories)
        .values({
          orgId: id,
          path,
          name,
          description: description || '',
          order: typeof order === 'number' ? order : 0,
          createdAt: now,
          updatedAt: now,
        });
    }

    const [cat] = await db
      .select()
      .from(knowledgeCategories)
      .where(and(eq(knowledgeCategories.orgId, id), eq(knowledgeCategories.path, path)))
      .limit(1);
    return { category: cat };
  });

  // Delete
  app.delete('/orgs/:id/knowledge-categories/*', async (req) => {
    // wildcard to allow slashes in path
    const p = (req.params as any)['*'] as string;
    const { id } = req.params as any;
    if (!p) return { ok: true };
    await db
      .delete(knowledgeCategories)
      .where(and(eq(knowledgeCategories.orgId, id), eq(knowledgeCategories.path, decodeURIComponent(p))));
    return { ok: true };
  });
};

export default routes;
