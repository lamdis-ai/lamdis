/**
 * Audit Log Constants
 *
 * Pure type definitions and constants for audit logging.
 * Extracted from the former Mongoose AuditLog model for use across the codebase.
 */

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
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  LOGIN_FAILED: 'auth.login_failed',
  TOKEN_REFRESH: 'auth.token_refresh',

  MEMBER_INVITED: 'member.invited',
  MEMBER_JOINED: 'member.joined',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_ROLE_CHANGED: 'member.role_changed',

  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  PERMISSION_GRANTED: 'permission.granted',
  PERMISSION_REVOKED: 'permission.revoked',

  ORG_CREATED: 'org.created',
  ORG_UPDATED: 'org.updated',
  ORG_DELETED: 'org.deleted',
  ORG_SETTINGS_CHANGED: 'org.settings_changed',

  RESOURCE_CREATED: 'resource.created',
  RESOURCE_UPDATED: 'resource.updated',
  RESOURCE_DELETED: 'resource.deleted',
  RESOURCE_VIEWED: 'resource.viewed',

  VARIABLE_CREATED: 'variable.created',
  VARIABLE_UPDATED: 'variable.updated',
  VARIABLE_DELETED: 'variable.deleted',
  VARIABLE_REVEALED: 'variable.revealed',

  CONNECTION_CREATED: 'connection.created',
  CONNECTION_UPDATED: 'connection.updated',
  CONNECTION_DELETED: 'connection.deleted',
  CONNECTION_APIKEY_SET: 'connection.apikey_set',
  CONNECTION_APIKEY_DELETED: 'connection.apikey_deleted',

  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',

  EXPORT_REQUESTED: 'export.requested',
  EXPORT_COMPLETED: 'export.completed',
  AUDIT_EXPORTED: 'audit.exported',
  COMPLIANCE_REPORT: 'compliance.report',

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
