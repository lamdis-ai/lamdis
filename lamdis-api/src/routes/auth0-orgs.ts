/**
 * Auth0 Organizations Routes
 *
 * API routes for managing Auth0 Organizations, invitations, and join codes.
 */
import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations, members } from '@lamdis/db/schema';
import { createOrganization, listUserAuth0Orgs, deleteOrganization } from '../services/auth0-org.js';
import {
  inviteByEmail,
  createJoinCode,
  lookupJoinCode,
  markJoinCodeUsed,
  listJoinCodes,
  deleteJoinCode,
  listPendingInvitations,
  deleteInvitation,
} from '../services/auth0-invite.js';
import { isAuth0MgmtConfigured } from '../lib/auth0-mgmt.js';

const routes: FastifyPluginAsync = async (app) => {

  // =============================================
  // Organization Creation & Management
  // =============================================

  /**
   * POST /auth0-orgs/create
   * Create a new Auth0 Organization
   */
  app.post('/create', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    if (!isAuth0MgmtConfigured()) {
      return reply.code(503).send({ error: 'Auth0 Organizations not configured' });
    }

    const { name } = (req.body || {}) as { name?: string };
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return reply.code(400).send({ error: 'Organization name required (min 2 characters)' });
    }

    // Users can belong to multiple organizations - no check needed

    try {
      const result = await createOrganization({
        displayName: name.trim(),
        creatorUserId: user.sub,
        creatorEmail: user.email,
        inviteOnly: true,
      });

      return {
        success: true,
        auth0OrgId: result.auth0OrgId,
        orgId: result.localOrgId,
        org: result.org,
      };
    } catch (error: any) {
      console.error('Failed to create organization:', error);
      return reply.code(500).send({
        error: 'Failed to create organization',
        details: error.message,
      });
    }
  });

  /**
   * GET /auth0-orgs/my-orgs
   * List Auth0 organizations the current user belongs to
   */
  app.get('/my-orgs', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    if (!isAuth0MgmtConfigured()) {
      // Fallback to local orgs only
      const memberships = await db.select({
        member: members,
        org: organizations,
      }).from(members)
        .innerJoin(organizations, eq(members.orgId, organizations.id))
        .where(eq(members.userSub, user.sub));
      return {
        organizations: memberships.map((m) => ({
          id: m.org.auth0OrgId || null,
          name: m.org.auth0OrgName || null,
          display_name: m.org.name,
          localOrgId: m.org.id,
        })),
      };
    }

    try {
      const result = await listUserAuth0Orgs(user.sub);

      // Enrich with local org data
      const enriched = await Promise.all(
        result.organizations.map(async (org: any) => {
          const [local] = await db.select().from(organizations).where(eq(organizations.auth0OrgId, org.id)).limit(1);
          return {
            ...org,
            localOrgId: local?.id || null,
          };
        })
      );

      return { organizations: enriched };
    } catch (error: any) {
      console.error('Failed to list user orgs:', error);
      return reply.code(500).send({ error: 'Failed to list organizations' });
    }
  });

  // =============================================
  // Invitation Management (for org admins)
  // =============================================

  /**
   * POST /auth0-orgs/:orgId/invite
   * Invite a user by email (Auth0 sends the invitation email)
   */
  app.post('/:orgId/invite', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    const { orgId } = req.params as { orgId: string };

    // Check caller is admin/owner
    const [membership] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userSub, user.sub))).limit(1);
    if (!membership || membership.role === 'member') {
      return reply.code(403).send({ error: 'Only admins and owners can invite users' });
    }

    const { email, role } = (req.body || {}) as { email?: string; role?: string };
    if (!email || typeof email !== 'string') {
      return reply.code(400).send({ error: 'email required' });
    }

    // Validate role (only owners can invite as owner)
    let assignRole: 'member' | 'admin' | 'owner' = 'member';
    if (role === 'admin' || role === 'owner') {
      if (role === 'owner' && membership.role !== 'owner') {
        return reply.code(403).send({ error: 'Only owners can invite as owner' });
      }
      assignRole = role;
    }

    if (!isAuth0MgmtConfigured()) {
      return reply.code(503).send({ error: 'Auth0 Organizations not configured. Please contact support.' });
    }

    // Check if the org is linked to Auth0
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const auth0OrgId = org.auth0OrgId;
    if (!auth0OrgId) {
      return reply.code(400).send({
        error: 'Organization not properly configured',
        message: 'This organization is not linked to Auth0. Please contact support or recreate the organization.'
      });
    }

    try {
      const inviterName = user.name || user.email || 'Team Admin';

      const result = await inviteByEmail({
        orgId,
        inviteeEmail: email,
        inviterName,
        inviterSub: user.sub,
        localRole: assignRole,
      });

      return {
        success: true,
        invitationId: result.invitationId,
        memberId: result.memberId,
      };
    } catch (error: any) {
      console.error('Failed to send invitation:', error);
      return reply.code(500).send({ error: 'Failed to send invitation' });
    }
  });

  /**
   * GET /auth0-orgs/:orgId/invitations
   * List pending invitations for an organization
   */
  app.get('/:orgId/invitations', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    const { orgId } = req.params as { orgId: string };

    // Check caller is admin/owner
    const [membership] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userSub, user.sub))).limit(1);
    if (!membership || membership.role === 'member') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const invitations = await listPendingInvitations(orgId);
      return { invitations };
    } catch (error: any) {
      console.error('Failed to list invitations:', error);
      return reply.code(500).send({ error: 'Failed to list invitations' });
    }
  });

  /**
   * DELETE /auth0-orgs/:orgId/invitations/:invitationId
   * Revoke a pending invitation
   */
  app.delete('/:orgId/invitations/:invitationId', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    const { orgId, invitationId } = req.params as { orgId: string; invitationId: string };

    // Check caller is admin/owner
    const [membership] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userSub, user.sub))).limit(1);
    if (!membership || membership.role === 'member') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const deleted = await deleteInvitation(orgId, invitationId);
      return { success: deleted };
    } catch (error: any) {
      console.error('Failed to delete invitation:', error);
      return reply.code(500).send({ error: 'Failed to delete invitation' });
    }
  });

  // =============================================
  // Join Code Management
  // =============================================

  /**
   * POST /auth0-orgs/:orgId/join-codes
   * Create a new join code for the organization
   */
  app.post('/:orgId/join-codes', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    const { orgId } = req.params as { orgId: string };

    // Check caller is admin/owner
    const [membership] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userSub, user.sub))).limit(1);
    if (!membership || membership.role === 'member') {
      return reply.code(403).send({ error: 'Only admins and owners can create join codes' });
    }

    if (!isAuth0MgmtConfigured()) {
      return reply.code(503).send({ error: 'Auth0 Organizations not configured' });
    }

    const { expiresInDays, maxUses, role } = (req.body || {}) as {
      expiresInDays?: number;
      maxUses?: number;
      role?: 'member' | 'admin';
    };

    // Only owners can create codes that grant admin role
    if (role === 'admin' && membership.role !== 'owner') {
      return reply.code(403).send({ error: 'Only owners can create admin join codes' });
    }

    try {
      const creatorName = user.name || user.email || 'Team Admin';

      const result = await createJoinCode({
        orgId,
        creatorSub: user.sub,
        creatorName,
        expiresInDays,
        maxUses,
        role,
      });

      return {
        success: true,
        code: result.code,
        expiresAt: result.expiresAt,
      };
    } catch (error: any) {
      console.error('Failed to create join code:', error);
      return reply.code(500).send({ error: 'Failed to create join code' });
    }
  });

  /**
   * GET /auth0-orgs/:orgId/join-codes
   * List active join codes for the organization
   */
  app.get('/:orgId/join-codes', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    const { orgId } = req.params as { orgId: string };

    // Check caller is admin/owner
    const [membership] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userSub, user.sub))).limit(1);
    if (!membership || membership.role === 'member') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const codes = await listJoinCodes(orgId);
      return { codes };
    } catch (error: any) {
      console.error('Failed to list join codes:', error);
      return reply.code(500).send({ error: 'Failed to list join codes' });
    }
  });

  /**
   * DELETE /auth0-orgs/:orgId/join-codes/:code
   * Revoke a join code
   */
  app.delete('/:orgId/join-codes/:code', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    const { orgId, code } = req.params as { orgId: string; code: string };

    // Check caller is admin/owner
    const [membership] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userSub, user.sub))).limit(1);
    if (!membership || membership.role === 'member') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const deleted = await deleteJoinCode(code, orgId);
      return { success: deleted };
    } catch (error: any) {
      console.error('Failed to delete join code:', error);
      return reply.code(500).send({ error: 'Failed to delete join code' });
    }
  });

  // =============================================
  // Public Join Code Lookup (for users joining)
  // =============================================

  /**
   * GET /auth0-orgs/join/:code
   * Look up a join code to get org info and invitation details
   * (Public endpoint - no auth required)
   */
  app.get('/join/:code', { config: { public: true } }, async (req, reply) => {
    const { code } = req.params as { code: string };

    if (!code || code.length < 4) {
      return reply.code(400).send({ error: 'Invalid code' });
    }

    try {
      const result = await lookupJoinCode(code);

      if (!result) {
        return reply.code(404).send({ error: 'Invalid or expired join code' });
      }

      return {
        valid: true,
        orgName: result.orgName,
        auth0OrgId: result.auth0OrgId,
        invitationId: result.invitationId,
      };
    } catch (error: any) {
      console.error('Failed to lookup join code:', error);
      return reply.code(500).send({ error: 'Failed to lookup code' });
    }
  });

  /**
   * POST /auth0-orgs/join/:code/use
   * Mark a join code as used (called after successful org join)
   */
  app.post('/join/:code/use', async (req, reply) => {
    const user = (req as any).user;
    if (!user?.sub) return reply.code(401).send({ error: 'Not authenticated' });

    const { code } = req.params as { code: string };

    try {
      const joinCodeData = await lookupJoinCode(code);
      if (!joinCodeData) {
        return reply.code(404).send({ error: 'Invalid or expired join code' });
      }

      // Create local member record
      const [existingMember] = await db.select().from(members).where(
        and(eq(members.orgId, joinCodeData.orgId), eq(members.userSub, user.sub))
      ).limit(1);

      if (!existingMember) {
        await db.insert(members).values({
          orgId: joinCodeData.orgId,
          userSub: user.sub,
          email: user.email?.toLowerCase(),
          role: joinCodeData.role || 'member',
          status: 'active',
          acceptedAt: new Date(),
        });
      }

      await markJoinCodeUsed(code);

      return { success: true, orgId: joinCodeData.orgId };
    } catch (error: any) {
      console.error('Failed to use join code:', error);
      return reply.code(500).send({ error: 'Failed to complete join' });
    }
  });
};

export default routes;
