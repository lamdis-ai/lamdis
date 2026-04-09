import type { FastifyPluginAsync } from 'fastify';
import { asc } from 'drizzle-orm';
import { db } from '../db.js';
import { providerTemplates } from '@lamdis/db/schema';

const providerTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.get('/provider-templates', async () => {
    const list = await db.select().from(providerTemplates).orderBy(asc(providerTemplates.key));
    return { templates: list.map(t => ({
      key: t.key,
      name: t.name,
      authorize_url: t.authorizeUrl,
      token_url: t.tokenUrl,
      scopes: t.scopes,
      docs_url: t.docsUrl,
      logo_s3_key: t.logoS3Key || undefined,
    })) };
  });
};

export default providerTemplateRoutes;
