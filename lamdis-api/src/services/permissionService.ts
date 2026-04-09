/**
 * Permission Service
 *
 * Provides comprehensive RBAC functionality with:
 * - Permission checking and caching
 * - Role management
 * - Auth0 organization integration
 * - Scoped permissions support
 */
import crypto from 'crypto';
import { eq, and, or, inArray, desc, asc, gt, isNull, count, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { roles, memberRoles, apiKeys, members } from '@lamdis/db/schema';
import {
  Permission,
  PERMISSIONS,
  DEFAULT_ROLES,
  DefaultRoleName,
  resolvePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from '../lib/permissions.js';
import { createAuditLog, AuditContext } from './auditService.js';

/** Legacy type alias — the actual Drizzle row shape is used everywhere via `any` */
type Role = { id: string; permissions: Permission[]; inheritsFrom?: string | null; deniedPermissions?: Permission[] };

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  permissions?: Permission[];
  roles?: string[];
}

/**
 * User context for permission checks
 */
export interface UserContext {
  userSub: string;
  orgId: string;
  email?: string;
  name?: string;
}

/**
 * Simple in-memory cache for permissions (TTL: 5 minutes)
 */
const permissionCache = new Map<string, { permissions: Set<Permission>; roles: string[]; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(orgId: string, userSub: string): string {
  return `${orgId}:${userSub}`;
}

/**
 * Clear permission cache for a user
 */
export function clearPermissionCache(orgId: string, userSub?: string): void {
  if (userSub) {
    permissionCache.delete(getCacheKey(orgId, userSub));
  } else {
    // Clear all cache entries for the org
    for (const key of permissionCache.keys()) {
      if (key.startsWith(`${orgId}:`)) {
        permissionCache.delete(key);
      }
    }
  }
}

/**
 * Get user's effective permissions
 */
export async function getUserPermissions(userContext: UserContext): Promise<{ permissions: Set<Permission>; roles: string[] }> {
  const { orgId, userSub } = userContext;

  // Check cache
  const cacheKey = getCacheKey(orgId, userSub);
  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { permissions: cached.permissions, roles: cached.roles };
  }

  // Get member record
  const [member] = await db.select().from(members)
    .where(and(
      eq(members.orgId, orgId),
      eq(members.userSub, userSub),
      eq(members.status, 'active'),
    ))
    .limit(1);

  if (!member) {
    return { permissions: new Set(), roles: [] };
  }

  // Check if member has a legacy role
  const legacyRole = member.role as DefaultRoleName;

  // Get assigned roles from memberRoles (not expired)
  const assignedMemberRoles = await db.select().from(memberRoles)
    .where(and(
      eq(memberRoles.orgId, orgId),
      eq(memberRoles.userSub, userSub),
      or(
        isNull(memberRoles.expiresAt),
        gt(memberRoles.expiresAt, new Date()),
      ),
    ));

  // Fetch role definitions
  const roleIds = assignedMemberRoles.map(mr => mr.roleId);
  const fetchedRoles = roleIds.length > 0
    ? await db.select().from(roles).where(inArray(roles.id, roleIds))
    : [];

  // If no custom roles, use legacy role
  if (fetchedRoles.length === 0 && legacyRole && DEFAULT_ROLES[legacyRole]) {
    const permissions = new Set(DEFAULT_ROLES[legacyRole].permissions);
    const result = { permissions, roles: [legacyRole] };
    permissionCache.set(cacheKey, { ...result, expiresAt: Date.now() + CACHE_TTL });
    return result;
  }

  // Resolve permissions from custom roles
  const permissions = resolvePermissions(fetchedRoles as unknown as Role[]);
  const roleNames = fetchedRoles.map(r => r.slug);

  // Add legacy role permissions if no custom roles override
  if (legacyRole && DEFAULT_ROLES[legacyRole] && fetchedRoles.length === 0) {
    for (const perm of DEFAULT_ROLES[legacyRole].permissions) {
      permissions.add(perm);
    }
    roleNames.push(legacyRole);
  }

  // Cache result
  const result = { permissions, roles: roleNames };
  permissionCache.set(cacheKey, { ...result, expiresAt: Date.now() + CACHE_TTL });

  return result;
}

/**
 * Check if user has a specific permission
 */
export async function checkPermission(
  userContext: UserContext,
  permission: Permission
): Promise<PermissionCheckResult> {
  const { permissions, roles: userRoles } = await getUserPermissions(userContext);

  const allowed = hasPermission(permissions, permission);

  return {
    allowed,
    reason: allowed ? undefined : `Missing permission: ${permission}`,
    permissions: Array.from(permissions),
    roles: userRoles,
  };
}

/**
 * Check if user has any of the given permissions
 */
export async function checkAnyPermission(
  userContext: UserContext,
  requiredPermissions: Permission[]
): Promise<PermissionCheckResult> {
  const { permissions, roles: userRoles } = await getUserPermissions(userContext);

  const allowed = hasAnyPermission(permissions, requiredPermissions);

  return {
    allowed,
    reason: allowed ? undefined : `Missing all of: ${requiredPermissions.join(', ')}`,
    permissions: Array.from(permissions),
    roles: userRoles,
  };
}

/**
 * Check if user has all of the given permissions
 */
export async function checkAllPermissions(
  userContext: UserContext,
  requiredPermissions: Permission[]
): Promise<PermissionCheckResult> {
  const { permissions, roles: userRoles } = await getUserPermissions(userContext);

  const allowed = hasAllPermissions(permissions, requiredPermissions);

  return {
    allowed,
    reason: allowed ? undefined : `Missing some of: ${requiredPermissions.join(', ')}`,
    permissions: Array.from(permissions),
    roles: userRoles,
  };
}

/**
 * Initialize default system roles for an organization
 */
export async function initializeOrgRoles(orgId: string, createdBy: string): Promise<void> {
  for (const [slug, roleTemplate] of Object.entries(DEFAULT_ROLES)) {
    const [existing] = await db.select().from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.slug, slug)))
      .limit(1);

    if (!existing) {
      await db.insert(roles).values({
        orgId,
        name: roleTemplate.name,
        slug,
        description: roleTemplate.description,
        isSystem: roleTemplate.isSystem,
        permissions: [...roleTemplate.permissions],
        createdBy,
      });
    }
  }
}

