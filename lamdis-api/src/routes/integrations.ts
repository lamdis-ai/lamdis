import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations } from '@lamdis/db/schema';
import { encrypt } from '../lib/crypto.js';

const routes: FastifyPluginAsync = async (app) => {
  // GET /orgs/:id/integrations/creds -> list configured providers (no secrets)
  app.get('/orgs/:id/integrations/creds', async (req, reply) => {
    const { id } = req.params as any;
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const providers = Object.keys((org as any).integrations?.providers || {});
    return { providers };
  });

  // PATCH /orgs/:id/integrations/creds -> upsert provider token for testing
  app.patch('/orgs/:id/integrations/creds', async (req, reply) => {
    const { id } = req.params as any;
    const { provider, token, header, scheme } = (req.body || {}) as { provider?: string; token?: string; header?: string; scheme?: string };
    if (!provider || !token) return reply.code(400).send({ error: 'provider and token required' });
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const enc = encrypt({ token });
    // Build updated integrations object
    const integrations = (org.integrations || {}) as Record<string, any>;
    const providers = integrations.providers || {};
    providers[provider] = { enc, header: header || undefined, scheme: scheme || undefined };
    integrations.providers = providers;
    await db
      .update(organizations)
      .set({ integrations, updatedAt: new Date() })
      .where(eq(organizations.id, id));
    return { ok: true };
  });
};

export default routes;
