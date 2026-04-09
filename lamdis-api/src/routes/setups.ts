import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db.js';
import { setups, environments, assistants, mockAssistants, workflowSuites } from '@lamdis/db/schema';
import { eq, and, asc, ne, isNull, inArray } from 'drizzle-orm';

export default async function setupRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // SETUPS CRUD
  // =========================================================================

  // GET /orgs/:id/setups - List all setups for an org
  fastify.get('/orgs/:id/setups', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { suiteId, environmentId, enabled } = req.query as {
      suiteId?: string;
      environmentId?: string;
      enabled?: string;
    };

    const conditions: ReturnType<typeof eq>[] = [eq(setups.orgId, id)];
    if (suiteId) conditions.push(eq(setups.suiteId, suiteId));
    if (environmentId) conditions.push(eq(setups.environmentId, environmentId));
    if (enabled !== undefined) conditions.push(eq(setups.enabled, enabled === 'true'));

    const rows = await db.select().from(setups)
      .where(and(...conditions))
      .orderBy(asc(setups.name));

    // Enrich with environment and assistant names
    const envIds = [...new Set(rows.map(s => s.environmentId))];
    const assistantIds = rows.map(s => s.assistantId).filter(Boolean) as string[];
    const suiteIds = rows.map(s => s.suiteId).filter(Boolean) as string[];

    let envMap = new Map<string, typeof environments.$inferSelect>();
    if (envIds.length > 0) {
      const envRows = await db.select().from(environments)
        .where(inArray(environments.id, envIds));
      envMap = new Map(envRows.map(e => [e.id, e]));
    }

    let assistantMap = new Map<string, { name: string }>();
    if (assistantIds.length > 0) {
      const [regularRows, mockRows] = await Promise.all([
        db.select({ id: assistants.id, name: assistants.name }).from(assistants)
          .where(inArray(assistants.id, assistantIds)),
        db.select({ id: mockAssistants.id, name: mockAssistants.name }).from(mockAssistants)
          .where(inArray(mockAssistants.id, assistantIds)),
      ]);
      for (const a of regularRows) assistantMap.set(a.id, a);
      for (const a of mockRows) assistantMap.set(a.id, a);
    }

    let suiteMap = new Map<string, { name: string }>();
    if (suiteIds.length > 0) {
      const suiteRows = await db.select({ id: workflowSuites.id, name: workflowSuites.name })
        .from(workflowSuites)
        .where(inArray(workflowSuites.id, suiteIds));
      suiteMap = new Map(suiteRows.map(s => [s.id, s]));
    }

    const enrichedSetups = rows.map(s => {
      const env = envMap.get(s.environmentId);
      return {
        ...s,
        environmentName: env?.name,
        environmentKey: env?.key,
        assistantName: s.assistantId ? assistantMap.get(s.assistantId)?.name : undefined,
        suiteName: s.suiteId ? suiteMap.get(s.suiteId)?.name : undefined,
      };
    });

    return reply.send({ setups: enrichedSetups });
  });

  // GET /orgs/:id/setups/default - Get the default setup for org or suite
  fastify.get('/orgs/:id/setups/default', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { suiteId } = req.query as { suiteId?: string };

    const conditions: ReturnType<typeof eq>[] = [
      eq(setups.orgId, id),
      eq(setups.isDefault, true),
      eq(setups.enabled, true),
    ];
    if (suiteId) {
      conditions.push(eq(setups.suiteId, suiteId));
    }

    let [setup] = await db.select().from(setups)
      .where(and(...conditions))
      .limit(1);

    // Fall back to org-wide default if suite-specific not found
    if (!setup && suiteId) {
      [setup] = await db.select().from(setups)
        .where(and(
          eq(setups.orgId, id),
          eq(setups.isDefault, true),
          eq(setups.enabled, true),
          isNull(setups.suiteId),
        ))
        .limit(1);
    }

    if (!setup) {
      return reply.code(404).send({ error: 'no_default_setup' });
    }

    return reply.send({ setup });
  });

  // GET /orgs/:id/setups/:setupId - Get a single setup
  fastify.get('/orgs/:id/setups/:setupId', async (req, reply) => {
    const { id, setupId } = req.params as { id: string; setupId: string };

    // Support lookup by id or key
    let [setup] = await db.select().from(setups)
      .where(and(eq(setups.orgId, id), eq(setups.id, setupId)))
      .limit(1);

    if (!setup) {
      [setup] = await db.select().from(setups)
        .where(and(eq(setups.orgId, id), eq(setups.key, setupId)))
        .limit(1);
    }

    if (!setup) {
      return reply.code(404).send({ error: 'setup_not_found', setupId });
    }

    // Enrich with related entity info
    const [env] = await db.select().from(environments)
      .where(eq(environments.id, setup.environmentId))
      .limit(1);

    let assistant = null;
    if (setup.assistantId) {
      const [regular] = await db.select().from(assistants)
        .where(eq(assistants.id, setup.assistantId))
        .limit(1);
      if (regular) {
        assistant = regular;
      } else {
        const [mock] = await db.select().from(mockAssistants)
          .where(eq(mockAssistants.id, setup.assistantId))
          .limit(1);
        assistant = mock || null;
      }
    }

    return reply.send({
      setup: {
        ...setup,
        environment: env || null,
        assistant,
      },
    });
  });

  // POST /orgs/:id/setups - Create or update a setup (upsert by key)
  fastify.post('/orgs/:id/setups', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;

    if (!body.key) {
      return reply.code(400).send({ error: 'key is required' });
    }
    if (!body.name) {
      return reply.code(400).send({ error: 'name is required' });
    }
    if (!body.environmentId) {
      return reply.code(400).send({ error: 'environmentId is required' });
    }

    // Verify environment exists
    const [env] = await db.select().from(environments)
      .where(eq(environments.id, body.environmentId))
      .limit(1);
    if (!env) {
      return reply.code(404).send({ error: 'environment_not_found', environmentId: body.environmentId });
    }

    // Verify assistant if provided (check both Assistant and MockAssistant)
    if (body.assistantId) {
      const [regular] = await db.select({ id: assistants.id }).from(assistants)
        .where(eq(assistants.id, body.assistantId)).limit(1);
      if (!regular) {
        const [mock] = await db.select({ id: mockAssistants.id }).from(mockAssistants)
          .where(eq(mockAssistants.id, body.assistantId)).limit(1);
        if (!mock) {
          return reply.code(404).send({ error: 'assistant_not_found', assistantId: body.assistantId });
        }
      }
    }

    // If this is set as default, unset other defaults for the same scope
    if (body.isDefault) {
      const unsetConditions: ReturnType<typeof eq>[] = [
        eq(setups.orgId, id),
        eq(setups.isDefault, true),
      ];
      if (body.suiteId) {
        unsetConditions.push(eq(setups.suiteId, body.suiteId));
      } else {
        unsetConditions.push(isNull(setups.suiteId));
      }
      await db.update(setups)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(...unsetConditions));
    }

    // Upsert by key: check if exists, then update or insert
    const [existing] = await db.select().from(setups)
      .where(and(eq(setups.orgId, id), eq(setups.key, body.key)))
      .limit(1);

    let setup;
    if (existing) {
      [setup] = await db.update(setups)
        .set({
          name: body.name,
          description: body.description,
          environmentId: body.environmentId,
          assistantId: body.assistantId || null,
          suiteId: body.suiteId || null,
          config: body.config,
          labels: body.labels,
          isDefault: body.isDefault,
          enabled: body.enabled,
          updatedAt: new Date(),
        })
        .where(eq(setups.id, existing.id))
        .returning();
    } else {
      [setup] = await db.insert(setups).values({
        orgId: id,
        key: body.key,
        name: body.name,
        description: body.description,
        environmentId: body.environmentId,
        assistantId: body.assistantId || null,
        suiteId: body.suiteId || null,
        config: body.config,
        labels: body.labels || [],
        isDefault: body.isDefault || false,
        enabled: body.enabled !== false,
      }).returning();
    }

    return reply.send({ setup });
  });

  // PUT /orgs/:id/setups/:setupId - Update a single setup
  fastify.put('/orgs/:id/setups/:setupId', async (req, reply) => {
    const { id, setupId } = req.params as { id: string; setupId: string };
    const body = req.body as any;

    // If this is set as default, unset other defaults
    if (body.isDefault) {
      const [existing] = await db.select().from(setups)
        .where(eq(setups.id, setupId)).limit(1);

      const unsetConditions: ReturnType<typeof eq>[] = [
        eq(setups.orgId, id),
        eq(setups.isDefault, true),
        ne(setups.id, setupId),
      ];
      if (existing?.suiteId) {
        unsetConditions.push(eq(setups.suiteId, existing.suiteId));
      }
      await db.update(setups)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(...unsetConditions));
    }

    const [updated] = await db.update(setups)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(and(eq(setups.orgId, id), eq(setups.id, setupId)))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: 'setup_not_found', setupId });
    }

    return reply.send({ setup: updated });
  });

  // DELETE /orgs/:id/setups/:setupId - Delete a setup
  fastify.delete('/orgs/:id/setups/:setupId', async (req, reply) => {
    const { id, setupId } = req.params as { id: string; setupId: string };
    await db.delete(setups)
      .where(and(eq(setups.orgId, id), eq(setups.id, setupId)));
    return reply.code(204).send();
  });

  // POST /orgs/:id/setups/:setupId/clone - Clone a setup with a new key
  fastify.post('/orgs/:id/setups/:setupId/clone', async (req, reply) => {
    const { id, setupId } = req.params as { id: string; setupId: string };
    const { newKey, newName } = req.body as { newKey: string; newName?: string };

    if (!newKey) {
      return reply.code(400).send({ error: 'newKey is required' });
    }

    const [source] = await db.select().from(setups)
      .where(and(eq(setups.orgId, id), eq(setups.id, setupId)))
      .limit(1);
    if (!source) {
      return reply.code(404).send({ error: 'setup_not_found', setupId });
    }

    // Check if new key already exists
    const [existingKey] = await db.select().from(setups)
      .where(and(eq(setups.orgId, id), eq(setups.key, newKey)))
      .limit(1);
    if (existingKey) {
      return reply.code(409).send({ error: 'key_already_exists', key: newKey });
    }

    const { id: _id, key: _key, name, createdAt: _ca, updatedAt: _ua, ...rest } = source;

    const [cloned] = await db.insert(setups).values({
      ...rest,
      orgId: id,
      key: newKey,
      name: newName || `${name} (copy)`,
      isDefault: false,
    }).returning();

    return reply.send({ setup: cloned });
  });
}
