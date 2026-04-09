import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db.js';
import { llmUsageRollups, type LlmBudget, type LlmBudgetPeriod } from '@lamdis/db/schema';
import { periodStart } from './periods.js';

/**
 * In-process debounce so we don't hammer alerts on every call once a budget
 * crosses the warning threshold. Db-backed `last_warning_sent_at` is the
 * authoritative source across processes; this just avoids re-checking the row.
 */
const DEBOUNCE_MS = 5 * 60 * 1000;
const recentlyWarned = new Map<string, number>();

function key(budget: LlmBudget): string {
  return `${budget.id}`;
}

/**
 * Send a budget warning iff we haven't sent one for this budget recently.
 * Currently writes a structured log line; wire to NATS / email / activity
 * feed in alertingPlugin or whatever the org is configured to use.
 */
export async function maybeSendBudgetWarning(budget: LlmBudget, usedUsd: number): Promise<void> {
  const k = key(budget);
  const last = recentlyWarned.get(k);
  if (last && Date.now() - last < DEBOUNCE_MS) return;
  recentlyWarned.set(k, Date.now());

  const period = budget.periodType as LlmBudgetPeriod;
  const start = periodStart(period);

  // Stamp the rollup so cross-process consumers can see we already warned
  // this period. Best-effort.
  try {
    const where =
      budget.scopeRefId === null
        ? and(
            eq(llmUsageRollups.orgId, budget.orgId),
            eq(llmUsageRollups.scope, budget.scope),
            isNull(llmUsageRollups.scopeRefId),
            eq(llmUsageRollups.periodType, period),
            eq(llmUsageRollups.periodStart, start),
          )
        : and(
            eq(llmUsageRollups.orgId, budget.orgId),
            eq(llmUsageRollups.scope, budget.scope),
            eq(llmUsageRollups.scopeRefId, budget.scopeRefId),
            eq(llmUsageRollups.periodType, period),
            eq(llmUsageRollups.periodStart, start),
          );
    await db
      .update(llmUsageRollups)
      .set({ lastWarningSentAt: new Date() })
      .where(where);
  } catch {
    // non-critical
  }

  // eslint-disable-next-line no-console
  console.warn('[llmCostControl] budget warning', {
    orgId: budget.orgId,
    budgetId: budget.id,
    scope: budget.scope,
    scopeRefId: budget.scopeRefId,
    period: budget.periodType,
    limitUsd: Number(budget.limitUsd),
    usedUsd,
    pct: Number(((usedUsd / Number(budget.limitUsd)) * 100).toFixed(1)),
    enforcementMode: budget.enforcementMode,
  });
}

/** For tests. */
export function _clearWarnDebounce(): void {
  recentlyWarned.clear();
}