/**
 * Assign a role to a member
 */
export async function assignRole(
  orgId: string,
  memberId: string,
  userSub: string,
  roleSlug: string,
  assignedBy: string,
  options?: {
    expiresAt?: Date;
    reason?: string;
    auditContext?: AuditContext;
  }
): Promise<void> {
  // Find the role
  const [role] = await db.select().from(roles)
    .where(and(eq(roles.orgId, orgId), eq(roles.slug, roleSlug)))
    .limit(1);

  if (!role) {
    throw new Error(`Role not found: ${roleSlug}`);
  }

  // Get previous roles for audit
  const previousAssignments = await db.select().from(memberRoles)
    .where(and(eq(memberRoles.orgId, orgId), eq(memberRoles.memberId, memberId)));

  // Create or update the role assignment (upsert on orgId + memberId + roleId unique constraint)
  await db.insert(memberRoles).values({
    orgId,
    memberId,
    userSub,
    roleId: role.id,
    roleSlug,
    expiresAt: options?.expiresAt,
    assignedBy,
    reason: options?.reason,
  }).onConflictDoUpdate({
    target: [memberRoles.orgId, memberRoles.memberId, memberRoles.roleId],
    set: {
      userSub,
      roleSlug,
      expiresAt: options?.expiresAt,
      assignedBy,
      reason: options?.reason,
    },
  });

  // Clear permission cache
  clearPermissionCache(orgId, userSub);

  // Audit log
  if (options?.auditContext) {
    await createAuditLog(options.auditContext, 'role.assigned', {
      category: 'role',
      resource: { type: 'member', id: memberId },
      details: {
        roleSlug,
        roleName: role.name,
        previousRoles: previousAssignments.map(r => r.roleSlug),
        expiresAt: options.expiresAt,
        reason: options.reason,
      },
    });
  }
}

