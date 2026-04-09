/**
 * Outcome Playbook routes
 *
 * - GET    /orgs/:orgId/playbooks
 * - GET    /orgs/:orgId/playbooks/:id
 * - POST   /orgs/:orgId/playbooks/draft/wizard
 * - POST   /orgs/:orgId/playbooks/draft/sop
 * - POST   /orgs/:orgId/playbooks/draft/chat
 * - POST   /orgs/:orgId/playbooks/:id/activate
 * - POST   /orgs/:orgId/playbooks/:id/archive
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import {
  outcomePlaybooks,
  playbookSystemBindings,
  playbookDocumentRequirements,
  outcomeTypes,
  connectorInstances,
  documentTemplates,
} from '@lamdis/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { hasScope } from './api-keys.js';
import { invalidatePlaybookBindingsCache } from '../services/playbooks/playbookEnforcement.js';
import {
  wizardDiscoveryService,
  sopImportService,
  chatDiscoveryService,
  playbookComposer,
  playbookActivationService,
} from '../services/playbookDiscovery/index.js';

function resolveOrgId(req: FastifyRequest, reply: FastifyReply, requiredScope?: string): string | null {
  const { orgId } = req.params as { orgId: string };
  const apiKeyAuth = (req as any).apiKeyAuth as { orgId: string; scopes: string[] } | undefined;
  if (apiKeyAuth) {
    if (orgId !== apiKeyAuth.orgId) {
      reply.code(403).send({ error: 'API key does not belong to this organization' });
      return null;
    }
    if (requiredScope && !hasScope(apiKeyAuth.scopes, requiredScope)) {
      reply.code(403).send({ error: `API key missing required scope: ${requiredScope}` });
      return null;
    }
  }
  return orgId;
}

export default async function playbookRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/orgs/:orgId/playbooks', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const q = req.query as { outcomeTypeId?: string; status?: string };
    const conditions = [eq(outcomePlaybooks.orgId, orgId)];
    if (q.outcomeTypeId) conditions.push(eq(outcomePlaybooks.outcomeTypeId, q.outcomeTypeId));
    if (q.status) conditions.push(eq(outcomePlaybooks.status, q.status));
    const rows = await db
      .select({
        playbook: outcomePlaybooks,
        outcomeTypeName: outcomeTypes.name,
      })
      .from(outcomePlaybooks)
      .leftJoin(outcomeTypes, eq(outcomePlaybooks.outcomeTypeId, outcomeTypes.id))
      .where(and(...conditions))
      .orderBy(desc(outcomePlaybooks.version));
    return reply.send({ playbooks: rows.map(r => ({ ...r.playbook, outcomeTypeName: r.outcomeTypeName })) });
  });

  fastify.get('/orgs/:orgId/playbooks/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const [result] = await db
      .select({
        playbook: outcomePlaybooks,
        outcomeTypeName: outcomeTypes.name,
      })
      .from(outcomePlaybooks)
      .leftJoin(outcomeTypes, eq(outcomePlaybooks.outcomeTypeId, outcomeTypes.id))
      .where(and(eq(outcomePlaybooks.id, id), eq(outcomePlaybooks.orgId, orgId)))
      .limit(1);
    if (!result) return reply.code(404).send({ error: 'Playbook not found' });
    const bindings = await db.select().from(playbookSystemBindings).where(eq(playbookSystemBindings.playbookId, id));
    const documents = await db.select().from(playbookDocumentRequirements).where(eq(playbookDocumentRequirements.playbookId, id));
    return reply.send({ ...result.playbook, outcomeTypeName: result.outcomeTypeName, bindings, documents });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Direct create — top-level "make a playbook" with auto-outcome-type.
  //
  // The wizard / chat / SOP routes below are for AI-assisted discovery flows.
  // This route is the simple "I have a form, save it" path that the new
  // top-level Playbooks UI uses. Auto-creates an outcome_type behind the
  // scenes so users don't have to think about that abstraction.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.post('/orgs/:orgId/playbooks', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;

    const body = req.body as {
      name: string;
      summary?: string;
      status?: 'draft' | 'active';
      // If outcomeTypeId is provided we attach to that type. Otherwise we
      // auto-create one with the same name as the playbook.
      outcomeTypeId?: string;
      approvalChainId?: string;
      procedureSteps?: Array<{
        sequence: number;
        title: string;
        description?: string;
        requiresApproval?: boolean;
        approvalChainId?: string;
      }>;
      systemBindings?: Array<{
        role: string;
        connectorInstanceId: string;
        config?: Record<string, unknown>;
      }>;
      documentRequirements?: Array<{
        documentTemplateId: string;
        required?: boolean;
      }>;
      guidelines?: Record<string, unknown>;
      createdBy?: string;
    };

    if (!body?.name?.trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }

    // 1. Resolve / create the outcome type
    let outcomeTypeId = body.outcomeTypeId;
    let outcomeTypeAutoCreated = false;
    if (!outcomeTypeId) {
      const [created] = await db.insert(outcomeTypes).values({
        orgId,
        name: body.name.trim(),
        description: body.summary || `Outcome type for playbook "${body.name.trim()}"`,
        category: 'operational',
      } as any).returning();
      if (!created) {
        return reply.code(500).send({ error: 'Failed to auto-create outcome type' });
      }
      outcomeTypeId = created.id;
      outcomeTypeAutoCreated = true;
    } else {
      // Verify the outcome type exists and belongs to this org
      const [existing] = await db.select().from(outcomeTypes)
        .where(and(eq(outcomeTypes.id, outcomeTypeId), eq(outcomeTypes.orgId, orgId)))
        .limit(1);
      if (!existing) {
        return reply.code(404).send({ error: 'outcomeTypeId not found in this org' });
      }
    }

    // 2. Compute next version (1 for fresh outcome types)
    const existingVersions = await db.select({ version: outcomePlaybooks.version })
      .from(outcomePlaybooks)
      .where(and(eq(outcomePlaybooks.orgId, orgId), eq(outcomePlaybooks.outcomeTypeId, outcomeTypeId)));
    const nextVersion = existingVersions.reduce((m, r) => Math.max(m, r.version ?? 0), 0) + 1;

    // 3. Insert the playbook
    const status = body.status || 'active';
    const procedureSteps = (body.procedureSteps || []).map((s, i) => ({
      id: `step-${s.sequence ?? i + 1}`,
      sequence: s.sequence ?? i + 1,
      title: s.title,
      description: s.description,
      requiresApproval: s.requiresApproval ?? false,
      approvalChainId: s.approvalChainId || undefined,
    }));

    const [playbook] = await db.insert(outcomePlaybooks).values({
      orgId,
      outcomeTypeId,
      version: nextVersion,
      status,
      name: body.name.trim(),
      summary: body.summary,
      source: 'wizard',
      procedureSteps,
      approvalChainId: body.approvalChainId || null,
      guidelines: body.guidelines || {},
      createdBy: body.createdBy,
      activatedAt: status === 'active' ? new Date() : null,
    } as any).returning();

    if (!playbook) {
      return reply.code(500).send({ error: 'Failed to insert playbook' });
    }

    // 4. If activating, archive any other active playbooks for this outcome type
    if (status === 'active') {
      await db.update(outcomePlaybooks).set({
        status: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
      } as any).where(and(
        eq(outcomePlaybooks.orgId, orgId),
        eq(outcomePlaybooks.outcomeTypeId, outcomeTypeId),
        eq(outcomePlaybooks.status, 'active'),
      ));
      // Re-set this one to active (the bulk update above caught it too)
      await db.update(outcomePlaybooks).set({
        status: 'active',
        activatedAt: new Date(),
        archivedAt: null,
        updatedAt: new Date(),
      } as any).where(eq(outcomePlaybooks.id, playbook.id));

      // Stamp the outcome type's defaultPlaybookId so the orchestrator and
      // the connector enforcement gate find this playbook on the standard
      // fallback path (instance.activePlaybookId → outcomeType.defaultPlaybookId).
      await db.update(outcomeTypes).set({
        defaultPlaybookId: playbook.id,
        updatedAt: new Date(),
      } as any).where(eq(outcomeTypes.id, outcomeTypeId));
    }

    // 5. Insert system bindings
    for (const b of body.systemBindings || []) {
      if (!b.connectorInstanceId) continue;
      await db.insert(playbookSystemBindings).values({
        orgId,
        playbookId: playbook.id,
        role: b.role as any,
        connectorInstanceId: b.connectorInstanceId,
        config: b.config || {},
      } as any);
    }

    // 6. Insert document requirements
    for (const d of body.documentRequirements || []) {
      if (!d.documentTemplateId) continue;
      await db.insert(playbookDocumentRequirements).values({
        orgId,
        playbookId: playbook.id,
        documentTemplateId: d.documentTemplateId,
        required: d.required ?? true,
      } as any);
    }

    invalidatePlaybookBindingsCache(playbook.id);

    return reply.code(201).send({
      ...playbook,
      outcomeTypeId,
      outcomeTypeAutoCreated,
      bindingsCount: (body.systemBindings || []).length,
      documentsCount: (body.documentRequirements || []).length,
    });
  });

  // Edit a playbook's basic fields + replace its bindings and document
  // requirements. Replace-on-edit is simpler than diff-on-edit and matches
  // how the form is structured.
  fastify.put('/orgs/:orgId/playbooks/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      summary?: string;
      status?: 'draft' | 'active' | 'archived';
      approvalChainId?: string | null;
      procedureSteps?: Array<{ sequence: number; title: string; description?: string; requiresApproval?: boolean; approvalChainId?: string }>;
      systemBindings?: Array<{ role: string; connectorInstanceId: string; config?: Record<string, unknown> }>;
      documentRequirements?: Array<{ documentTemplateId: string; required?: boolean }>;
      guidelines?: Record<string, unknown>;
    };

    const [existing] = await db.select().from(outcomePlaybooks)
      .where(and(eq(outcomePlaybooks.id, id), eq(outcomePlaybooks.orgId, orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Playbook not found' });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name != null) updates.name = body.name.trim();
    if (body.summary != null) updates.summary = body.summary;
    if (body.guidelines != null) updates.guidelines = body.guidelines;
    if (body.approvalChainId !== undefined) updates.approvalChainId = body.approvalChainId || null;
    if (body.procedureSteps != null) {
      updates.procedureSteps = body.procedureSteps.map((s, i) => ({
        id: `step-${s.sequence ?? i + 1}`,
        sequence: s.sequence ?? i + 1,
        title: s.title,
        description: s.description,
        requiresApproval: s.requiresApproval ?? false,
        approvalChainId: s.approvalChainId || undefined,
      }));
    }

    if (body.status && body.status !== existing.status) {
      updates.status = body.status;
      if (body.status === 'active') {
        updates.activatedAt = new Date();
        // Archive other actives for the same outcome type
        await db.update(outcomePlaybooks).set({
          status: 'archived',
          archivedAt: new Date(),
          updatedAt: new Date(),
        } as any).where(and(
          eq(outcomePlaybooks.orgId, orgId),
          eq(outcomePlaybooks.outcomeTypeId, existing.outcomeTypeId),
          eq(outcomePlaybooks.status, 'active'),
        ));
        // Stamp the outcome type's defaultPlaybookId
        await db.update(outcomeTypes).set({
          defaultPlaybookId: id,
          updatedAt: new Date(),
        } as any).where(eq(outcomeTypes.id, existing.outcomeTypeId));
      } else if (body.status === 'archived') {
        updates.archivedAt = new Date();
      }
    }

    await db.update(outcomePlaybooks).set(updates as any)
      .where(eq(outcomePlaybooks.id, id));

    // Replace bindings
    if (body.systemBindings != null) {
      await db.delete(playbookSystemBindings).where(eq(playbookSystemBindings.playbookId, id));
      for (const b of body.systemBindings) {
        if (!b.connectorInstanceId) continue;
        await db.insert(playbookSystemBindings).values({
          orgId,
          playbookId: id,
          role: b.role as any,
          connectorInstanceId: b.connectorInstanceId,
          config: b.config || {},
        } as any);
      }
    }

    // Replace document requirements
    if (body.documentRequirements != null) {
      await db.delete(playbookDocumentRequirements).where(eq(playbookDocumentRequirements.playbookId, id));
      for (const d of body.documentRequirements) {
        if (!d.documentTemplateId) continue;
        await db.insert(playbookDocumentRequirements).values({
          orgId,
          playbookId: id,
          documentTemplateId: d.documentTemplateId,
          required: d.required ?? true,
        } as any);
      }
    }

    invalidatePlaybookBindingsCache(id);

    const [refreshed] = await db.select().from(outcomePlaybooks)
      .where(eq(outcomePlaybooks.id, id))
      .limit(1);
    return reply.send(refreshed);
  });

  fastify.delete('/orgs/:orgId/playbooks/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const result = await db.delete(outcomePlaybooks)
      .where(and(eq(outcomePlaybooks.id, id), eq(outcomePlaybooks.orgId, orgId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Playbook not found' });
    invalidatePlaybookBindingsCache(id);
    return reply.code(204).send();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Minimal pickers used by the playbook editor UI. These are not full CRUD
  // endpoints — just enough for the form to populate dropdowns. Full
  // connector / document template management lives elsewhere.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.get('/orgs/:orgId/connector-instances', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const rows = await db.select().from(connectorInstances)
      .where(eq(connectorInstances.orgId, orgId));
    return reply.send({ items: rows });
  });

  fastify.get('/orgs/:orgId/document-templates', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const rows = await db.select().from(documentTemplates)
      .where(eq(documentTemplates.orgId, orgId));
    return reply.send({ items: rows });
  });

  fastify.post('/orgs/:orgId/playbooks/draft/wizard', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    try {
      const draft = wizardDiscoveryService.buildDraft({ ...(req.body as object), orgId });
      const result = await playbookComposer.compose(draft);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message ?? 'Invalid wizard payload' });
    }
  });

  fastify.post('/orgs/:orgId/playbooks/draft/sop', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const body = req.body as {
      outcomeTypeId: string;
      outcomeTypeName: string;
      fileName: string;
      extractedText: string;
      rawBase64?: string;
      createdBy?: string;
    };
    if (!body?.outcomeTypeId || !body?.extractedText) {
      return reply.code(400).send({ error: 'outcomeTypeId and extractedText are required' });
    }
    const draft = await sopImportService.buildDraft({ ...body, orgId });
    const result = await playbookComposer.compose(draft);
    return reply.send(result);
  });

  fastify.post('/orgs/:orgId/playbooks/draft/chat', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const body = req.body as {
      outcomeTypeId: string;
      outcomeTypeName: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      userMessage: string;
      createdBy?: string;
    };
    const turn = await chatDiscoveryService.turn({ ...body, orgId });
    let composed: { playbookId: string; unresolved: string[] } | null = null;
    if (turn.draft) {
      composed = await playbookComposer.compose(turn.draft);
    }
    return reply.send({ reply: turn.reply, draft: composed });
  });

  fastify.post('/orgs/:orgId/playbooks/:id/activate', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(outcomePlaybooks)
      .where(and(eq(outcomePlaybooks.id, id), eq(outcomePlaybooks.orgId, orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'Playbook not found' });
    await playbookActivationService.activate(id);
    return reply.send({ ok: true });
  });

  fastify.post('/orgs/:orgId/playbooks/:id/archive', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(outcomePlaybooks)
      .where(and(eq(outcomePlaybooks.id, id), eq(outcomePlaybooks.orgId, orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'Playbook not found' });
    await playbookActivationService.archive(id);
    return reply.send({ ok: true });
  });
}
