import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Agent Schedules — per-instance adaptive scheduling
// ---------------------------------------------------------------------------
export const agentSchedules = pgTable('agent_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id').notNull(),
  scheduleType: text('schedule_type').notNull().default('polling'), // 'polling' | 'cron' | 'adaptive' | 'one_shot'
  intervalMs: integer('interval_ms').default(30000), // default 30s
  cronExpression: text('cron_expression'), // for cron type (e.g. '0 9 * * 1' = every Monday 9am)
  adaptiveConfig: jsonb('adaptive_config').$type<{
    baseIntervalMs: number;
    minIntervalMs: number;
    maxIntervalMs: number;
    increaseOnActivity?: boolean;
    decreaseOnIdle?: boolean;
    adjustmentHistory?: Array<{
      from: number;
      to: number;
      reason: string;
      at: string;
    }>;
  }>(),
  enabled: boolean('enabled').default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  consecutiveNoOps: integer('consecutive_no_ops').default(0),
  lastRunResult: jsonb('last_run_result').$type<{
    hadActivity: boolean;
    tasksExecuted?: number;
    evidenceReceived?: number;
    durationMs?: number;
    error?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('agent_schedules_org_id_idx').on(t.orgId),
  index('agent_schedules_instance_idx').on(t.outcomeInstanceId),
  index('agent_schedules_next_run_idx').on(t.nextRunAt),
  index('agent_schedules_enabled_next_idx').on(t.enabled, t.nextRunAt),
]);