/**
 * Remove a role from a member
 */
export async function removeRole(
  orgId: string,
  memberId: string,
  userSub: string,
  roleSlug: string,
  removedBy: string,
  auditContext?: AuditContext
): Promise<void> {
  const [role] = await db.select().from(roles)
    .where(and(eq(roles.orgId, orgId), eq(roles.slug, roleSlug)))
    .limit(1);

  if (!role) return;

  await db.delete(memberRoles).where(and(
    eq(memberRoles.orgId, orgId),
    eq(memberRoles.memberId, memberId),
    eq(memberRoles.roleId, role.id),
  ));

  // Clear permission cache
  clearPermissionCache(orgId, userSub);

  // Audit log
  if (auditContext) {
    await createAuditLog(auditContext, 'role.removed', {
      category: 'role',
      resource: { type: 'member', id: memberId },
      details: {
        roleSlug,
        roleName: role.name,
        removedBy,
      },
    });
  }
}

/**
 * Create a custom role
 */
export async function createRole(
  orgId: string,
  data: {
    name: string;
    description?: string;
    permissions: Permission[];
    inheritsFrom?: string;
    deniedPermissions?: Permission[];
  },
  createdBy: string,
  auditContext?: AuditContext
): Promise<any> {
  // Generate slug
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Check for duplicate
  const [existing] = await db.select().from(roles)
    .where(and(eq(roles.orgId, orgId), eq(roles.slug, slug)))
    .limit(1);

  if (existing) {
    throw new Error(`Role with slug "${slug}" already exists`);
  }

  // Validate permissions
  for (const perm of data.permissions) {
    if (!PERMISSIONS[perm]) {
      throw new Error(`Invalid permission: ${perm}`);
    }
  }

  const [role] = await db.insert(roles).values({
    orgId,
    name: data.name,
    slug,
    description: data.description,
    isSystem: false,
    permissions: [...data.permissions],
    inheritsFrom: data.inheritsFrom,
    deniedPermissions: data.deniedPermissions ? [...data.deniedPermissions] : [],
    createdBy,
  }).returning();

  // Audit log
  if (auditContext) {
    await createAuditLog(auditContext, 'role.created', {
      category: 'role',
      resource: { type: 'role', id: role.id, name: role.name },
      after: role,
    });
  }

  return role as unknown as Role;
}

/**
 * Update a custom role
 */
export async function updateRole(
  orgId: string,
  roleId: string,
  data: {
    name?: string;
    description?: string;
    permissions?: Permission[];
    deniedPermissions?: Permission[];
  },
  updatedBy: string,
  auditContext?: AuditContext
): Promise<any | null> {
  const [role] = await db.select().from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)))
    .limit(1);

  if (!role) return null;

  if (role.isSystem) {
    throw new Error('Cannot modify system roles');
  }

  const before = { ...role };

  // Build update payload
  const updates: Record<string, unknown> = {
    updatedBy,
    updatedAt: new Date(),
  };

  if (data.name) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.permissions) {
    // Validate permissions
    for (const perm of data.permissions) {
      if (!PERMISSIONS[perm as Permission]) {
        throw new Error(`Invalid permission: ${perm}`);
      }
    }
    updates.permissions = [...data.permissions];
  }
  if (data.deniedPermissions) {
    updates.deniedPermissions = [...data.deniedPermissions];
  }

  const [updated] = await db.update(roles)
    .set(updates)
    .where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)))
    .returning();

  // Clear all permission caches for this org (role change affects all users with this role)
  clearPermissionCache(orgId);

  // Audit log
  if (auditContext) {
    await createAuditLog(auditContext, 'role.updated', {
      category: 'role',
      resource: { type: 'role', id: roleId, name: updated.name },
      before,
      after: updated,
    });
  }

  return updated as unknown as Role;
}

/**
 * Delete a custom role
 */
