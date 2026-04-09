/**
 * Teams CRUD routes
 *
 * - GET    /orgs/:orgId/teams
 * - GET    /orgs/:orgId/teams/:id
 * - POST   /orgs/:orgId/teams
 * - PUT    /orgs/:orgId/teams/:id
 * - DELETE /orgs/:orgId/teams/:id
 * - POST   /orgs/:orgId/teams/:id/members
 * - DELETE /orgs/:orgId/teams/:id/members/:memberId
 * - PATCH  /orgs/:orgId/teams/:id/members/:memberId
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { teams, teamMembers, members } from '@lamdis/db/schema';
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

export default async function teamRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // List all teams with member counts
  fastify.get('/orgs/:orgId/teams', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.view');
    if (!orgId) return;

    const rows = await db.select().from(teams)
      .where(eq(teams.orgId, orgId))
      .orderBy(desc(teams.createdAt));

    // Get member counts + member details per team
    const teamIds = rows.map(r => r.id);
    let memberMap = new Map<string, Array<{ memberId: string; email: string | null; role: string | null }>>();
    if (teamIds.length > 0) {
      const tmRows = await db.select({
        teamId: teamMembers.teamId,
        memberId: teamMembers.memberId,
        role: teamMembers.role,
        email: members.email,
      })
        .from(teamMembers)
        .leftJoin(members, eq(teamMembers.memberId, members.id))
        .where(inArray(teamMembers.teamId, teamIds));
      for (const r of tmRows) {
        const list = memberMap.get(r.teamId) || [];
        list.push({ memberId: r.memberId, email: r.email, role: r.role });
        memberMap.set(r.teamId, list);
      }
    }

    const items = rows.map(r => ({
      ...r,
      memberCount: memberMap.get(r.id)?.length || 0,
      members: memberMap.get(r.id) || [],
    }));

    return reply.send({ items });
  });

  // Get single team with full members
  fastify.get('/orgs/:orgId/teams/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.view');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const [row] = await db.select().from(teams)
      .where(and(eq(teams.id, id), eq(teams.orgId, orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'Team not found' });

    const tmRows = await db.select({
      id: teamMembers.id,
      memberId: teamMembers.memberId,
      role: teamMembers.role,
      email: members.email,
      memberRole: members.role,
      status: members.status,
      createdAt: teamMembers.createdAt,
    })
      .from(teamMembers)
      .leftJoin(members, eq(teamMembers.memberId, members.id))
      .where(eq(teamMembers.teamId, id));

    return reply.send({ ...row, members: tmRows });
  });

  // Create team
  fastify.post('/orgs/:orgId/teams', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.invite');
    if (!orgId) return;
    const body = req.body as {
      name: string;
      description?: string;
      color?: string;
      memberIds?: Array<{ memberId: string; role?: string }>;
      createdBy?: string;
    };
    if (!body?.name?.trim()) return reply.code(400).send({ error: 'name is required' });

    try {
      const [created] = await db.insert(teams).values({
        orgId,
        name: body.name.trim(),
        description: body.description || null,
        color: body.color || '#8b5cf6',
        createdBy: body.createdBy || null,
      } as any).returning();

      // Add initial members if provided
      if (body.memberIds?.length) {
        for (const m of body.memberIds) {
          await db.insert(teamMembers).values({
            orgId,
            teamId: created.id,
            memberId: m.memberId,
            role: m.role || 'member',
          } as any);
        }
      }

      return reply.code(201).send(created);
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.code(409).send({ error: `Team "${body.name}" already exists` });
      }
      throw err;
    }
  });

  // Update team
  fastify.put('/orgs/:orgId/teams/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.invite');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; description?: string; color?: string };

    const [existing] = await db.select().from(teams)
      .where(and(eq(teams.id, id), eq(teams.orgId, orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Team not found' });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name != null) updates.name = body.name.trim();
    if (body.description != null) updates.description = body.description;
    if (body.color != null) updates.color = body.color;

    try {
      await db.update(teams).set(updates as any).where(eq(teams.id, id));
    } catch (err: any) {
      if (err?.code === '23505') return reply.code(409).send({ error: 'Team name already exists' });
      throw err;
    }

    const [refreshed] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return reply.send(refreshed);
  });

  // Delete team
  fastify.delete('/orgs/:orgId/teams/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.remove');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const result = await db.delete(teams)
      .where(and(eq(teams.id, id), eq(teams.orgId, orgId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Team not found' });
    return reply.code(204).send();
  });

  // Add member to team
  fastify.post('/orgs/:orgId/teams/:id/members', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.invite');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const body = req.body as { memberId: string; role?: string };
    if (!body?.memberId) return reply.code(400).send({ error: 'memberId is required' });

    try {
      const [created] = await db.insert(teamMembers).values({
        orgId,
        teamId: id,
        memberId: body.memberId,
        role: body.role || 'member',
      } as any).returning();
      return reply.code(201).send(created);
    } catch (err: any) {
      if (err?.code === '23505') return reply.code(409).send({ error: 'Member is already on this team' });
      throw err;
    }
  });

  // Remove member from team
  fastify.delete('/orgs/:orgId/teams/:id/members/:memberId', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.remove');
    if (!orgId) return;
    const { id, memberId } = req.params as { id: string; memberId: string };
    const result = await db.delete(teamMembers)
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.memberId, memberId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Team member not found' });
    return reply.code(204).send();
  });

  // Update member role in team
  fastify.patch('/orgs/:orgId/teams/:id/members/:memberId', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'member.role.change');
    if (!orgId) return;
    const { id, memberId } = req.params as { id: string; memberId: string };
    const body = req.body as { role: string };
    if (!body?.role) return reply.code(400).send({ error: 'role is required' });

    const result = await db.update(teamMembers)
      .set({ role: body.role } as any)
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.memberId, memberId)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Team member not found' });
    return reply.send(result[0]);
  });
}
