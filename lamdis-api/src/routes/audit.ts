/**
 * Audit Log API Routes
 *
 * Provides comprehensive audit log access with:
 * - Filtering, pagination, and search
 * - Export functionality for compliance
 * - Statistics and analytics
 * - Resource history tracking
 */
import type { FastifyPluginAsync } from 'fastify';
import {
  queryAuditLogs,
  getAuditStatistics,
  exportAuditLogs,
  getAuditLogById,
  getRelatedAuditLogs,
  getResourceAuditHistory,
  AuditQueryOptions,
} from '../services/auditService.js';
import { checkPermission } from '../services/permissionService.js';
import { AUDIT_CATEGORIES, AUDIT_SEVERITIES } from '../lib/audit-constants.js';

const routes: FastifyPluginAsync = async (app) => {
  // GET /orgs/:id/audit - List audit logs with filtering
  app.get('/:id/audit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as any;

    try {
      // Check permission
      const userSub = (req as any).user?.sub;
      if (!userSub) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      let permResult;
      try {
        permResult = await checkPermission(
          { userSub, orgId: id },
          'audit.view'
        );
      } catch (permErr: any) {
        req.log.error({ err: permErr, orgId: id, userSub }, 'permission_check_error');
        return reply.code(500).send({ error: 'permission_check_failed', message: permErr?.message });
      }

      if (!permResult.allowed) {
        return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
      }

      // Build query options
      const options: AuditQueryOptions = {
      orgId: id,
      page: parseInt(query.page) || 1,
      limit: Math.min(parseInt(query.limit) || 50, 100),
      sortBy: query.sortBy || 'timestamp',
      sortOrder: query.sortOrder || 'desc',
    };

    // Date filters
    if (query.startDate) {
      options.startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      options.endDate = new Date(query.endDate);
    }

    // Category filter
    if (query.categories) {
      const cats = Array.isArray(query.categories)
        ? query.categories
        : query.categories.split(',');
      options.categories = cats.filter((c: string) =>
        Object.values(AUDIT_CATEGORIES).includes(c as any)
      );
    }

    // Action filter
    if (query.actions) {
      options.actions = Array.isArray(query.actions)
        ? query.actions
        : query.actions.split(',');
    }

    // Actor filter
    if (query.actorSub) {
      options.actorSub = query.actorSub;
    }

    // Resource filters
    if (query.resourceType) {
      options.resourceType = query.resourceType;
    }
    if (query.resourceId) {
      options.resourceId = query.resourceId;
    }

    // Severity filter
    if (query.severity) {
      const sevs = Array.isArray(query.severity)
        ? query.severity
        : query.severity.split(',');
      options.severity = sevs.filter((s: string) =>
        Object.values(AUDIT_SEVERITIES).includes(s as any)
      );
    }

    // Correlation ID
    if (query.correlationId) {
      options.correlationId = query.correlationId;
    }

    // Search
    if (query.search) {
      options.search = query.search;
    }

    let result;
    try {
      result = await queryAuditLogs(options);
    } catch (queryErr: any) {
      req.log.error({ err: queryErr, orgId: id, options }, 'audit_query_error');
      return reply.code(500).send({ error: 'audit_query_failed', message: queryErr?.message });
    }

    // Check if user can see full details
    const canSeeFull = await checkPermission(
      { userSub, orgId: id },
      'audit.view.full'
    );

    // Redact sensitive fields if user doesn't have full access
    const logs = result.logs.map(log => {
      const sanitized: any = {
        id: (log as any).id ?? (log as any)._id,
        timestamp: log.timestamp,
        action: log.action,
        category: log.category,
        severity: log.severity,
        actor: {
          email: (log.actor as any)?.email,
          role: (log.actor as any)?.role,
          type: (log.actor as any)?.type,
        },
        resource: log.resource,
        changedFields: log.changedFields,
        details: log.details,
      };

      if (canSeeFull.allowed) {
        sanitized.actor.sub = (log.actor as any)?.sub;
        sanitized.metadata = {
          ipAddressHash: (log.metadata as any)?.ipAddressHash,
          userAgent: (log.metadata as any)?.userAgent,
          source: (log.metadata as any)?.source,
          correlationId: (log.metadata as any)?.correlationId,
        };
        sanitized.before = log.before;
        sanitized.after = log.after;
        sanitized.integrityHash = log.integrityHash;
      }

      return sanitized;
    });

    return {
      logs,
      pagination: result.pagination,
      filters: {
        categories: Object.values(AUDIT_CATEGORIES),
        severities: Object.values(AUDIT_SEVERITIES),
      },
    };
    } catch (err: any) {
      req.log.error({ err, orgId: id }, 'audit_route_error');
      return reply.code(500).send({ error: 'internal_error', message: err?.message });
    }
  });

  // GET /orgs/:id/audit/statistics - Get audit statistics
  app.get('/:id/audit/statistics', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as any;

    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const permResult = await checkPermission(
      { userSub, orgId: id },
      'audit.view'
    );

    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const stats = await getAuditStatistics(id, startDate, endDate);

    return { statistics: stats };
  });

  // GET /orgs/:id/audit/:logId - Get single audit log entry
  app.get('/:id/audit/:logId', async (req, reply) => {
    const { id, logId } = req.params as { id: string; logId: string };

    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const permResult = await checkPermission(
      { userSub, orgId: id },
      'audit.view'
    );

    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }

    const log = await getAuditLogById(id, logId);

    if (!log) {
      return reply.code(404).send({ error: 'not_found' });
    }

    // Check for full access
    const canSeeFull = await checkPermission(
      { userSub, orgId: id },
      'audit.view.full'
    );

    const result: any = {
      id: (log as any).id ?? (log as any)._id,
      timestamp: log.timestamp,
      action: log.action,
      category: log.category,
      severity: log.severity,
      actor: {
        email: (log.actor as any)?.email,
        role: (log.actor as any)?.role,
        type: (log.actor as any)?.type,
      },
      resource: log.resource,
      changedFields: log.changedFields,
      details: log.details,
    };

    if (canSeeFull.allowed) {
      result.actor.sub = (log.actor as any)?.sub;
      result.metadata = log.metadata;
      result.before = log.before;
      result.after = log.after;
      result.integrityHash = log.integrityHash;
      result.previousHash = log.previousHash;
      result.compliance = log.compliance;
    }

    return { log: result };
  });

  // GET /orgs/:id/audit/correlation/:correlationId - Get related logs
  app.get('/:id/audit/correlation/:correlationId', async (req, reply) => {
    const { id, correlationId } = req.params as { id: string; correlationId: string };

    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const permResult = await checkPermission(
      { userSub, orgId: id },
      'audit.view'
    );

    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }

    const logs = await getRelatedAuditLogs(id, correlationId);

    return {
      correlationId,
      logs: logs.map(log => ({
        id: (log as any).id ?? (log as any)._id,
        timestamp: log.timestamp,
        action: log.action,
        category: log.category,
        severity: log.severity,
        actor: {
          email: (log.actor as any)?.email,
          role: (log.actor as any)?.role,
        },
        resource: log.resource,
      })),
    };
  });

  // GET /orgs/:id/audit/resource/:resourceType/:resourceId - Get resource history
  app.get('/:id/audit/resource/:resourceType/:resourceId', async (req, reply) => {
    const { id, resourceType, resourceId } = req.params as {
      id: string;
      resourceType: string;
      resourceId: string;
    };
    const query = req.query as any;

    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const permResult = await checkPermission(
      { userSub, orgId: id },
      'audit.view'
    );

    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }

    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const logs = await getResourceAuditHistory(id, resourceType, resourceId, limit);

    return {
      resourceType,
      resourceId,
      history: logs.map(log => ({
        id: (log as any).id ?? (log as any)._id,
        timestamp: log.timestamp,
        action: log.action,
        actor: {
          email: (log.actor as any)?.email,
        },
        changedFields: log.changedFields,
        before: log.before,
        after: log.after,
      })),
    };
  });

  // POST /orgs/:id/audit/export - Export audit logs
  app.post('/:id/audit/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;

    const userSub = (req as any).user?.sub;
    if (!userSub) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const permResult = await checkPermission(
      { userSub, orgId: id },
      'audit.export'
    );

    if (!permResult.allowed) {
      return reply.code(403).send({ error: 'forbidden', message: permResult.reason });
    }

    const options: AuditQueryOptions = {
      orgId: id,
    };

    // Date filters
    if (body.startDate) {
      options.startDate = new Date(body.startDate);
    }
    if (body.endDate) {
      options.endDate = new Date(body.endDate);
    }

    // Category filter
    if (body.categories && Array.isArray(body.categories)) {
      options.categories = body.categories;
    }

    // Severity filter
    if (body.severity && Array.isArray(body.severity)) {
      options.severity = body.severity;
    }

    // Action filter
    if (body.actions && Array.isArray(body.actions)) {
      options.actions = body.actions;
    }

    // Actor filter
    if (body.actorSub) {
      options.actorSub = body.actorSub;
    }

    // Search filter
    if (body.search) {
      options.search = body.search;
    }

    const format = body.format === 'csv' ? 'csv' : 'json';

    const result = await exportAuditLogs(options, format, userSub);

    // Set appropriate headers for download
    reply.header('Content-Type', result.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);

    return result.data;
  });

  // GET /orgs/:id/audit/categories - Get available categories
  app.get('/:id/audit/categories', async (_req, reply) => {
    return {
      categories: Object.entries(AUDIT_CATEGORIES).map(([key, value]) => ({
        key,
        value,
      })),
      severities: Object.entries(AUDIT_SEVERITIES).map(([key, value]) => ({
        key,
        value,
      })),
    };
  });
};

export default routes;