export async function deleteRole(
  orgId: string,
  roleId: string,
  deletedBy: string,
  auditContext?: AuditContext
): Promise<boolean> {
  const [role] = await db.select().from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)))
    .limit(1);

  if (!role) return false;

  if (role.isSystem) {
    throw new Error('Cannot delete system roles');
  }

  // Check if role is assigned to any members
  const [assignmentCount] = await db.select({ count: count() }).from(memberRoles)
    .where(and(eq(memberRoles.orgId, orgId), eq(memberRoles.roleId, role.id)));

  if (assignmentCount.count > 0) {
    throw new Error(`Cannot delete role: ${assignmentCount.count} member(s) have this role assigned`);
  }

  await db.delete(roles).where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)));

  // Audit log
  if (auditContext) {
    await createAuditLog(auditContext, 'role.deleted', {
      category: 'role',
      severity: 'warning',
      resource: { type: 'role', id: roleId, name: role.name },
      before: role,
    });
  }

  return true;
}

/**
 * List all roles for an organization
 */
export async function listRoles(orgId: string) {
  return db.select().from(roles)
    .where(eq(roles.orgId, orgId))
    .orderBy(desc(roles.isSystem), asc(roles.name));
}

/**
 * Get a role by ID or slug
 */
export async function getRole(orgId: string, roleIdOrSlug: string) {
  const [role] = await db.select().from(roles)
    .where(and(
      eq(roles.orgId, orgId),
      or(eq(roles.id, roleIdOrSlug), eq(roles.slug, roleIdOrSlug)),
    ))
    .limit(1);

  return role ?? null;
}

/**
 * Get member's roles
 */
export async function getMemberRoles(orgId: string, memberId: string) {
  const assignedMemberRoles = await db.select().from(memberRoles)
    .where(and(
      eq(memberRoles.orgId, orgId),
      eq(memberRoles.memberId, memberId),
      or(
        isNull(memberRoles.expiresAt),
        gt(memberRoles.expiresAt, new Date()),
      ),
    ));

  const roleIds = assignedMemberRoles.map(mr => mr.roleId);
  const fetchedRoles = roleIds.length > 0
    ? await db.select().from(roles).where(inArray(roles.id, roleIds))
    : [];

  return assignedMemberRoles.map(mr => ({
    ...mr,
    role: fetchedRoles.find(r => r.id === mr.roleId),
  }));
}

// ========== API Key Management ==========

/**
 * Create an API key
 */
