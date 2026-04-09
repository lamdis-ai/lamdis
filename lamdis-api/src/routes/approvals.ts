/**
 * Approval Chain & Approver Role CRUD routes
 *
 * - GET    /orgs/:orgId/approval-chains
 * - GET    /orgs/:orgId/approval-chains/:id
 * - POST   /orgs/:orgId/approval-chains
 * - PUT    /orgs/:orgId/approval-chains/:id
 * - DELETE /orgs/:orgId/approval-chains/:id
 * - GET    /orgs/:orgId/approver-roles
 * - GET    /orgs/:orgId/approver-roles/:id
 * - POST   /orgs/:orgId/approver-roles
 * - PUT    /orgs/:orgId/approver-roles/:id
 * - DELETE /orgs/:orgId/approver-roles/:id
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import {
  approvalChains,
  approverRoles,
  outcomePlaybooks,
  type ApprovalChainStep,
  type ApproverMember,
} from '@lamdis/db/schema';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { hasScope } from './api-keys.js';

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

export default async function approvalRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // ─── Approval Chains ─────────────────────────────────────────────────

  fastify.get('/orgs/:orgId/approval-chains', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const rows = await db
      .select()
      .from(approvalChains)
      .where(eq(approvalChains.orgId, orgId))
      .orderBy(desc(approvalChains.createdAt));

    // Resolve role display names for each chain's steps
    const allRoleIds = new Set<string>();
    for (const row of rows) {
      for (const step of (row.steps || []) as ApprovalChainStep[]) {
        allRoleIds.add(step.roleId);
        if (step.fallbackRoleId) allRoleIds.add(step.fallbackRoleId);
      }
    }
    const roleMap = new Map<string, string>();
    if (allRoleIds.size > 0) {
      const roles = await db.select({ id: approverRoles.id, displayName: approverRoles.displayName })
        .from(approverRoles)
        .where(inArray(approverRoles.id, [...allRoleIds]));
      for (const r of roles) roleMap.set(r.id, r.displayName);
    }

    const items = rows.map(row => ({
      ...row,
      stepsExpanded: ((row.steps || []) as ApprovalChainStep[]).map(s => ({
        ...s,
        roleName: roleMap.get(s.roleId) || s.roleId,
        fallbackRoleName: s.fallbackRoleId ? (roleMap.get(s.fallbackRoleId) || s.fallbackRoleId) : undefined,
      })),
    }));
    return reply.send({ items });
  });

  fastify.get('/orgs/:orgId/approval-chains/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(approvalChains)
      .where(and(eq(approvalChains.id, id), eq(approvalChains.orgId, orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'Approval chain not found' });

    // Resolve role display names
    const steps = (row.steps || []) as ApprovalChainStep[];
    const roleIds = new Set<string>();
    for (const s of steps) {
      roleIds.add(s.roleId);
      if (s.fallbackRoleId) roleIds.add(s.fallbackRoleId);
    }
    const roleMap = new Map<string, { displayName: string; members: ApproverMember[] }>();
    if (roleIds.size > 0) {
      const roles = await db.select()
        .from(approverRoles)
        .where(inArray(approverRoles.id, [...roleIds]));
      for (const r of roles) roleMap.set(r.id, { displayName: r.displayName, members: (r.members || []) as ApproverMember[] });
    }

    return reply.send({
      ...row,
      stepsExpanded: steps.map(s => ({
        ...s,
        roleName: roleMap.get(s.roleId)?.displayName || s.roleId,
        roleMembers: roleMap.get(s.roleId)?.members || [],
        fallbackRoleName: s.fallbackRoleId ? (roleMap.get(s.fallbackRoleId)?.displayName || s.fallbackRoleId) : undefined,
      })),
    });
  });

  fastify.post('/orgs/:orgId/approval-chains', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const body = req.body as {
      name: string;
      description?: string;
      steps?: ApprovalChainStep[];
      createdBy?: string;
    };
    if (!body?.name?.trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }
    const [created] = await db.insert(approvalChains).values({
      orgId,
      name: body.name.trim(),
      description: body.description || null,
      steps: body.steps || [],
      createdBy: body.createdBy || null,
    } as any).returning();
    return reply.code(201).send(created);
  });

  fastify.put('/orgs/:orgId/approval-chains/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      description?: string;
      steps?: ApprovalChainStep[];
    };

    const [existing] = await db.select().from(approvalChains)
      .where(and(eq(approvalChains.id, id), eq(approvalChains.orgId, orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Approval chain not found' });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name != null) updates.name = body.name.trim();
    if (body.description != null) updates.description = body.description;
    if (body.steps != null) updates.steps = body.steps;

    await db.update(approvalChains).set(updates as any).where(eq(approvalChains.id, id));
    const [refreshed] = await db.select().from(approvalChains).where(eq(approvalChains.id, id)).limit(1);
    return reply.send(refreshed);
  });

  fastify.delete('/orgs/:orgId/approval-chains/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    // Check if any playbook references this chain
    const refs = await db.select({ id: outcomePlaybooks.id })
      .from(outcomePlaybooks)
      .where(and(eq(outcomePlaybooks.orgId, orgId), eq(outcomePlaybooks.approvalChainId, id)))
      .limit(1);
    if (refs.length > 0) {
      return reply.code(409).send({ error: 'Cannot delete: approval chain is referenced by one or more playbooks' });
    }

    const result = await db.delete(approvalChains)
      .where(and(eq(approvalChains.id, id), eq(approvalChains.orgId, orgId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Approval chain not found' });
    return reply.code(204).send();
  });

  // ─── Approver Roles ──────────────────────────────────────────────────

  fastify.get('/orgs/:orgId/approver-roles', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const rows = await db
      .select()
      .from(approverRoles)
      .where(eq(approverRoles.orgId, orgId))
      .orderBy(desc(approverRoles.createdAt));
    return reply.send({ items: rows });
  });

  fastify.get('/orgs/:orgId/approver-roles/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(approverRoles)
      .where(and(eq(approverRoles.id, id), eq(approverRoles.orgId, orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'Approver role not found' });
    return reply.send(row);
  });

  fastify.post('/orgs/:orgId/approver-roles', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const body = req.body as {
      key: string;
      displayName: string;
      description?: string;
      members?: ApproverMember[];
      fallbackRoleId?: string;
      sourceBindingId?: string;
    };
    if (!body?.key?.trim() || !body?.displayName?.trim()) {
      return reply.code(400).send({ error: 'key and displayName are required' });
    }
    try {
      const [created] = await db.insert(approverRoles).values({
        orgId,
        key: body.key.trim(),
        displayName: body.displayName.trim(),
        description: body.description || null,
        members: body.members || [],
        fallbackRoleId: body.fallbackRoleId || null,
        sourceBindingId: body.sourceBindingId || null,
      } as any).returning();
      return reply.code(201).send(created);
    } catch (err: any) {
      if (err?.code === '23505') { // unique violation
        return reply.code(409).send({ error: `Approver role with key "${body.key}" already exists in this org` });
      }
      throw err;
    }
  });

  fastify.put('/orgs/:orgId/approver-roles/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const body = req.body as {
      key?: string;
      displayName?: string;
      description?: string;
      members?: ApproverMember[];
      fallbackRoleId?: string;
      sourceBindingId?: string;
    };

    const [existing] = await db.select().from(approverRoles)
      .where(and(eq(approverRoles.id, id), eq(approverRoles.orgId, orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Approver role not found' });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.key != null) updates.key = body.key.trim();
    if (body.displayName != null) updates.displayName = body.displayName.trim();
    if (body.description != null) updates.description = body.description;
    if (body.members != null) updates.members = body.members;
    if (body.fallbackRoleId !== undefined) updates.fallbackRoleId = body.fallbackRoleId || null;
    if (body.sourceBindingId !== undefined) updates.sourceBindingId = body.sourceBindingId || null;

    try {
      await db.update(approverRoles).set(updates as any).where(eq(approverRoles.id, id));
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.code(409).send({ error: `Approver role with that key already exists in this org` });
      }
      throw err;
    }
    const [refreshed] = await db.select().from(approverRoles).where(eq(approverRoles.id, id)).limit(1);
    return reply.send(refreshed);
  });

  fastify.delete('/orgs/:orgId/approver-roles/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    // Check if any chain references this role
    const allChains = await db.select({ id: approvalChains.id, steps: approvalChains.steps })
      .from(approvalChains)
      .where(eq(approvalChains.orgId, orgId));
    for (const chain of allChains) {
      for (const step of (chain.steps || []) as ApprovalChainStep[]) {
        if (step.roleId === id || step.fallbackRoleId === id) {
          return reply.code(409).send({ error: 'Cannot delete: approver role is referenced by one or more approval chains' });
        }
      }
    }

    const result = await db.delete(approverRoles)
      .where(and(eq(approverRoles.id, id), eq(approverRoles.orgId, orgId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Approver role not found' });
    return reply.code(204).send();
  });
}
