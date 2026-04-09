import type { FastifyPluginAsync } from 'fastify';
import { eq, and, or, inArray, desc, sql, ilike, count } from 'drizzle-orm';
import { db } from '../db.js';
import { actionTemplates, providerTemplates, actions } from '@lamdis/db/schema';
import { members, auditLogs } from '@lamdis/db/schema';

const routes: FastifyPluginAsync = async (app) => {
  // List templates: everyone sees active; users also see their org's pending
  app.get('/', async (req) => {
    const user = (req as any).user;
    let orgIds: string[] = [];
    if (user?.sub) {
      const mems = await db.select({ orgId: members.orgId }).from(members).where(eq(members.userSub, user.sub));
      orgIds = mems.map(m => m.orgId);
    }
    const q = (req.query || {}) as any;
    const page = Math.max(parseInt(q.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.pageSize) || 24, 1), 100);
    const offset = (page - 1) * pageSize;
    const status = q.status; // optional override (admin-y usage). Otherwise active + own pending
    const provider = q.provider as string | undefined;
    const category = q.category as string | undefined;
    const search = (q.q || q.search || '') as string;

    // Build conditions array
    const conditions: any[] = [];

    // Status filter
    if (status) {
      conditions.push(eq(actionTemplates.status, status));
    } else {
      const statusOr: any[] = [eq(actionTemplates.status, 'active')];
      if (orgIds.length) {
        statusOr.push(
          and(
            eq(actionTemplates.status, 'pending'),
            inArray(actionTemplates.submittedByOrgId, orgIds)
          )
        );
      }
      conditions.push(statusOr.length === 1 ? statusOr[0] : or(...statusOr));
    }

    if (provider) conditions.push(eq(actionTemplates.provider, provider));
    if (category) conditions.push(eq(actionTemplates.category, category));

    // Text search: use ilike for partial prefix match
    if (search.trim()) {
      const pattern = `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      conditions.push(
        or(
          ilike(actionTemplates.key, pattern),
          ilike(actionTemplates.title, pattern),
          ilike(actionTemplates.description, pattern)
        )
      );
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    // Facets query
    const facetsPromise = db
      .select({
        provider: actionTemplates.provider,
        category: actionTemplates.category,
      })
      .from(actionTemplates)
      .where(whereClause)
      .then(rows => {
        const providers = [...new Set(rows.map(r => r.provider).filter(Boolean))];
        const categories = [...new Set(rows.map(r => r.category).filter(Boolean))];
        return { providers, categories };
      })
      .catch(() => ({ providers: [] as string[], categories: [] as string[] }));

    // Total count
    const totalPromise = db
      .select({ value: count() })
      .from(actionTemplates)
      .where(whereClause)
      .then(rows => rows[0]?.value ?? 0);

    // Paginated list
    const listPromise = db
      .select()
      .from(actionTemplates)
      .where(whereClause)
      .orderBy(desc(actionTemplates.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const [facets, total, list] = await Promise.all([facetsPromise, totalPromise, listPromise]);

    let providersMap: Record<string, any> = {};
    if (list.length) {
      const uniqueProviders = Array.from(new Set(list.map(l => l.provider).filter(Boolean))) as string[];
      if (uniqueProviders.length) {
        const provs = await db
          .select({ key: providerTemplates.key, logoS3Key: providerTemplates.logoS3Key })
          .from(providerTemplates)
          .where(inArray(providerTemplates.key, uniqueProviders));
        providersMap = Object.fromEntries(provs.map(p => [p.key, { logo_s3_key: p.logoS3Key }]));
      }
    }
    const enriched = list.map(t => ({ ...t, provider_logo_s3_key: providersMap[t.provider]?.logo_s3_key }));
    return {
      templates: enriched,
      page, pageSize, total, pages: Math.ceil(total / pageSize),
      facets
    };
  });

  // Submit new template (pending)
  app.post('/', async (req) => {
    const user = (req as any).user;
    const body = req.body as any;
    let submittedByOrgId: string | undefined = undefined;
    if (user?.sub) {
      const [mem] = await db.select({ orgId: members.orgId }).from(members).where(eq(members.userSub, user.sub)).limit(1);
      submittedByOrgId = mem?.orgId;
    }
    const [created] = await db.insert(actionTemplates).values({ ...body, status: 'pending', submittedByOrgId }).returning();
    await db.insert(auditLogs).values({ orgId: submittedByOrgId!, actor: { sub: user?.sub }, action: 'action_template.submit', details: { key: created.key } });
    return { template: created };
  });

  // Add template to org manifest (as an action draft/enabled=false until publish)
  app.post('/:key/add-to-manifest', async (req, reply) => {
    const { key } = req.params as any;
    const { orgId } = (req.body || {}) as any;
    if (!orgId) return reply.code(400).send({ error: 'orgId required' });
    const [t] = await db.select().from(actionTemplates).where(eq(actionTemplates.key, key)).limit(1);
    if (!t) return reply.code(404).send({ error: 'Template not found' });
    if (t.status !== 'active') return reply.code(400).send({ error: 'Template is not active' });
    const actionId = t.key;
    // Normalize http shapes: some UI expects http.url in addition to transport.http.full_url
    const transport = t.transport || {};
    const tHttp = (transport as any).http || t.http || {};
    const fullUrl = tHttp.full_url || (t.http as any)?.full_url || (t.http as any)?.url;
    const http = { ...(t.http || {} as any), url: (t.http as any)?.url || fullUrl, full_url: fullUrl } as any;
    const a = {
      orgId,
      actionId,
      title: t.title,
      description: t.description,
      transport: { ...transport, http: { ...tHttp, full_url: fullUrl } },
      http,
      inputSchema: t.inputSchema,
      inputSchemaDescription: t.inputSchemaDescription,
      outputSchema: t.outputSchema,
      outputSchemaDescription: t.outputSchemaDescription,
      staticResponse: t.staticResponse,
      enabled: true,
    } as any;

    // Upsert: check if exists, then insert or update
    const [existing] = await db.select({ id: actions.id }).from(actions).where(and(eq(actions.orgId, orgId), eq(actions.actionId, actionId))).limit(1);
    if (existing) {
      await db.update(actions).set({ ...a, updatedAt: new Date() }).where(eq(actions.id, existing.id));
    } else {
      await db.insert(actions).values(a);
    }

    await db.insert(auditLogs).values({ orgId, actor: { sub: (req as any).user?.sub }, action: 'action_template.add_to_manifest', details: { key } });
    return { ok: true };
  });
};

export default routes;