export async function createApiKey(
  orgId: string,
  data: {
    name: string;
    description?: string;
    roleSlug?: string;
    permissions?: Permission[];
    allowedIps?: string[];
    allowedOrigins?: string[];
    rateLimit?: number;
    expiresAt?: Date;
  },
  createdBy: string,
  auditContext?: AuditContext
): Promise<{ apiKey: string; keyPrefix: string; id: string }> {
  // Generate random API key
  const rawKey = `lam_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12);

  // Get role if specified
  let roleId: string | undefined;
  if (data.roleSlug) {
    const [role] = await db.select().from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.slug, data.roleSlug)))
      .limit(1);

    if (!role) {
      throw new Error(`Role not found: ${data.roleSlug}`);
    }
    roleId = role.id;
  }

  // Validate permissions
  if (data.permissions) {
    for (const perm of data.permissions) {
      if (!PERMISSIONS[perm]) {
        throw new Error(`Invalid permission: ${perm}`);
      }
    }
  }

  const [apiKey] = await db.insert(apiKeys).values({
    orgId,
    name: data.name,
    description: data.description,
    keyHash,
    keyPrefix,
    roleId,
    roleSlug: data.roleSlug,
    permissions: data.permissions ? [...data.permissions] : undefined,
    allowedIps: data.allowedIps,
    allowedOrigins: data.allowedOrigins,
    rateLimit: data.rateLimit,
    expiresAt: data.expiresAt,
    createdBy,
  }).returning();

  // Audit log
  if (auditContext) {
    await createAuditLog(auditContext, 'apikey.created', {
      category: 'system',
      resource: { type: 'apikey', id: apiKey.id, name: data.name },
      details: {
        keyPrefix,
        roleSlug: data.roleSlug,
        hasPermissions: !!data.permissions?.length,
        expiresAt: data.expiresAt,
      },
    });
  }

  return {
    apiKey: rawKey, // Only returned on creation
    keyPrefix,
    id: apiKey.id,
  };
}

/**
 * Validate an API key and get its permissions
 */
export async function validateApiKey(rawKey: string): Promise<{
  valid: boolean;
  orgId?: string;
  permissions?: Set<Permission>;
  apiKeyId?: string;
  reason?: string;
}> {
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const [apiKey] = await db.select().from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!apiKey) {
    return { valid: false, reason: 'Invalid API key' };
  }

  if (apiKey.status !== 'active') {
    return { valid: false, reason: `API key is ${apiKey.status}` };
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return { valid: false, reason: 'API key has expired' };
  }

  // Update last used
  await db.update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      usageCount: sql`${apiKeys.usageCount} + 1`,
    })
    .where(eq(apiKeys.id, apiKey.id));

  // Get permissions
  let permissions: Set<Permission>;

  if (apiKey.roleId) {
    const [role] = await db.select().from(roles)
      .where(eq(roles.id, apiKey.roleId))
      .limit(1);

    if (role) {
      permissions = resolvePermissions([role as unknown as Role]);
    } else {
      permissions = new Set();
    }
  } else if (apiKey.permissions && apiKey.permissions.length > 0) {
    permissions = new Set(apiKey.permissions as Permission[]);
  } else {
    permissions = new Set();
  }

  return {
    valid: true,
    orgId: apiKey.orgId,
    permissions,
    apiKeyId: apiKey.id,
  };
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  orgId: string,
  apiKeyId: string,
  revokedBy: string,
  reason?: string,
  auditContext?: AuditContext
): Promise<boolean> {
  const [apiKey] = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.orgId, orgId)))
    .limit(1);

  if (!apiKey) return false;

  await db.update(apiKeys)
    .set({
      status: 'revoked',
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(apiKeys.id, apiKeyId));

  // Audit log
  if (auditContext) {
    await createAuditLog(auditContext, 'apikey.revoked', {
      category: 'system',
      severity: 'warning',
      resource: { type: 'apikey', id: apiKeyId, name: apiKey.name },
      details: { reason },
    });
  }

  return true;
}

/**
 * List API keys for an organization (omit keyHash from results)
 */
export async function listApiKeys(orgId: string) {
  return db.select({
    id: apiKeys.id,
    orgId: apiKeys.orgId,
    name: apiKeys.name,
    description: apiKeys.description,
    keyPrefix: apiKeys.keyPrefix,
    keySalt: apiKeys.keySalt,
    roleId: apiKeys.roleId,
    roleSlug: apiKeys.roleSlug,
    permissions: apiKeys.permissions,
    scopes: apiKeys.scopes,
    allowedIps: apiKeys.allowedIps,
    allowedOrigins: apiKeys.allowedOrigins,
    rateLimit: apiKeys.rateLimit,
    expiresAt: apiKeys.expiresAt,
    lastUsedAt: apiKeys.lastUsedAt,
    usageCount: apiKeys.usageCount,
    status: apiKeys.status,
    disabled: apiKeys.disabled,
    revokedAt: apiKeys.revokedAt,
    revokedBy: apiKeys.revokedBy,
    revokeReason: apiKeys.revokeReason,
    createdBy: apiKeys.createdBy,
    createdAt: apiKeys.createdAt,
    updatedAt: apiKeys.updatedAt,
  }).from(apiKeys)
    .where(eq(apiKeys.orgId, orgId))
    .orderBy(desc(apiKeys.createdAt));
}

/**
 * Get permission definitions
 */
export function getPermissionDefinitions() {
  return PERMISSIONS;
}

/**
 * Get default role templates
 */
export function getDefaultRoles() {
  return DEFAULT_ROLES;
}
