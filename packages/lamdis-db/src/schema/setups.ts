import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { environments, workflowSuites } from './interactions';

// ---------------------------------------------------------------------------
// Setups — org-scoped setup/configuration records
// Dictates which assistant + environment to use for test/workflow execution
// ---------------------------------------------------------------------------
export const setups = pgTable('setups', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  environmentId: uuid('environment_id').notNull().references(() => environments.id),
  assistantId: uuid('assistant_id'),
  suiteId: uuid('suite_id').references(() => workflowSuites.id),
  config: jsonb('config').$type<{
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnFailure?: boolean;
    variables?: Record<string, unknown>;
  }>(),
  labels: jsonb('labels').$type<string[]>().default([]),
  isDefault: boolean('is_default').default(false),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('setups_org_key_unique').on(t.orgId, t.key),
  index('setups_org_id_idx').on(t.orgId),
  index('setups_org_suite_id_idx').on(t.orgId, t.suiteId),
  index('setups_org_environment_id_idx').on(t.orgId, t.environmentId),
]);
