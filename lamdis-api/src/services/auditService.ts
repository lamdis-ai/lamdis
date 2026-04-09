/**
 * Audit Service
 *
 * Provides comprehensive audit logging functionality with:
 * - Automatic before/after snapshot capture
 * - Change detection and field diffing
 * - Correlation ID tracking for related events
 * - Compliance-ready export support
 *
 * ## Quick Start - Adding Audit Logging to a Route
 *
 * ```typescript
 * import { createAuditLog, buildAuditContextFromRequest } from '../services/auditService.js';
 *
 * // CREATE operation
 * app.post('/orgs/:orgId/resources', async (req) => {
 *   const { orgId } = z.object({ orgId: z.string() }).parse(req.params);
 *   const body = z.object({ name: z.string() }).parse(req.body);
 *   const [doc] = await db.insert(resources).values({ orgId, ...body }).returning();
 *
 *   await createAuditLog(buildAuditContextFromRequest(req, orgId), 'resource.created', {
 *     category: 'test',  // Use appropriate category from AUDIT_CATEGORIES
 *     severity: 'info',
 *     resource: { type: 'resource', id: doc.id, name: body.name, collection: 'resources' },
 *     after: doc,
 *     details: { name: body.name },
 *   });
 *   return doc;
 * });
 *
 * // UPDATE operation
 * app.patch('/orgs/:orgId/resources/:id', async (req, reply) => {
 *   const [before] = await db.select().from(resources).where(and(eq(resources.id, id), eq(resources.orgId, orgId))).limit(1);
 *   if (!before) return reply.code(404).send({ error: 'not_found' });
 *   const [doc] = await db.update(resources).set(updates).where(and(eq(resources.id, id), eq(resources.orgId, orgId))).returning();
 *
 *   await createAuditLog(buildAuditContextFromRequest(req, orgId), 'resource.updated', {
 *     category: 'test',
 *     severity: 'info',
 *     resource: { type: 'resource', id, name: doc.name, collection: 'resources' },
 *     before,
 *     after: doc,
 *     details: { fieldsUpdated: Object.keys(updates) },
 *   });
 *   return doc;
 * });
 *
 * // DELETE operation
 * app.delete('/orgs/:orgId/resources/:id', async (req, reply) => {
 *   const [before] = await db.select().from(resources).where(and(eq(resources.id, id), eq(resources.orgId, orgId))).limit(1);
 *   await db.delete(resources).where(and(eq(resources.id, id), eq(resources.orgId, orgId)));
 *
 *   if (before) {
 *     await createAuditLog(buildAuditContextFromRequest(req, orgId), 'resource.deleted', {
 *       category: 'test',
 *       severity: 'warning',  // Deletions get 'warning' severity
 *       resource: { type: 'resource', id, name: before.name, collection: 'resources' },
 *       before,
 *       details: { name: before.name },
 *     });
 *   }
 *   return reply.code(204).send();
 * });
 * ```
 *
 * Available categories: auth, user, member, role, org, action, environment, variable,
 * connection, test, suite, run, setup, binding, assistant, knowledge, embodied, export, compliance, system
 */
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { eq, and, or, desc, asc, gte, lte, ilike, count, sql, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { auditLogs, members } from '@lamdis/db/schema';

// ── Type definitions (previously from Mongoose model) ────────────────────────

/**
 * Audit event categories for filtering and reporting
 */
export const AUDIT_CATEGORIES = {
  AUTH: 'auth',
  USER: 'user',
  MEMBER: 'member',
  ROLE: 'role',
  ORG: 'org',
  ACTION: 'action',
  ENVIRONMENT: 'environment',
  VARIABLE: 'variable',
  CONNECTION: 'connection',
  TEST: 'test',
  SUITE: 'suite',
  RUN: 'run',
  SETUP: 'setup',
  BINDING: 'binding',
  ASSISTANT: 'assistant',
  KNOWLEDGE: 'knowledge',
  EXPORT: 'export',
  COMPLIANCE: 'compliance',
  SYSTEM: 'system',
} as const;

export type AuditCategory = typeof AUDIT_CATEGORIES[keyof typeof AUDIT_CATEGORIES];

/**
 * Audit event severities
 */
export const AUDIT_SEVERITIES = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

export type AuditSeverity = typeof AUDIT_SEVERITIES[keyof typeof AUDIT_SEVERITIES];

/**
 * Common audit actions
 */
export const AUDIT_ACTIONS = {
  // Auth
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  LOGIN_FAILED: 'auth.login_failed',
  TOKEN_REFRESH: 'auth.token_refresh',

  // User/Member
  MEMBER_INVITED: 'member.invited',
  MEMBER_JOINED: 'member.joined',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_ROLE_CHANGED: 'member.role_changed',

  // Role/Permission
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  PERMISSION_GRANTED: 'permission.granted',
  PERMISSION_REVOKED: 'permission.revoked',

  // Organization
  ORG_CREATED: 'org.created',
  ORG_UPDATED: 'org.updated',
  ORG_DELETED: 'org.deleted',
  ORG_SETTINGS_CHANGED: 'org.settings_changed',

  // Resources (generic CRUD)
  RESOURCE_CREATED: 'resource.created',
  RESOURCE_UPDATED: 'resource.updated',
  RESOURCE_DELETED: 'resource.deleted',
  RESOURCE_VIEWED: 'resource.viewed',

  // Variables/Secrets
  VARIABLE_CREATED: 'variable.created',
  VARIABLE_UPDATED: 'variable.updated',
  VARIABLE_DELETED: 'variable.deleted',
  VARIABLE_REVEALED: 'variable.revealed',

  // Connections
  CONNECTION_CREATED: 'connection.created',
  CONNECTION_UPDATED: 'connection.updated',
  CONNECTION_DELETED: 'connection.deleted',
  CONNECTION_APIKEY_SET: 'connection.apikey_set',
  CONNECTION_APIKEY_DELETED: 'connection.apikey_deleted',

  // Test runs
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',

  // Export/Compliance
  EXPORT_REQUESTED: 'export.requested',
  EXPORT_COMPLETED: 'export.completed',
  AUDIT_EXPORTED: 'audit.exported',
  COMPLIANCE_REPORT: 'compliance.report',

  // Access
  ACCESS_DENIED: 'access.denied',
  PERMISSION_CHECK_FAILED: 'permission.check_failed',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS] | string;

/**
 * Helper type for creating audit log entries
 */
export interface CreateAuditLogInput {
  orgId: string;
  actor: {
    sub?: string;
    email?: string;
    name?: string;
    role?: string;
    type?: 'user' | 'system' | 'api_key' | 'service';
  };
  action: AuditAction;
  category: AuditCategory;
  severity?: AuditSeverity;
  resource?: {
    type: string;
    id: string;
    name?: string;
    collection?: string;
  };
  before?: {
    collection?: string;
    documentId?: string;
    data?: Record<string, any>;
  };
  after?: {
    collection?: string;
    documentId?: string;
    data?: Record<string, any>;
  };
  changedFields?: string[];
  details?: Record<string, any>;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
    correlationId?: string;
    source?: string;
  };
  compliance?: {
    retentionDays?: number;
    gdprRelevant?: boolean;
  };
}

