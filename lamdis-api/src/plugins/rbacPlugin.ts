/**
 * RBAC Fastify Plugin
 * 
 * Provides permission checking decorators and hooks for routes:
 * - requirePermission: Require a specific permission
 * - requireAnyPermission: Require any of the given permissions
 * - requireAllPermissions: Require all of the given permissions
 * - auditLog: Automatically log audit events
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { v4 as uuidv4 } from 'uuid';
import {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  getUserPermissions,
  validateApiKey,
  UserContext,
} from '../services/permissionService.js';
import { createAuditLog, AuditContext, AuditOptions } from '../services/auditService.js';
import { Permission } from '../lib/permissions.js';
import { AUDIT_CATEGORIES, AuditCategory, AuditAction } from '../lib/audit-constants.js';

// Extend FastifyRequest to include RBAC context
declare module 'fastify' {
  interface FastifyRequest {
    rbac?: {
      userContext: UserContext;
      permissions: Set<Permission>;
      roles: string[];
      auditContext: AuditContext;
    };
    orgId?: string;
  }
}

interface RbacPluginOptions {
  /**
   * Skip RBAC for certain paths (e.g., health checks)
   */
  skipPaths?: string[];
  
  /**
   * Enable audit logging for all requests
   */
  enableAuditLogging?: boolean;
}

const rbacPlugin: FastifyPluginAsync<RbacPluginOptions> = async (fastify, options) => {
  const { skipPaths = [], enableAuditLogging = true } = options;
  
  // Add hook to extract and validate authentication
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip for certain paths
    if (skipPaths.some(p => request.url.startsWith(p))) {
      return;
    }
    
    // Get user info from JWT (set by auth middleware)
    const user = (request as any).user;
    const userSub = user?.sub;
    
    // Check for API key authentication
    const authHeader = request.headers.authorization;
    let apiKeyAuth = false;
    let apiKeyOrgId: string | undefined;
    let apiKeyPermissions: Set<Permission> | undefined;
    
    if (authHeader?.startsWith('Bearer lam_')) {
      const apiKey = authHeader.slice(7);
      const result = await validateApiKey(apiKey);
      
      if (!result.valid) {
        return reply.code(401).send({ 
          error: 'unauthorized', 
          message: result.reason || 'Invalid API key' 
        });
      }
      
      apiKeyAuth = true;
      apiKeyOrgId = result.orgId;
      apiKeyPermissions = result.permissions;
    }
    
    // Extract orgId from request
    let orgId = request.orgId || (request.params as any)?.id || (request.params as any)?.orgId;
    
    // For API key auth, use the key's orgId
    if (apiKeyAuth && apiKeyOrgId) {
      orgId = apiKeyOrgId;
    }
    
    if (!orgId) {
      // No org context needed for some routes
      return;
    }
    
    // Build audit context
    const auditContext: AuditContext = {
      orgId,
      userSub: apiKeyAuth ? `apikey:${apiKeyOrgId}` : userSub,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: uuidv4(),
      source: apiKeyAuth ? 'api' : 'web',
    };
    
    // Build user context for permission checks
    const userContext: UserContext = {
      userSub: apiKeyAuth ? `apikey:${apiKeyOrgId}` : userSub,
      orgId,
    };
    
    // Get permissions
    let permissions: Set<Permission>;
    let roles: string[];
    
    if (apiKeyAuth && apiKeyPermissions) {
      permissions = apiKeyPermissions;
      roles = ['api_key'];
    } else if (userSub) {
      const result = await getUserPermissions(userContext);
      permissions = result.permissions;
      roles = result.roles;
    } else {
      permissions = new Set();
      roles = [];
    }
    
    // Attach RBAC context to request
    request.rbac = {
      userContext,
      permissions,
      roles,
      auditContext,
    };
    request.orgId = orgId;
  });
  
  /**
   * Decorator: Require a specific permission
   */
  fastify.decorate('requirePermission', function(permission: Permission) {
    return async function(request: FastifyRequest, reply: FastifyReply) {
      if (!request.rbac) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required' });
      }
      
      const result = await checkPermission(request.rbac.userContext, permission);
      
      if (!result.allowed) {
        // Log access denied
        await createAuditLog(request.rbac.auditContext, 'access.denied', {
          category: 'system',
          severity: 'warning',
          details: {
            requiredPermission: permission,
            path: request.url,
            method: request.method,
          },
        });
        
        return reply.code(403).send({ 
          error: 'forbidden', 
          message: result.reason || 'Permission denied',
          requiredPermission: permission,
        });
      }
    };
  });
  
  /**
   * Decorator: Require any of the given permissions
   */
  fastify.decorate('requireAnyPermission', function(permissions: Permission[]) {
    return async function(request: FastifyRequest, reply: FastifyReply) {
      if (!request.rbac) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required' });
      }
      
      const result = await checkAnyPermission(request.rbac.userContext, permissions);
      
      if (!result.allowed) {
        await createAuditLog(request.rbac.auditContext, 'access.denied', {
          category: 'system',
          severity: 'warning',
          details: {
            requiredPermissions: permissions,
            path: request.url,
            method: request.method,
          },
        });
        
        return reply.code(403).send({ 
          error: 'forbidden', 
          message: result.reason || 'Permission denied',
          requiredPermissions: permissions,
        });
      }
    };
  });
  
  /**
   * Decorator: Require all of the given permissions
   */
  fastify.decorate('requireAllPermissions', function(permissions: Permission[]) {
    return async function(request: FastifyRequest, reply: FastifyReply) {
      if (!request.rbac) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required' });
      }
      
      const result = await checkAllPermissions(request.rbac.userContext, permissions);
      
      if (!result.allowed) {
        await createAuditLog(request.rbac.auditContext, 'access.denied', {
          category: 'system',
          severity: 'warning',
          details: {
            requiredPermissions: permissions,
            path: request.url,
            method: request.method,
          },
        });
        
        return reply.code(403).send({ 
          error: 'forbidden', 
          message: result.reason || 'Permission denied',
          requiredPermissions: permissions,
        });
      }
    };
  });
  
  /**
   * Decorator: Log audit event
   */
  fastify.decorate('auditLog', function(action: AuditAction, options: Partial<AuditOptions>) {
    return async function(request: FastifyRequest, _reply: FastifyReply) {
      if (!request.rbac) return;
      
      await createAuditLog(request.rbac.auditContext, action, {
        category: options.category || 'system',
        ...options,
      });
    };
  });
};

// Export as Fastify plugin
export default fp(rbacPlugin, {
  name: 'rbac-plugin',
  fastify: '4.x',
});

// Export types
export type { RbacPluginOptions };
