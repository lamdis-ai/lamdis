import type { FastifyPluginAsync } from 'fastify';
import { eq, and, count, inArray, asc, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { environments } from '@lamdis/db/schema';
import { actionBindings } from '@lamdis/db/schema';

/**
 * Routes for managing org-wide Environments.
 * Environments represent deployment targets (dev/staging/prod) at the org level.
 */
const routes: FastifyPluginAsync = async (app) => {
  // GET /orgs/:id/environments - List all org-wide environments
  app.get('/orgs/:id/environments', async (req) => {
    const { id } = req.params as any;
    const { type, enabled, orgWide } = req.query as any;

    const conditions: any[] = [eq(environments.orgId, id)];

    // By default, return org-wide environments
    if (orgWide !== 'false') {
      conditions.push(eq(environments.orgWide, true));
    }
    if (enabled !== undefined) conditions.push(eq(environments.enabled, enabled === 'true'));

    const envRows = await db.select().from(environments).where(and(...conditions)).orderBy(asc(environments.name));

    // Get counts of bindings and setups for each environment
    const envIds = envRows.map((e: any) => e.id);

    let bindingMap = new Map<string, number>();

    if (envIds.length > 0) {
      const bindingCounts = await db
        .select({ environmentId: actionBindings.environmentId, count: count() })
        .from(actionBindings)
        .where(and(eq(actionBindings.orgId, id), inArray(actionBindings.environmentId, envIds)))
        .groupBy(actionBindings.environmentId);

      bindingMap = new Map(bindingCounts.map((b: any) => [String(b.environmentId), Number(b.count)]));
    }

    const enrichedEnvs = envRows.map((e: any) => ({
      ...e,
      bindingsCount: bindingMap.get(String(e.id)) || 0,
    }));

    return { environments: enrichedEnvs };
  });

  // GET /orgs/:id/environments/:envId - Get a single environment
  app.get('/orgs/:id/environments/:envId', async (req, reply) => {
    const { id, envId } = req.params as any;

    // Support lookup by id or key
    let [environment] = await db.select().from(environments).where(and(eq(environments.orgId, id), eq(environments.id, envId))).limit(1);
    if (!environment) {
      [environment] = await db.select().from(environments).where(and(eq(environments.orgId, id), eq(environments.key, envId), eq(environments.orgWide, true))).limit(1);
    }

    if (!environment) {
      return reply.code(404).send({ error: 'environment_not_found', envId });
    }

    return { environment };
  });

  // POST /orgs/:id/environments - Create or update an org-wide environment
  app.post('/orgs/:id/environments', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;

    if (!body.key) {
      return reply.code(400).send({ error: 'key is required' });
    }
    if (!body.name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    // Upsert by key for org-wide environments
    const [existing] = await db.select().from(environments).where(and(eq(environments.orgId, id), eq(environments.key, body.key), eq(environments.orgWide, true))).limit(1);

    let environment;
    if (existing) {
      const { suiteId: _ignoreSuiteId, ...updateBody } = body;
      [environment] = await db.update(environments).set({
        ...updateBody,
        orgId: id,
        orgWide: true,
        suiteId: null, // Ensure org-wide envs don't have suiteId
        updatedAt: new Date(),
      }).where(eq(environments.id, existing.id)).returning();
    } else {
      const { suiteId: _ignoreSuiteId, ...insertBody } = body;
      [environment] = await db.insert(environments).values({
        ...insertBody,
        orgId: id,
        orgWide: true,
        suiteId: null, // Ensure org-wide envs don't have suiteId
      }).returning();
    }

    return { environment };
  });

  // PUT /orgs/:id/environments/:envId - Update a single environment
  app.put('/orgs/:id/environments/:envId', async (req, reply) => {
    const { id, envId } = req.params as any;
    const body = req.body as any;

    const [environment] = await db.update(environments).set({
      ...body,
      updatedAt: new Date(),
    }).where(and(eq(environments.orgId, id), eq(environments.id, envId))).returning();

    if (!environment) {
      return reply.code(404).send({ error: 'environment_not_found', envId });
    }

    return { environment };
  });

  // DELETE /orgs/:id/environments/:envId - Delete an environment
  app.delete('/orgs/:id/environments/:envId', async (req, reply) => {
    const { id, envId } = req.params as any;

    // Check for existing bindings
    const [bindingCountResult] = await db.select({ count: count() }).from(actionBindings).where(
      and(eq(actionBindings.orgId, id), eq(actionBindings.environmentId, envId))
    );
    const bindingCount = bindingCountResult?.count ?? 0;
    if (bindingCount > 0) {
      return reply.code(409).send({
        error: 'environment_has_bindings',
        bindingCount,
        message: 'Delete action bindings first or use force=true'
      });
    }

    await db.delete(environments).where(and(eq(environments.orgId, id), eq(environments.id, envId)));
    reply.status(204).send();
  });

  // POST /orgs/:id/environments/:envId/clone - Clone an environment
  app.post('/orgs/:id/environments/:envId/clone', async (req, reply) => {
    const { id, envId } = req.params as any;
    const { newKey, newName, cloneBindings } = req.body as any;

    if (!newKey) {
      return reply.code(400).send({ error: 'newKey is required' });
    }

    const [source] = await db.select().from(environments).where(and(eq(environments.orgId, id), eq(environments.id, envId))).limit(1);
    if (!source) {
      return reply.code(404).send({ error: 'environment_not_found', envId });
    }

    // Check if new key already exists
    const [existing] = await db.select().from(environments).where(
      and(eq(environments.orgId, id), eq(environments.key, newKey), eq(environments.orgWide, true))
    ).limit(1);
    if (existing) {
      return reply.code(409).send({ error: 'key_already_exists', key: newKey });
    }

    const { id: _id, key: _key, name, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = source as any;

    const [cloned] = await db.insert(environments).values({
      ...rest,
      orgId: id,
      key: newKey,
      name: newName || `${name} (copy)`,
      orgWide: true,
    }).returning();

    // Optionally clone all action bindings
    if (cloneBindings) {
      const bindings = await db.select().from(actionBindings).where(
        and(eq(actionBindings.orgId, id), eq(actionBindings.environmentId, envId))
      );

      for (const binding of bindings) {
        const { id: _bindingId, environmentId: _envId, createdAt: _bCreatedAt, updatedAt: _bUpdatedAt, ...bindingRest } = binding as any;
        await db.insert(actionBindings).values({
          ...bindingRest,
          environmentId: cloned.id,
        });
      }
    }

    return { environment: cloned };
  });

  // GET /orgs/:id/environments/types - Get available environment types
  app.get('/orgs/:id/environments/types', async () => {
    return {
      types: [
        { value: 'development', label: 'Development', description: 'Local or dev server environment' },
        { value: 'staging', label: 'Staging', description: 'Pre-production environment for testing' },
        { value: 'production', label: 'Production', description: 'Live production environment' },
        { value: 'testing', label: 'Testing', description: 'Dedicated testing environment' },
        { value: 'custom', label: 'Custom', description: 'Custom environment type' },
      ],
    };
  });
};

export default routes;