// ── Service interfaces ───────────────────────────────────────────────────────

/**
 * Request context for audit logging
 */
export interface AuditContext {
  orgId: string;
  userSub?: string;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
  source?: 'web' | 'api' | 'cli' | 'webhook' | 'system';
}

/**
 * Build audit context from a Fastify request
 *
 * Usage:
 *   const ctx = buildAuditContextFromRequest(req, orgId);
 *   await createAuditLog(ctx, 'resource.action', { category: 'test', ... });
 */
export function buildAuditContextFromRequest(req: any, orgId: string): AuditContext {
  return {
    orgId,
    userSub: req.user?.sub,
    userEmail: req.user?.email,
    userName: req.user?.name,
    source: 'api',
    requestId: req.id,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
  };
}

/**
 * Options for creating an audit log entry
 */
export interface AuditOptions {
  category: AuditCategory;
  severity?: AuditSeverity;
  resource?: {
    type: string;
    id: string;
    name?: string;
    collection?: string;
  };
  before?: Record<string, any>;
  after?: Record<string, any>;
  details?: Record<string, any>;
  compliance?: {
    retentionDays?: number;
    gdprRelevant?: boolean;
  };
}

/**
 * Fields to exclude from snapshots (sensitive data)
 */
const EXCLUDED_FIELDS = [
  'password',
  'secret',
  'apiKey',
  'token',
  'ciphertext',
  'iv',
  'tag',
  'enc',
  '__v',
];

/**
 * Sanitize a document for audit logging
 * Removes sensitive fields and limits size
 */
