/**
 * Role and Permission Management API Routes
 * 
 * Provides comprehensive RBAC management with:
 * - Role CRUD operations
 * - Permission management
 * - Member role assignment
 * - API key management
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  assignRole,
  removeRole,
  getMemberRoles,
  createApiKey,
  revokeApiKey,
  listApiKeys,
  getPermissionDefinitions,
  getDefaultRoles,
  checkPermission,
  getUserPermissions,
} from '../services/permissionService.js';
import { createAuditLog, AuditContext } from '../services/auditService.js';
import { Permission, PERMISSIONS, PERMISSION_CATEGORIES } from '../lib/permissions.js';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { members, apiKeys } from '@lamdis/db/schema';
import crypto from 'crypto';

const routes: FastifyPluginAsync = async (app) => {
  // Helper to build audit context from request
  const getAuditContext = (req: any, orgId: string): AuditContext => ({
    orgId,
    userSub: req.user?.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    source: 'api',
  });

  // ======== Permission Definitions ========
  
  // GET /orgs/:id/permissions - Get all permission definitions
  app.get('/:id/permissions', async (req, reply) => {
    const { id } = req.params as { id: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.view'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    const permissions = getPermissionDefinitions();
    const categories = PERMISSION_CATEGORIES;
    
    // Group permissions by category
    const grouped: Record<string, { permission: string; description: string }[]> = {};
    
    for (const [perm, info] of Object.entries(permissions)) {
      const cat = info.category;
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push({
        permission: perm,
        description: info.description,
      });
    }
    
    return {
      permissions: Object.entries(permissions).map(([key, info]) => ({
        key,
        ...info,
      })),
      categories: Object.entries(categories).map(([key, info]) => ({
        key,
        ...info,
        permissions: grouped[key] || [],
      })),
    };
  });

  // GET /orgs/:id/permissions/me - Get current user's permissions
  app.get('/:id/permissions/me', async (req, reply) => {
    const { id } = req.params as { id: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const result = await getUserPermissions({ userSub, orgId: id });
    
    return {
      permissions: Array.from(result.permissions),
      roles: result.roles,
    };
  });

  // ======== Roles ========
  
  // GET /orgs/:id/roles - List all roles
  app.get('/:id/roles', async (req, reply) => {
    const { id } = req.params as { id: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.view'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    const roles = await listRoles(id);
    
    return {
      roles: roles.map(r => ({
        id: String(r.id),
        name: r.name,
        slug: r.slug,
        description: r.description,
        isSystem: r.isSystem,
        permissions: r.permissions,
        deniedPermissions: r.deniedPermissions,
        inheritsFrom: r.inheritsFrom,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  });

  // GET /orgs/:id/roles/defaults - Get default role templates
  app.get('/:id/roles/defaults', async (req, reply) => {
    const { id } = req.params as { id: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.view'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    const defaults = getDefaultRoles();
    
    return {
      roles: Object.entries(defaults).map(([slug, role]) => ({
        slug,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions,
      })),
    };
  });

  // GET /orgs/:id/roles/:roleId - Get single role
  app.get('/:id/roles/:roleId', async (req, reply) => {
    const { id, roleId } = req.params as { id: string; roleId: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.view'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    const role = await getRole(id, roleId);
    
    if (!role) {
      return reply.code(404).send({ error: 'not_found' });
    }
    
    return {
      role: {
        id: String(role.id),
        name: role.name,
        slug: role.slug,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions,
        deniedPermissions: role.deniedPermissions,
        inheritsFrom: role.inheritsFrom,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    };
  });

  // POST /orgs/:id/roles - Create custom role
  app.post('/:id/roles', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.create'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return reply.code(400).send({ error: 'name_required' });
    }
    
    if (!body.permissions || !Array.isArray(body.permissions)) {
      return reply.code(400).send({ error: 'permissions_required' });
    }
    
    // Validate permissions
    for (const perm of body.permissions) {
      if (!PERMISSIONS[perm as keyof typeof PERMISSIONS]) {
        return reply.code(400).send({ error: 'invalid_permission', permission: perm });
      }
    }
    
    try {
      const role = await createRole(
        id,
        {
          name: body.name,
          description: body.description,
          permissions: body.permissions,
          inheritsFrom: body.inheritsFrom,
          deniedPermissions: body.deniedPermissions,
        },
        userSub,
        getAuditContext(req, id)
      );

      return {
        role: {
          id: String(role.id),
          name: role.name,
          slug: role.slug,
          description: role.description,
          permissions: role.permissions,
        },
      };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // PATCH /orgs/:id/roles/:roleId - Update custom role
  app.patch('/:id/roles/:roleId', async (req, reply) => {
    const { id, roleId } = req.params as { id: string; roleId: string };
    const body = req.body as any;
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.update'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    // Validate permissions if provided
    if (body.permissions && Array.isArray(body.permissions)) {
      for (const perm of body.permissions) {
        if (!PERMISSIONS[perm as keyof typeof PERMISSIONS]) {
          return reply.code(400).send({ error: 'invalid_permission', permission: perm });
        }
      }
    }
    
    try {
      const role = await updateRole(
        id,
        roleId,
        {
          name: body.name,
          description: body.description,
          permissions: body.permissions,
          deniedPermissions: body.deniedPermissions,
        },
        userSub,
        getAuditContext(req, id)
      );

      if (!role) {
        return reply.code(404).send({ error: 'not_found' });
      }

      return {
        role: {
          id: String(role.id),
          name: role.name,
          slug: role.slug,
          description: role.description,
          permissions: role.permissions,
        },
      };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // DELETE /orgs/:id/roles/:roleId - Delete custom role
  app.delete('/:id/roles/:roleId', async (req, reply) => {
    const { id, roleId } = req.params as { id: string; roleId: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.delete'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    try {
      const deleted = await deleteRole(id, roleId, userSub, getAuditContext(req, id));
      
      if (!deleted) {
        return reply.code(404).send({ error: 'not_found' });
      }
      
      return { ok: true };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ======== Member Role Assignment ========
  
  // GET /orgs/:id/members/:memberId/roles - Get member's roles
  app.get('/:id/members/:memberId/roles', async (req, reply) => {
    const { id, memberId } = req.params as { id: string; memberId: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.view'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    const memberRoles = await getMemberRoles(id, memberId);
    
    return {
      roles: memberRoles.map(mr => ({
        id: String(mr.id),
        roleId: String(mr.roleId),
        roleSlug: mr.roleSlug,
        role: mr.role ? {
          name: mr.role.name,
          description: mr.role.description,
        } : undefined,
        expiresAt: mr.expiresAt,
        assignedBy: mr.assignedBy,
        reason: mr.reason,
        createdAt: mr.createdAt,
      })),
    };
  });

  // POST /orgs/:id/members/:memberId/roles - Assign role to member
  app.post('/:id/members/:memberId/roles', async (req, reply) => {
    const { id, memberId } = req.params as { id: string; memberId: string };
    const body = req.body as any;
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.assign'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    if (!body.roleSlug || typeof body.roleSlug !== 'string') {
      return reply.code(400).send({ error: 'role_slug_required' });
    }
    
    // Get the member's userSub
    const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) {
      return reply.code(404).send({ error: 'member_not_found' });
    }
    
    if (!member.userSub) {
      return reply.code(400).send({ error: 'member_not_active', message: 'Member must accept invitation first' });
    }
    
    try {
      await assignRole(
        id,
        memberId,
        member.userSub,
        body.roleSlug,
        userSub,
        {
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          reason: body.reason,
          auditContext: getAuditContext(req, id),
        }
      );
      
      return { ok: true };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // DELETE /orgs/:id/members/:memberId/roles/:roleSlug - Remove role from member
  app.delete('/:id/members/:memberId/roles/:roleSlug', async (req, reply) => {
    const { id, memberId, roleSlug } = req.params as { 
      id: string; 
      memberId: string;
      roleSlug: string;
    };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'role.assign'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    // Get the member's userSub
    const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) {
      return reply.code(404).send({ error: 'member_not_found' });
    }
    
    if (!member.userSub) {
      return reply.code(400).send({ error: 'member_not_active' });
    }
    
    await removeRole(
      id,
      memberId,
      member.userSub,
      roleSlug,
      userSub,
      getAuditContext(req, id)
    );
    
    return { ok: true };
  });

  // ======== API Keys ========
  
  // GET /orgs/:id/api-keys - List API keys
  app.get('/:id/api-keys', async (req, reply) => {
    const { id } = req.params as { id: string };
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'apikey.view'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    const keys = await listApiKeys(id);
    
    return {
      apiKeys: keys.map(k => ({
        id: String(k.id),
        name: k.name,
        description: k.description,
        keyPrefix: k.keyPrefix,
        roleSlug: k.roleSlug,
        permissions: k.permissions,
        status: k.status,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        usageCount: k.usageCount,
        createdAt: k.createdAt,
        createdBy: k.createdBy,
      })),
    };
  });

  // POST /orgs/:id/api-keys - Create API key
  app.post('/:id/api-keys', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'apikey.create'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    if (!body.name || typeof body.name !== 'string') {
      return reply.code(400).send({ error: 'name_required' });
    }

    // Accept scopes (from dashboard) OR roleSlug/permissions (from RBAC admin)
    if (!body.scopes && !body.roleSlug && (!body.permissions || !Array.isArray(body.permissions) || body.permissions.length === 0)) {
      return reply.code(400).send({ error: 'role_or_permissions_required' });
    }

    // If dashboard sent scopes, use the simple creation path
    if (body.scopes && Array.isArray(body.scopes)) {
      try {
        const secret = `lam_sk_${crypto.randomBytes(32).toString('base64url')}`;
        const salt = crypto.randomBytes(16).toString('base64url');
        const hash = crypto.createHash('sha256').update(secret + ':' + salt).digest('hex');
        const prefix = secret.substring(0, 15);

        const [doc] = await db.insert(apiKeys).values({
          orgId: id,
          name: body.name,
          keyHash: hash,
          keySalt: salt,
          keyPrefix: prefix,
          scopes: body.scopes,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          createdBy: userSub,
          disabled: false,
        }).returning();

        return {
          apiKey: secret,
          keyPrefix: doc.keyPrefix,
          id: doc.id,
          scopes: doc.scopes,
          warning: 'Store this API key securely. It will not be shown again.',
        };
      } catch (e: any) {
        return reply.code(400).send({ error: e.message });
      }
    }

    // Validate permissions if provided
    if (body.permissions && Array.isArray(body.permissions)) {
      for (const perm of body.permissions) {
        if (!PERMISSIONS[perm as keyof typeof PERMISSIONS]) {
          return reply.code(400).send({ error: 'invalid_permission', permission: perm });
        }
      }
    }

    try {
      const result = await createApiKey(
        id,
        {
          name: body.name,
          description: body.description,
          roleSlug: body.roleSlug,
          permissions: body.permissions,
          allowedIps: body.allowedIps,
          allowedOrigins: body.allowedOrigins,
          rateLimit: body.rateLimit,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        },
        userSub,
        getAuditContext(req, id)
      );

      return {
        apiKey: result.apiKey, // Only shown once!
        keyPrefix: result.keyPrefix,
        id: result.id,
        warning: 'Store this API key securely. It will not be shown again.',
      };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // DELETE /orgs/:id/api-keys/:keyId - Revoke API key
  app.delete('/:id/api-keys/:keyId', async (req, reply) => {
    const { id, keyId } = req.params as { id: string; keyId: string };
    const body = (req.body || {}) as any;
    
    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    
    const permResult = await checkPermission(
      { userSub, orgId: id },
      'apikey.revoke'
    );
    
    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }
    
    const revoked = await revokeApiKey(
      id,
      keyId,
      userSub,
      body.reason,
      getAuditContext(req, id)
    );
    
    if (!revoked) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const instanceId = (req as any).lamdisInstanceId;
    if (instanceId) {
      import('../lib/lamdis.js').then(({ getLamdis }) => getLamdis()).then(lamdis => {
        if (lamdis) lamdis.resumeWorkflow(instanceId, 'account-closure-execution', 'lamdis-api')
          .emit('api.tokens.revoked', { orgId: id, keyId });
      }).catch(() => {});
    }

    return { ok: true };
  });
};

export default routes;
