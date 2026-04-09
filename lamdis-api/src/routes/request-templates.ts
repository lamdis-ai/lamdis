import type { FastifyPluginAsync } from 'fastify';
import { eq, and, or, desc, ilike, count } from 'drizzle-orm';
import { db } from '../db.js';
import { requestTemplates } from '@lamdis/db/schema';

const routes: FastifyPluginAsync = async (app) => {
  // GET /request-templates?q=&provider=&category=&page=&pageSize=
  app.get('/request-templates', async (req) => {
    const q = (req.query || {}) as any;
    const page = Math.max(parseInt(q.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.pageSize) || 24, 1), 100);
    const offset = (page - 1) * pageSize;
    const provider = q.provider as string | undefined;
    const category = q.category as string | undefined;
    const search = (q.q || q.search || '') as string;

    const conditions: any[] = [eq(requestTemplates.status, 'active')];
    if (provider) conditions.push(eq(requestTemplates.provider, provider));
    if (category) conditions.push(eq(requestTemplates.category, category));
    if (search.trim()) {
      const pattern = `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      conditions.push(
        or(
          ilike(requestTemplates.key, pattern),
          ilike(requestTemplates.title, pattern),
          ilike(requestTemplates.description, pattern)
        )
      );
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const [totalResult, list, facetsRows] = await Promise.all([
      db.select({ value: count() }).from(requestTemplates).where(whereClause).then(rows => rows[0]?.value ?? 0),
      db.select().from(requestTemplates).where(whereClause).orderBy(desc(requestTemplates.updatedAt)).limit(pageSize).offset(offset),
      db.select({ provider: requestTemplates.provider, category: requestTemplates.category })
        .from(requestTemplates)
        .where(whereClause)
        .then(rows => {
          const providers = [...new Set(rows.map(r => r.provider).filter(Boolean))];
          const categories = [...new Set(rows.map(r => r.category).filter(Boolean))];
          return { providers, categories };
        })
        .catch(() => ({ providers: [] as string[], categories: [] as string[] }))
    ]);

    return { templates: list, total: totalResult, page, pageSize, facets: facetsRows };
  });
};

export default routes;