function sanitizeDocument(doc: Record<string, any> | null | undefined): Record<string, any> | undefined {
  if (!doc) return undefined;

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(doc)) {
    // Skip excluded fields
    if (EXCLUDED_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Handle nested objects
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeDocument(value);
    } else if (Array.isArray(value)) {
      // Limit array size and sanitize elements
      sanitized[key] = value.slice(0, 100).map(item =>
        typeof item === 'object' ? sanitizeDocument(item) : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Detect changed fields between two documents
 */
function detectChangedFields(
  before: Record<string, any> | undefined,
  after: Record<string, any> | undefined
): string[] {
  const changedFields: string[] = [];

  if (!before && !after) return changedFields;
  if (!before) return Object.keys(after || {});
  if (!after) return Object.keys(before);

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (EXCLUDED_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      continue;
    }

    const beforeVal = before[key];
    const afterVal = after[key];

    // Simple comparison (handles primitives and dates)
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

/**
 * Generate integrity hash for tamper detection
 */
function generateIntegrityHash(data: {
  orgId: string;
  actor: any;
  action: string;
  resource: any;
  timestamp: Date;
  details: any;
}): string {
  const hashData = JSON.stringify({
    orgId: data.orgId,
    actor: data.actor,
    action: data.action,
    resource: data.resource,
    timestamp: data.timestamp,
    details: data.details,
  });
  return crypto.createHash('sha256').update(hashData).digest('hex');
}

/**
 * Hash IP address for privacy
 */
function hashIpAddress(ipAddress: string): string {
  return crypto
    .createHash('sha256')
    .update(ipAddress + (process.env.AUDIT_SALT || 'default-salt'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  context: AuditContext,
  action: AuditAction,
  options: AuditOptions
): Promise<void> {
  try {
    // Sanitize before/after documents
    const sanitizedBefore = sanitizeDocument(options.before);
    const sanitizedAfter = sanitizeDocument(options.after);

    // Detect changed fields
    const changedFields = detectChangedFields(sanitizedBefore, sanitizedAfter);

    // Get actor information
    const actorInfo: CreateAuditLogInput['actor'] = {
      sub: context.userSub,
      email: context.userEmail,
      name: context.userName,
      role: context.userRole,
      type: context.source === 'system' ? 'system' : 'user',
    };

    // If we have userSub but missing email/name, try to get from member
    if (context.userSub && (!context.userEmail || !context.userName)) {
      try {
        const [member] = await db
          .select()
          .from(members)
          .where(and(
            eq(members.orgId, context.orgId),
            eq(members.userSub, context.userSub)
          ))
          .limit(1);

        if (member) {
          actorInfo.email = actorInfo.email || member.email || undefined;
          actorInfo.role = actorInfo.role || member.role || undefined;
        }
      } catch {
        // Ignore errors
      }
    }

    const now = new Date();

    // Compute integrity hash
    const integrityHash = generateIntegrityHash({
      orgId: context.orgId,
      actor: actorInfo,
      action,
      resource: options.resource,
      timestamp: now,
      details: options.details,
    });

    // Hash IP address for privacy
    let ipAddressHash: string | undefined;
    if (context.ipAddress) {
      ipAddressHash = hashIpAddress(context.ipAddress);
    }

    // Create the audit log entry
    await db.insert(auditLogs).values({
      orgId: context.orgId,
      actor: actorInfo,
      action,
      category: options.category,
      severity: options.severity || 'info',
      resource: options.resource,
      before: sanitizedBefore ? {
        collection: options.resource?.collection,
        documentId: options.resource?.id,
        data: sanitizedBefore,
      } : undefined,
      after: sanitizedAfter ? {
        collection: options.resource?.collection,
        documentId: options.resource?.id,
        data: sanitizedAfter,
      } : undefined,
      changedFields,
      details: options.details,
      metadata: {
        ipAddress: context.ipAddress,
        ipAddressHash,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        requestId: context.requestId || uuidv4(),
        correlationId: context.correlationId,
        source: context.source,
      },
      compliance: options.compliance,
      integrityHash,
      timestamp: now,
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break operations
    console.error('[AuditService] Failed to create audit log:', error);
  }
}

/**
 * Create a correlation ID for grouping related audit events
 */
export function createCorrelationId(): string {
  return uuidv4();
}

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  orgId: string;
  startDate?: Date;
  endDate?: Date;
  categories?: AuditCategory[];
  actions?: string[];
  actorSub?: string;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity[];
  correlationId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'timestamp' | 'action' | 'category';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Build WHERE conditions from audit query options
 */
function buildAuditWhereConditions(options: {
  orgId: string;
  startDate?: Date;
  endDate?: Date;
  categories?: AuditCategory[];
  actions?: string[];
  actorSub?: string;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity[];
  correlationId?: string;
  search?: string;
}) {
  const conditions = [eq(auditLogs.orgId, options.orgId)];

  // Date range
  if (options.startDate) {
    conditions.push(gte(auditLogs.timestamp, options.startDate));
  }
  if (options.endDate) {
    conditions.push(lte(auditLogs.timestamp, options.endDate));
  }

  // Category filter
  if (options.categories && options.categories.length > 0) {
    conditions.push(inArray(auditLogs.category, options.categories));
  }

  // Action filter
  if (options.actions && options.actions.length > 0) {
    conditions.push(inArray(auditLogs.action, options.actions));
  }

  // Actor filter (JSONB field)
  if (options.actorSub) {
    conditions.push(sql`${auditLogs.actor}->>'sub' = ${options.actorSub}`);
  }

  // Resource filters (JSONB fields)
  if (options.resourceType) {
    conditions.push(sql`${auditLogs.resource}->>'type' = ${options.resourceType}`);
  }
  if (options.resourceId) {
    conditions.push(sql`${auditLogs.resource}->>'id' = ${options.resourceId}`);
  }

  // Severity filter
  if (options.severity && options.severity.length > 0) {
    conditions.push(inArray(auditLogs.severity, options.severity));
  }

  // Correlation ID (JSONB field)
  if (options.correlationId) {
    conditions.push(sql`${auditLogs.metadata}->>'correlationId' = ${options.correlationId}`);
  }

  // Text search
  if (options.search) {
    conditions.push(
      or(
        ilike(auditLogs.action, `%${options.search}%`),
        sql`${auditLogs.resource}->>'name' ILIKE ${'%' + options.search + '%'}`,
        sql`${auditLogs.actor}->>'email' ILIKE ${'%' + options.search + '%'}`,
      )!
    );
  }

  return and(...conditions);
}

/**
 * Query audit logs with filtering and pagination
 */
export async function queryAuditLogs(options: AuditQueryOptions) {
  const {
    page = 1,
    limit = 50,
    sortBy = 'timestamp',
    sortOrder = 'desc',
  } = options;

  const whereClause = buildAuditWhereConditions(options);

  // Build sort
  const sortColumn = sortBy === 'action' ? auditLogs.action
    : sortBy === 'category' ? auditLogs.category
    : auditLogs.timestamp;
  const orderByClause = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  // Execute query with pagination
  const offset = (page - 1) * limit;

  const [logs, totalResult] = await Promise.all([
    db.select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(orderByClause)
      .offset(offset)
      .limit(limit),
    db.select({ count: count() })
      .from(auditLogs)
      .where(whereClause),
  ]);

  const total = totalResult[0].count;

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

/**
 * Get audit statistics for an organization
 */
export async function getAuditStatistics(orgId: string, startDate?: Date, endDate?: Date) {
  const conditions = [eq(auditLogs.orgId, orgId)];
  if (startDate) conditions.push(gte(auditLogs.timestamp, startDate));
  if (endDate) conditions.push(lte(auditLogs.timestamp, endDate));
  const whereClause = and(...conditions);

  const [byCategory, byAction, byActor, bySeverity, timeline] = await Promise.all([
    // Events by category
    db.select({
      category: auditLogs.category,
      count: count(),
    })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(auditLogs.category)
      .orderBy(desc(count())),

    // Top actions
    db.select({
      action: auditLogs.action,
      count: count(),
    })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(auditLogs.action)
      .orderBy(desc(count()))
      .limit(20),

    // Top actors
    db.select({
      sub: sql<string>`${auditLogs.actor}->>'sub'`,
      email: sql<string>`${auditLogs.actor}->>'email'`,
      count: count(),
    })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(
        sql`${auditLogs.actor}->>'sub'`,
        sql`${auditLogs.actor}->>'email'`
      )
      .orderBy(desc(count()))
      .limit(20),

    // Events by severity
    db.select({
      severity: auditLogs.severity,
      count: count(),
    })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(auditLogs.severity),

    // Timeline (events per day)
    db.select({
      date: sql<string>`date_trunc('day', ${auditLogs.timestamp})::date`,
      count: count(),
    })
      .from(auditLogs)
      .where(whereClause)
      .groupBy(sql`date_trunc('day', ${auditLogs.timestamp})::date`)
      .orderBy(asc(sql`date_trunc('day', ${auditLogs.timestamp})::date`))
      .limit(90),
  ]);

  return {
    byCategory: byCategory.map(r => ({ category: r.category, count: r.count })),
    byAction: byAction.map(r => ({ action: r.action, count: r.count })),
    byActor: byActor.map(r => ({ sub: r.sub, email: r.email, count: r.count })),
    bySeverity: bySeverity.map(r => ({ severity: r.severity, count: r.count })),
    timeline: timeline.map(r => ({
      date: typeof r.date === 'string' ? r.date : String(r.date),
      count: r.count,
    })),
  };
}

/**
 * Export audit logs for compliance
 */
export async function exportAuditLogs(
  options: AuditQueryOptions,
  format: 'json' | 'csv' = 'json',
  exportedBy: string
): Promise<{ data: string; filename: string; mimeType: string }> {
  // Build WHERE conditions for export (no pagination)
  const whereClause = buildAuditWhereConditions(options);

  const logs = await db.select()
    .from(auditLogs)
    .where(whereClause)
    .orderBy(desc(auditLogs.timestamp))
    .limit(10000); // Safety limit

  // Mark as exported
  if (logs.length > 0) {
    await db.update(auditLogs)
      .set({
        compliance: sql`jsonb_set(
          COALESCE(${auditLogs.compliance}, '{}'::jsonb),
          '{exportedAt}',
          to_jsonb(${new Date().toISOString()}::text)
        ) || jsonb_build_object('exportedBy', ${exportedBy}::text)`,
      })
      .where(inArray(auditLogs.id, logs.map(l => l.id)));
  }

  // Create audit log for the export itself
  await createAuditLog(
    {
      orgId: options.orgId,
      userSub: exportedBy,
      source: 'api',
    },
    'audit.exported',
    {
      category: 'compliance',
      details: {
        recordCount: logs.length,
        format,
        filters: {
          startDate: options.startDate,
          endDate: options.endDate,
          categories: options.categories,
          severity: options.severity,
          actions: options.actions,
          actorSub: options.actorSub,
          search: options.search,
        },
      },
    }
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'csv') {
    const headers = [
      'Timestamp',
      'Action',
      'Category',
      'Severity',
      'Actor Email',
      'Actor Sub',
      'Resource Type',
      'Resource ID',
      'Resource Name',
      'Changed Fields',
      'IP Address (Hash)',
      'User Agent',
      'Integrity Hash',
    ];

    const rows = logs.map(log => [
      log.timestamp?.toISOString() || '',
      log.action,
      log.category || '',
      log.severity || '',
      (log.actor as any)?.email || '',
      (log.actor as any)?.sub || '',
      (log.resource as any)?.type || '',
      (log.resource as any)?.id || '',
      (log.resource as any)?.name || '',
      (log.changedFields || []).join('; '),
      (log.metadata as any)?.ipAddressHash || '',
      (log.metadata as any)?.userAgent || '',
      log.integrityHash || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return {
      data: csvContent,
      filename: `audit-export-${timestamp}.csv`,
      mimeType: 'text/csv',
    };
  }

  // JSON format
  return {
    data: JSON.stringify({
      exportedAt: new Date().toISOString(),
      exportedBy,
      recordCount: logs.length,
      logs: logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        action: log.action,
        category: log.category,
        severity: log.severity,
        actor: log.actor,
        resource: log.resource,
        before: log.before,
        after: log.after,
        changedFields: log.changedFields,
        details: log.details,
        metadata: {
          ipAddressHash: (log.metadata as any)?.ipAddressHash,
          userAgent: (log.metadata as any)?.userAgent,
          source: (log.metadata as any)?.source,
          correlationId: (log.metadata as any)?.correlationId,
        },
        integrityHash: log.integrityHash,
      })),
    }, null, 2),
    filename: `audit-export-${timestamp}.json`,
    mimeType: 'application/json',
  };
}

/**
 * Get a single audit log entry by ID
 */
export async function getAuditLogById(orgId: string, logId: string) {
  const [log] = await db.select()
    .from(auditLogs)
    .where(and(eq(auditLogs.id, logId), eq(auditLogs.orgId, orgId)))
    .limit(1);
  return log ?? null;
}

/**
 * Get related audit logs by correlation ID
 */
export async function getRelatedAuditLogs(orgId: string, correlationId: string) {
  return db.select()
    .from(auditLogs)
    .where(and(
      eq(auditLogs.orgId, orgId),
      sql`${auditLogs.metadata}->>'correlationId' = ${correlationId}`
    ))
    .orderBy(asc(auditLogs.timestamp));
}

/**
 * Get audit history for a specific resource
 */
export async function getResourceAuditHistory(
  orgId: string,
  resourceType: string,
  resourceId: string,
  limit = 100
) {
  return db.select()
    .from(auditLogs)
    .where(and(
      eq(auditLogs.orgId, orgId),
      sql`${auditLogs.resource}->>'type' = ${resourceType}`,
      sql`${auditLogs.resource}->>'id' = ${resourceId}`
    ))
    .orderBy(desc(auditLogs.timestamp))
    .limit(limit);
}
