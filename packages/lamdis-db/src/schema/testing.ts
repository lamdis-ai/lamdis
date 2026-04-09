import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, doublePrecision, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Test Suites — org-scoped test suite container
// ---------------------------------------------------------------------------
export const testSuites = pgTable('test_suites', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  tags: jsonb('tags').$type<string[]>().default([]),
  defaultEnvId: text('default_env_id'),
  defaultConnectionKey: text('default_connection_key'),
  defaultSetupId: uuid('default_setup_id'),
  selectedConnKeys: jsonb('selected_conn_keys').$type<string[]>().default([]),
  schedule: jsonb('schedule').$type<{
    enabled: boolean;
    periodMinutes: number;
    nextRunAt?: string;
    lastRunAt?: string;
  }>(),
  thresholds: jsonb('thresholds').$type<{
    passRate?: number;
    judgeScore?: number;
  }>(),
  labels: jsonb('labels').$type<string[]>().default([]),
  disabled: boolean('disabled').default(false),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('test_suites_org_name_unique').on(t.orgId, t.name),
  index('test_suites_org_id_idx').on(t.orgId),
]);

export type TestSuite = typeof testSuites.$inferSelect;
export type NewTestSuite = typeof testSuites.$inferInsert;

// ---------------------------------------------------------------------------
// Test Folders — organizational folders for tests
// ---------------------------------------------------------------------------
export const testFolders = pgTable('test_folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  parentId: uuid('parent_id'),
  color: text('color'),
  order: integer('order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('test_folders_org_name_parent_unique').on(t.orgId, t.name, t.parentId),
  index('test_folders_org_id_idx').on(t.orgId),
  index('test_folders_parent_id_idx').on(t.parentId),
]);

export type TestFolder = typeof testFolders.$inferSelect;
export type NewTestFolder = typeof testFolders.$inferInsert;

// ---------------------------------------------------------------------------
// Tests — individual test cases belonging to suites
// ---------------------------------------------------------------------------
export const tests = pgTable('tests', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  suiteId: uuid('suite_id').notNull().references(() => testSuites.id, { onDelete: 'cascade' }),
  suiteIds: jsonb('suite_ids').$type<string[]>().default([]),
  folderId: uuid('folder_id').references(() => testFolders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  target: jsonb('target').$type<Record<string, unknown>>(),
  personaId: text('persona_id'),
  script: text('script').notNull(),
  preSteps: jsonb('pre_steps').$type<unknown[]>().default([]),
  steps: jsonb('steps').$type<unknown[]>().default([]),
  variables: jsonb('variables').$type<Array<{
    key: string;
    value: string;
    description?: string;
  }>>().default([]),
  objective: text('objective'),
  iterate: boolean('iterate').default(true),
  maxTurns: integer('max_turns').default(8),
  minTurns: integer('min_turns').default(1),
  continueAfterPass: boolean('continue_after_pass').default(false),
  judgeConfig: jsonb('judge_config').$type<Record<string, unknown>>(),
  assertions: jsonb('assertions').$type<Array<{
    type: string;
    config?: unknown;
    severity?: 'info' | 'warn' | 'error';
  }>>().default([]),
  confirmations: jsonb('confirmations').$type<Array<{
    http?: {
      method?: string;
      url?: string;
      headersTpl?: unknown;
      bodyTpl?: unknown;
      expect?: unknown;
      retryPolicy?: unknown;
    };
  }>>().default([]),
  labels: jsonb('labels').$type<string[]>().default([]),
  disabled: boolean('disabled').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('tests_org_suite_name_unique').on(t.orgId, t.suiteId, t.name),
  index('tests_org_id_idx').on(t.orgId),
  index('tests_suite_id_idx').on(t.suiteId),
  index('tests_folder_id_idx').on(t.folderId),
  index('tests_org_suite_ids_idx').on(t.orgId),
]);

export type Test = typeof tests.$inferSelect;
export type NewTest = typeof tests.$inferInsert;

// ---------------------------------------------------------------------------
// Test Runs — execution records for test suites
// ---------------------------------------------------------------------------
export const testRuns = pgTable('test_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  suiteId: uuid('suite_id').notNull().references(() => testSuites.id, { onDelete: 'cascade' }),
  trigger: text('trigger').default('manual'), // manual, schedule, ci
  gitContext: jsonb('git_context').$type<{
    provider?: string;
    repo?: string;
    branch?: string;
    commit?: string;
    prNumber?: number;
    prTitle?: string;
  }>(),
  envId: text('env_id'),
  connectionKey: text('connection_key'),
  status: text('status').default('queued'), // queued, running, passed, failed, partial
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  totals: jsonb('totals').$type<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    error?: number;
    flaky?: number;
  }>(),
  summaryScore: doublePrecision('summary_score'),
  progress: jsonb('progress').$type<{
    completed: number;
    total: number;
    currentTest?: string;
  }>(),
  items: jsonb('items').$type<Array<{
    testId: string;
    status: 'queued' | 'running' | 'passed' | 'failed' | 'flaky' | 'skipped';
    transcript?: unknown[];
    messageCounts?: { user?: number; assistant?: number; total?: number };
    assertions?: Array<{
      type?: string;
      pass?: boolean;
      details?: unknown;
    }>;
    confirmations?: Array<{
      kind?: string;
      pass?: boolean;
      request?: unknown;
      responseRedacted?: unknown;
      retries?: number;
      details?: unknown;
    }>;
    timings?: unknown;
    artifacts?: unknown;
    error?: unknown;
  }>>().default([]),
  stopRequested: boolean('stop_requested').default(false),
  error: jsonb('error').$type<{ message?: string; stack?: string }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('test_runs_org_id_idx').on(t.orgId),
  index('test_runs_suite_id_idx').on(t.suiteId),
  index('test_runs_org_status_idx').on(t.orgId, t.status),
  index('test_runs_connection_key_idx').on(t.connectionKey),
  index('test_runs_org_created_idx').on(t.orgId, t.createdAt),
]);

export type TestRun = typeof testRuns.$inferSelect;
export type NewTestRun = typeof testRuns.$inferInsert;
