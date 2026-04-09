import type { FastifyPluginAsync } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { actionBindings, actions } from '@lamdis/db/schema';
import { environments } from '@lamdis/db/schema';
import { connectorInstallations } from '@lamdis/db/schema';

/**
 * Routes for managing ActionBindings.
 * ActionBindings are the "glue" records that bind Actions to Environments
 * with specific auth configurations and overrides.
 */
const routes: FastifyPluginAsync = async (app) => {
  // GET /orgs/:id/action-bindings - List all action bindings for an org
  app.get('/orgs/:id/action-bindings', async (req) => {
    const { id } = req.params as any;
    const { actionId, environmentId, enabled } = req.query as any;

    const conditions: any[] = [eq(actionBindings.orgId, id)];
    if (actionId) conditions.push(eq(actionBindings.actionId, actionId));
    if (environmentId) conditions.push(eq(actionBindings.environmentId, environmentId));
    if (enabled !== undefined) conditions.push(eq(actionBindings.enabled, enabled === 'true'));

    const bindings = await db.select().from(actionBindings).where(and(...conditions));

    // Enrich with action, environment, and connection names
    const actionIdsList = [...new Set(bindings.map((b: any) => b.actionId))];
    const envIds = [...new Set(bindings.map((b: any) => String(b.environmentId)))];
    const connIds = [...new Set(bindings.filter((b: any) => b.connectionId).map((b: any) => String(b.connectionId)))];

    const actionsRows = actionIdsList.length
      ? await db.select().from(actions).where(and(eq(actions.orgId, id), inArray(actions.actionId, actionIdsList)))
      : [];
    const environmentRows = envIds.length
      ? await db.select().from(environments).where(inArray(environments.id, envIds))
      : [];
    const connectionRows = connIds.length
      ? await db.select().from(connectorInstallations).where(inArray(connectorInstallations.id, connIds))
      : [];

    const actionMap = new Map(actionsRows.map((a: any) => [a.actionId, a]));
    const envMap = new Map(environmentRows.map((e: any) => [String(e.id), e]));
    const connMap = new Map(connectionRows.map((c: any) => [String(c.id), c]));

    const enrichedBindings = bindings.map((b: any) => ({
      ...b,
      actionTitle: actionMap.get(b.actionId)?.title,
      environmentName: envMap.get(String(b.environmentId))?.name,
      environmentKey: envMap.get(String(b.environmentId))?.key,
      connectionName: b.connectionId ? connMap.get(String(b.connectionId))?.name : undefined,
    }));

    return { bindings: enrichedBindings };
  });

  // GET /orgs/:id/action-bindings/:bindingId - Get a single action binding
  app.get('/orgs/:id/action-bindings/:bindingId', async (req, reply) => {
    const { id, bindingId } = req.params as any;
    const [binding] = await db.select().from(actionBindings).where(and(eq(actionBindings.orgId, id), eq(actionBindings.id, bindingId))).limit(1);
    if (!binding) {
      return reply.code(404).send({ error: 'action_binding_not_found', bindingId });
    }
    return { binding };
  });

  // POST /orgs/:id/action-bindings - Create or update action binding
  app.post('/orgs/:id/action-bindings', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;

    if (!body.actionId) {
      return reply.code(400).send({ error: 'actionId is required' });
    }
    if (!body.environmentId) {
      return reply.code(400).send({ error: 'environmentId is required' });
    }

    // Verify action exists
    const [action] = await db.select().from(actions).where(and(eq(actions.orgId, id), eq(actions.actionId, body.actionId))).limit(1);
    if (!action) {
      return reply.code(404).send({ error: 'action_not_found', actionId: body.actionId });
    }

    // Verify environment exists
    const [env] = await db.select().from(environments).where(eq(environments.id, body.environmentId)).limit(1);
    if (!env) {
      return reply.code(404).send({ error: 'environment_not_found', environmentId: body.environmentId });
    }

    // Sanitize body: remove empty string values for UUID fields
    const sanitizedBody = { ...body };
    if (sanitizedBody.connectionId === '' || sanitizedBody.connectionId === null) {
      delete sanitizedBody.connectionId;
    }

    // Upsert: one binding per (orgId, actionId, environmentId)
    const [existing] = await db.select({ id: actionBindings.id }).from(actionBindings).where(
      and(eq(actionBindings.orgId, id), eq(actionBindings.actionId, body.actionId), eq(actionBindings.environmentId, body.environmentId))
    ).limit(1);

    let binding;
    if (existing) {
      [binding] = await db.update(actionBindings)
        .set({ ...sanitizedBody, orgId: id, updatedAt: new Date() })
        .where(eq(actionBindings.id, existing.id))
        .returning();
    } else {
      [binding] = await db.insert(actionBindings)
        .values({ ...sanitizedBody, orgId: id })
        .returning();
    }

    return { binding };
  });

  // PUT /orgs/:id/action-bindings/:bindingId - Update a single action binding
  app.put('/orgs/:id/action-bindings/:bindingId', async (req, reply) => {
    const { id, bindingId } = req.params as any;
    const body = req.body as any;

    const [binding] = await db.update(actionBindings)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(actionBindings.orgId, id), eq(actionBindings.id, bindingId)))
      .returning();

    if (!binding) {
      return reply.code(404).send({ error: 'action_binding_not_found', bindingId });
    }

    return { binding };
  });

  // DELETE /orgs/:id/action-bindings/:bindingId - Delete an action binding
  app.delete('/orgs/:id/action-bindings/:bindingId', async (req, reply) => {
    const { id, bindingId } = req.params as any;
    await db.delete(actionBindings).where(and(eq(actionBindings.orgId, id), eq(actionBindings.id, bindingId)));
    reply.status(204).send();
  });

  // POST /orgs/:id/action-bindings/bulk - Bulk create/update bindings
  app.post('/orgs/:id/action-bindings/bulk', async (req) => {
    const { id } = req.params as any;
    const body = req.body as any;
    const bindingsInput = Array.isArray(body) ? body : body.bindings || [];

    const results: any[] = [];

    for (const b of bindingsInput) {
      if (!b.actionId || !b.environmentId) continue;

      // Upsert: one binding per (orgId, actionId, environmentId)
      const [existing] = await db.select({ id: actionBindings.id }).from(actionBindings).where(
        and(eq(actionBindings.orgId, id), eq(actionBindings.actionId, b.actionId), eq(actionBindings.environmentId, b.environmentId))
      ).limit(1);

      let binding;
      if (existing) {
        [binding] = await db.update(actionBindings)
          .set({ ...b, orgId: id, updatedAt: new Date() })
          .where(eq(actionBindings.id, existing.id))
          .returning();
      } else {
        [binding] = await db.insert(actionBindings)
          .values({ ...b, orgId: id })
          .returning();
      }
      results.push(binding);
    }

    return { bindings: results };
  });

  // GET /orgs/:id/actions/:actionId/bindings - Get all bindings for a specific action
  app.get('/orgs/:id/actions/:actionId/bindings', async (req) => {
    const { id, actionId } = req.params as any;
    const bindings = await db.select().from(actionBindings).where(and(eq(actionBindings.orgId, id), eq(actionBindings.actionId, actionId)));

    // Enrich with environment info
    const envIds = bindings.map((b: any) => b.environmentId);
    const environmentRows = envIds.length
      ? await db.select().from(environments).where(inArray(environments.id, envIds))
      : [];
    const envMap = new Map(environmentRows.map((e: any) => [String(e.id), e]));

    const enrichedBindings = bindings.map((b: any) => ({
      ...b,
      environmentName: envMap.get(String(b.environmentId))?.name,
      environmentKey: envMap.get(String(b.environmentId))?.key,
      environmentType: envMap.get(String(b.environmentId))?.type,
    }));

    return { bindings: enrichedBindings };
  });

  // GET /orgs/:id/environments/:envId/bindings - Get all bindings for a specific environment
  app.get('/orgs/:id/environments/:envId/bindings', async (req) => {
    const { id, envId } = req.params as any;
    const bindings = await db.select().from(actionBindings).where(and(eq(actionBindings.orgId, id), eq(actionBindings.environmentId, envId)));

    // Enrich with action info
    const actionIdsList = bindings.map((b: any) => b.actionId);
    const actionsRows = actionIdsList.length
      ? await db.select().from(actions).where(and(eq(actions.orgId, id), inArray(actions.actionId, actionIdsList)))
      : [];
    const actionMap = new Map(actionsRows.map((a: any) => [a.actionId, a]));

    const enrichedBindings = bindings.map((b: any) => ({
      ...b,
      actionTitle: actionMap.get(b.actionId)?.title,
      actionDescription: actionMap.get(b.actionId)?.description,
    }));

    return { bindings: enrichedBindings };
  });
};

export default routes;
