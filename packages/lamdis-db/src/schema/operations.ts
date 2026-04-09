import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const hostedActionInvocations = pgTable('hosted_action_invocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  actionKey: text('action_key').notNull(),
  providerKey: text('provider_key'),
  mode: text('mode'), // 'lamdis','direct'
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  durationMs: integer('duration_ms'),
  statusCode: integer('status_code'),
  success: boolean('success'),
  prompt: text('prompt'),
  requestSize: integer('request_size'),
  responseSize: integer('response_size'),
  errorMessage: text('error_message'),
}, (t) => [
  index('hosted_action_invocations_org_id_idx').on(t.orgId),
  index('hosted_action_invocations_org_started_idx').on(t.orgId, t.startedAt),
  index('hosted_action_invocations_action_started_idx').on(t.actionKey, t.startedAt),
  index('hosted_action_invocations_success_idx').on(t.success),
]);

export const invocationLogs = pgTable('invocation_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  orgSlug: text('org_slug'),
  actionKey: text('action_key'),
  providerKey: text('provider_key'),
  route: text('route'),
  source: text('source').notNull(), // 'hosted','gateway-a2a','gateway-mcp'
  requestId: text('request_id'),
  idempotencyKey: text('idempotency_key'),
  status: text('status').notNull(), // 'success','failure'
  statusCode: integer('status_code'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('invocation_logs_org_id_idx').on(t.orgId),
  index('invocation_logs_org_slug_idx').on(t.orgSlug),
  index('invocation_logs_source_idx').on(t.source),
  index('invocation_logs_idempotency_key_idx').on(t.idempotencyKey),
  index('invocation_logs_status_idx').on(t.status),
  index('invocation_logs_created_at_idx').on(t.createdAt),
]);

export const usage = pgTable('usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  runId: text('run_id').notNull().unique(),
  suiteId: text('suite_id').notNull(),
  envId: text('env_id'),
  connectionKey: text('connection_key'),
  status: text('status'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  durationSec: integer('duration_sec'),
  itemsCount: integer('items_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('usage_org_id_idx').on(t.orgId),
  index('usage_suite_id_idx').on(t.suiteId),
  index('usage_finished_at_idx').on(t.finishedAt),
]);
