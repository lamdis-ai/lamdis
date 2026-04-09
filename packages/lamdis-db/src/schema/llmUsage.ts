import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  bigint,
  boolean,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/**
 * One row per LLM call. Captures attribution (org / outcome / agent task / user),
 * the model used, token counts, and computed cost. Used for the events log,
 * dashboards, and as the source of truth for rebuilding rollups if needed.
 */
export const llmUsageEvents = pgTable('llm_usage_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  outcomeInstanceId: uuid('outcome_instance_id'),
  outcomeTypeId: uuid('outcome_type_id'),
  agentTaskId: uuid('agent_task_id'),
  userId: text('user_id'),
  serviceKey: text('service_key').notNull(), // 'agentPlanner','checkEvaluator','assistant',...
  modelId: text('model_id').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 14, scale: 8 }).notNull().default('0'),
  durationMs: integer('duration_ms'),
  status: text('status').notNull(), // 'success' | 'error' | 'blocked'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('llm_usage_events_org_created_idx').on(t.orgId, t.createdAt),
  index('llm_usage_events_org_service_idx').on(t.orgId, t.serviceKey),
  index('llm_usage_events_outcome_instance_idx').on(t.outcomeInstanceId),
  index('llm_usage_events_outcome_type_idx').on(t.outcomeTypeId),
  index('llm_usage_events_agent_task_idx').on(t.agentTaskId),
  index('llm_usage_events_model_idx').on(t.modelId),
]);

/**
 * Budget configuration. A single org can have many budgets at different scopes.
 * scope = 'org'              → org-wide cap (scopeRefId is null)
 * scope = 'outcome_type'     → cap per outcomeType (scopeRefId = outcomeTypeId)
 * scope = 'outcome_instance' → cap per single instance (scopeRefId = outcomeInstanceId)
 * scope = 'agent_task'       → cap per single agent task (scopeRefId = agentTaskId)
 * scope = 'model'            → cap per model id (scopeRefId = modelId)
 */
export const llmBudgets = pgTable('llm_budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  scope: text('scope').notNull(),
  scopeRefId: text('scope_ref_id'), // null for org-wide
  periodType: text('period_type').notNull(), // 'monthly' | 'daily' | 'lifetime'
  limitUsd: numeric('limit_usd', { precision: 14, scale: 4 }).notNull(),
  warningThresholdPct: integer('warning_threshold_pct').notNull().default(80),
  enforcementMode: text('enforcement_mode').notNull().default('block'), // 'block' | 'warn'
  enabled: boolean('enabled').notNull().default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('llm_budgets_org_scope_uq').on(t.orgId, t.scope, t.scopeRefId, t.periodType),
  index('llm_budgets_org_idx').on(t.orgId),
]);

/**
 * Pre-aggregated usage per (org, scope, scopeRefId, periodType, periodStart).
 * Updated atomically (UPSERT) on every recordUsage() call. Reads from this table
 * are how the budget gate stays cheap on hot paths.
 */
export const llmUsageRollups = pgTable('llm_usage_rollups', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  scope: text('scope').notNull(),
  scopeRefId: text('scope_ref_id'),
  periodType: text('period_type').notNull(), // 'monthly' | 'daily' | 'lifetime'
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  totalInputTokens: bigint('total_input_tokens', { mode: 'number' }).notNull().default(0),
  totalOutputTokens: bigint('total_output_tokens', { mode: 'number' }).notNull().default(0),
  totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),
  totalCostUsd: numeric('total_cost_usd', { precision: 16, scale: 8 }).notNull().default('0'),
  callCount: integer('call_count').notNull().default(0),
  lastWarningSentAt: timestamp('last_warning_sent_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('llm_usage_rollups_uq').on(
    t.orgId, t.scope, t.scopeRefId, t.periodType, t.periodStart,
  ),
  index('llm_usage_rollups_org_idx').on(t.orgId),
  index('llm_usage_rollups_lookup_idx').on(t.orgId, t.scope, t.periodType, t.periodStart),
]);

export type LlmUsageEvent = typeof llmUsageEvents.$inferSelect;
export type NewLlmUsageEvent = typeof llmUsageEvents.$inferInsert;
export type LlmBudget = typeof llmBudgets.$inferSelect;
export type NewLlmBudget = typeof llmBudgets.$inferInsert;
export type LlmUsageRollup = typeof llmUsageRollups.$inferSelect;

export type LlmBudgetScope =
  | 'org'
  | 'outcome_type'
  | 'outcome_instance'
  | 'agent_task'
  | 'model';

export type LlmBudgetPeriod = 'monthly' | 'daily' | 'lifetime';
