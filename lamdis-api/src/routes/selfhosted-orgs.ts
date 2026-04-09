import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { isSelfHosted } from '../lib/deploymentMode.js';
import { db } from '../db.js';
import { organizations } from '@lamdis/db/schema';
import {
  createOrganization,
  addMember,
  inviteMember,
  removeMember,
  listMembers,
} from '../services/local-org.js';

/**
 * Self-hosted organization management routes.
 * These replace Auth0 org management in self-hosted mode.
 * Registered only when LAMDIS_DEPLOYMENT_MODE=self_hosted.
 */
const routes: FastifyPluginAsync = async (app) => {
  if (!isSelfHosted()) return;

  /**
   * POST /selfhosted/orgs
   * Create a new organization. The authenticated user becomes admin.
   */
  app.post('/orgs', async (req, reply) => {
    const user = (req as any).user;
    const { name } = req.body as any;

    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    const { org, member } = await createOrganization(name, {
      sub: user.sub,
      email: user.email || user.sub,
    });

    return {
      org: { id: org.id, name: org.name },
      member: { id: member.id, role: member.role },
    };
  });

  /**
   * GET /selfhosted/orgs/:orgId/members
   * List members of an organization.
   */
  app.get('/orgs/:orgId/members', async (req, reply) => {
    const { orgId } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    const memberList = await listMembers(orgId);
    return { members: memberList };
  });

  /**
   * POST /selfhosted/orgs/:orgId/members/invite
   * Invite a new member by email.
   */
  app.post('/orgs/:orgId/members/invite', { preHandler: [(app as any).requireLimit('users')] }, async (req, reply) => {
    const { orgId } = req.params as any;
    const { email, role } = req.body as any;

    if (!email) {
      return reply.code(400).send({ error: 'email is required' });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    const result = await inviteMember(orgId, email, role);

    if (result.existing) {
      return reply.code(409).send({
        error: 'already_member',
        member: result.member,
      });
    }

    return { success: true, member: result.member };
  });

  /**
   * POST /selfhosted/orgs/:orgId/members/add
   * Directly add a member (for when you know their userSub from the IdP).
   */
  app.post('/orgs/:orgId/members/add', { preHandler: [(app as any).requireLimit('users')] }, async (req, reply) => {
    const { orgId } = req.params as any;
    const { userSub, email, role } = req.body as any;

    if (!userSub || !email) {
      return reply.code(400).send({ error: 'userSub and email are required' });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    const member = await addMember(orgId, userSub, email, role);
    return { success: true, member };
  });

  /**
   * DELETE /selfhosted/orgs/:orgId/members/:userSub
   * Remove a member from an organization.
   */
  app.delete('/orgs/:orgId/members/:userSub', async (req, reply) => {
    const { orgId, userSub } = req.params as any;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    const result = await removeMember(orgId, userSub);
    if (!result.deleted) {
      return reply.code(404).send({ error: 'Member not found' });
    }

    return { success: true };
  });
};

export default routes;
