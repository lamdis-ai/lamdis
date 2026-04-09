import type { FastifyPluginAsync } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { knowledgeArticles } from '@lamdis/db/schema';

const routes: FastifyPluginAsync = async (app) => {
  // GET /orgs/:id/knowledge
  app.get('/orgs/:id/knowledge', async (req) => {
    const { id } = req.params as any;
    const articles = await db
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.orgId, id))
      .orderBy(desc(knowledgeArticles.updatedAt));
    return { articles };
  });

  // GET single
  app.get('/orgs/:id/knowledge/:kid', async (req, reply) => {
    const { id, kid } = req.params as any;
    const [art] = await db
      .select()
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.orgId, id), eq(knowledgeArticles.articleId, kid)))
      .limit(1);
    if (!art) return reply.code(404).send({ error: 'not_found' });
    return { article: art };
  });

  // POST create or update (upsert by orgId + articleId)
  app.post('/orgs/:id/knowledge', async (req) => {
    const { id } = req.params as any;
    const a = (req.body || {}) as any;
    const now = new Date();

    // Try to find existing article
    const [existing] = await db
      .select()
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.orgId, id), eq(knowledgeArticles.articleId, a.id)))
      .limit(1);

    if (existing) {
      // Update
      await db
        .update(knowledgeArticles)
        .set({ ...a, orgId: id, articleId: a.id, updatedAt: now })
        .where(eq(knowledgeArticles.id, existing.id));
    } else {
      // Insert
      await db
        .insert(knowledgeArticles)
        .values({ ...a, orgId: id, articleId: a.id, createdAt: now, updatedAt: now });
    }

    const [art] = await db
      .select()
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.orgId, id), eq(knowledgeArticles.articleId, a.id)))
      .limit(1);
    return { article: art };
  });

  // DELETE
  app.delete('/orgs/:id/knowledge/:kid', async (req, reply) => {
    const { id, kid } = req.params as any;
    await db
      .delete(knowledgeArticles)
      .where(and(eq(knowledgeArticles.orgId, id), eq(knowledgeArticles.articleId, kid)));
    return { ok: true };
  });
};

export default routes;
