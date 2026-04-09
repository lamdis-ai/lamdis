import { pgTable, text, uuid, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Moved from evidence.ts — audit logs are kept as-is
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  actor: jsonb('actor').$type<{
    sub?: string;
    email?: string;
    name?: string;
    role?: string;
    type?: string;
  }>(),
  action: text('action').notNull(),
  category: text('category'),
  severity: text('severity'), // 'info','warning','critical'
  resource: jsonb('resource').$type<{
    type?: string;
    id?: string;
    name?: string;
    collection?: string;
  }>(),
  before: jsonb('before').$type<{
    collection?: string;
    documentId?: string;
    data?: unknown;
  }>(),
  after: jsonb('after').$type<{
    collection?: string;
    documentId?: string;
    data?: unknown;
  }>(),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  details: jsonb('details'),
  metadata: jsonb('metadata').$type<{
    ipAddress?: string;
    ipAddressHash?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
    correlationId?: string;
    source?: string;
  }>(),
  compliance: jsonb('compliance').$type<{
    retentionDays?: number;
    gdprRelevant?: boolean;
    exportedAt?: string;
    exportedBy?: string;
  }>(),
  integrityHash: text('integrity_hash'),
  previousHash: text('previous_hash'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_logs_org_timestamp_idx').on(t.orgId, t.timestamp),
  index('audit_logs_org_category_timestamp_idx').on(t.orgId, t.category, t.timestamp),
  index('audit_logs_org_action_timestamp_idx').on(t.orgId, t.action, t.timestamp),
]);

// Evidence access logs — kept for compliance/audit trail
export const evidenceAccessLogs = pgTable('evidence_access_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  artifactKey: text('artifact_key'),
  artifactProvider: text('artifact_provider'),
  actorSub: text('actor_sub').notNull(),
  actorEmail: text('actor_email'),
  actorName: text('actor_name'),
  action: text('action').notNull(),
  jitTtlSeconds: integer('jit_ttl_seconds'),
  jitExpiresAt: timestamp('jit_expires_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  userAgent: text('user_agent'),
  ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('evidence_access_logs_org_ts_idx').on(t.orgId, t.ts),
  index('evidence_access_logs_org_resource_ts_idx').on(t.orgId, t.resourceId, t.ts),
  index('evidence_access_logs_org_actor_ts_idx').on(t.orgId, t.actorSub, t.ts),
]);
