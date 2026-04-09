import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, ne, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { userProfiles } from '@lamdis/db/schema';
import { createAuditLog, buildAuditContextFromRequest } from '../services/auditService.js';

interface UpdateProfileBody {
  displayName?: string;
  employeeUuid?: string;
  avatarUrl?: string;
  preferences?: {
    timezone?: string;
    dateFormat?: string;
    theme?: 'dark' | 'light' | 'system';
    emailNotifications?: boolean;
  };
}

const userProfileRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user's profile
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userSub = (request as any).user?.sub;
    const email = (request as any).user?.email;

    if (!userSub) {
      return reply.status(401).send({ error: 'User not authenticated' });
    }

    // Find or create profile
    let [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userSub, userSub)).limit(1);

    if (!profile) {
      // Auto-create profile on first access
      const [created] = await db.insert(userProfiles).values({
        userSub,
        email,
      }).returning();
      profile = created;
    } else if (email && profile.email !== email) {
      // Update email if changed in Auth0
      await db.update(userProfiles).set({ email, updatedAt: new Date() }).where(eq(userProfiles.id, profile.id));
      profile = { ...profile, email };
    }

    return {
      _id: profile.id,
      userSub: profile.userSub,
      email: profile.email,
      displayName: profile.displayName,
      employeeUuid: profile.employeeUuid,
      avatarUrl: profile.avatarUrl,
      preferences: profile.preferences,
      name: profile.displayName || email?.split('@')[0] || 'Unknown User',
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  });

  // Update current user's profile
  fastify.put('/me', async (request: FastifyRequest<{ Body: UpdateProfileBody }>, reply: FastifyReply) => {
    const userSub = (request as any).user?.sub;
    const email = (request as any).user?.email;
    const orgId = (request as any).orgId || 'global';

    if (!userSub) {
      return reply.status(401).send({ error: 'User not authenticated' });
    }

    const body = request.body || {};
    const updates: any = {};
    const changes: string[] = [];

    // Find existing profile
    let [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userSub, userSub)).limit(1);
    const previousValues: any = {};

    if (!profile) {
      // Create new profile
      const [created] = await db.insert(userProfiles).values({
        userSub,
        email,
      }).returning();
      profile = created;
    }

    // Track changes for audit log
    if (body.displayName !== undefined && body.displayName !== profile.displayName) {
      previousValues.displayName = profile.displayName;
      updates.displayName = body.displayName.trim() || null;
      changes.push(`displayName: "${profile.displayName || ''}" → "${updates.displayName || ''}"`);
    }

    if (body.employeeUuid !== undefined && body.employeeUuid !== profile.employeeUuid) {
      // Validate uniqueness of employeeUuid
      if (body.employeeUuid) {
        const [existing] = await db.select().from(userProfiles).where(
          and(
            eq(userProfiles.employeeUuid, body.employeeUuid),
            ne(userProfiles.userSub, userSub)
          )
        ).limit(1);
        if (existing) {
          return reply.status(409).send({
            error: 'Employee UUID already in use',
            field: 'employeeUuid'
          });
        }
      }
      previousValues.employeeUuid = profile.employeeUuid;
      updates.employeeUuid = body.employeeUuid?.trim() || null;
      changes.push(`employeeUuid: "${profile.employeeUuid || ''}" → "${updates.employeeUuid || ''}"`);
    }

    if (body.avatarUrl !== undefined) {
      updates.avatarUrl = body.avatarUrl;
    }

    if (body.preferences) {
      updates.preferences = {
        ...((profile.preferences as any) || {}),
        ...body.preferences,
      };
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      const [updated] = await db.update(userProfiles).set(updates).where(eq(userProfiles.id, profile.id)).returning();
      profile = updated;
    }

    // Log audit event if name or employeeUuid changed
    if (changes.length > 0) {
      await createAuditLog(
        buildAuditContextFromRequest(request, orgId),
        'user_profile.updated',
        {
          category: 'user',
          severity: 'info',
          resource: {
            type: 'user_profile',
            id: profile.id,
            name: profile.displayName || email,
          },
          before: previousValues,
          after: {
            displayName: profile.displayName,
            employeeUuid: profile.employeeUuid,
          },
          details: {
            changes,
          },
        }
      );
    }

    return {
      _id: profile.id,
      userSub: profile.userSub,
      email: profile.email,
      displayName: profile.displayName,
      employeeUuid: profile.employeeUuid,
      avatarUrl: profile.avatarUrl,
      preferences: profile.preferences,
      name: profile.displayName || email?.split('@')[0] || 'Unknown User',
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  });

  // Get profile by userSub (for internal lookups by other services)
  fastify.get('/lookup/:userSub', async (request: FastifyRequest<{ Params: { userSub: string } }>, reply: FastifyReply) => {
    const { userSub } = request.params;

    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userSub, userSub)).limit(1);

    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    return {
      _id: profile.id,
      userSub: profile.userSub,
      email: profile.email,
      displayName: profile.displayName,
      employeeUuid: profile.employeeUuid,
      name: profile.displayName || profile.email?.split('@')[0] || 'Unknown User',
    };
  });

  // Batch lookup profiles by userSubs
  fastify.post('/lookup-batch', async (request: FastifyRequest<{ Body: { userSubs: string[] } }>, reply: FastifyReply) => {
    const { userSubs } = request.body || { userSubs: [] };

    if (!Array.isArray(userSubs) || userSubs.length === 0) {
      return { profiles: {} };
    }

    const profiles = await db.select().from(userProfiles).where(
      inArray(userProfiles.userSub, userSubs.slice(0, 100)) // Limit to 100
    );

    const profileMap: Record<string, any> = {};
    for (const profile of profiles) {
      profileMap[profile.userSub] = {
        displayName: profile.displayName,
        email: profile.email,
        employeeUuid: profile.employeeUuid,
        name: profile.displayName || profile.email?.split('@')[0] || 'Unknown User',
      };
    }

    return { profiles: profileMap };
  });
};

export default userProfileRoutes;
