import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  llmBudgets,
  llmUsageRollups,
  type LlmBudget,
  type LlmBudgetPeriod,
  type LlmBudgetScope,
  type LlmUsageRollup,
} from '@lamdis/db/schema';
import type { MeterContext } from './types.js';
import { BudgetExceededError } from './errors.js';
import { periodStart } from './periods.js';
import { getCachedRollupCost, setCachedRollupCost } from './rollupCache.js';
import { maybeSendBudgetWarning } from './alertService.js';

interface ScopeRef {
  scope: LlmBudgetScope;
  scopeRefId: string | null;
}

/**
 * Build the list of (scope, scopeRefId) tuples that this call is subject to.
 * Mirrors meterService.attributionScopes — both must agree on what counts.
 */
function applicableScopes(ctx: MeterContext, modelId: string): ScopeRef[] {
  const out: ScopeRef[] = [
    { scope: 'org', scopeRefId: null },
    { scope: 'model', scopeRefId: modelId },
  ];
  if (ctx.outcomeTypeId) out.push({ scope: 'outcome_type', scopeRefId: ctx.outcomeTypeId });
  if (ctx.outcomeInstanceId) out.push({ scope: 'outcome_instance', scopeRefId: ctx.outcomeInstanceId });
  if (ctx.agentTaskId) out.push({ scope: 'agent_task', scopeRefId: ctx.agentTaskId });
  return out;
}

/**
 * Load all enabled budgets that match any of the applicable scopes for this call.
 * One round-trip per scope (small N) — could be batched but isn't worth the
 * SQL complexity at this scale.
 */
async function loadActiveBudgets(orgId: string, scopes: ScopeRef[]): Promise<LlmBudget[]> {
  const rows = await db
    .select()
    .from(llmBudgets)
    .where(and(eq(llmBudgets.orgId, orgId), eq(llmBudgets.enabled, true)));

  return rows.filter((b) =>
    scopes.some(
      (s) =>
        s.scope === b.scope &&
        ((s.scopeRefId === null && b.scopeRefId === null) || s.scopeRefId === b.scopeRefId),
    ),
  );
}

async function readRollupCost(
  orgId: string,
  scope: LlmBudgetScope,
  scopeRefId: string | null,
  period: LlmBudgetPeriod,
): Promise<number> {
  const start = periodStart(period);
  const cached = getCachedRollupCost(orgId, scope, scopeRefId, period, start);
  if (cached !== undefined) return cached;

  const where =
    scopeRefId === null
      ? and(
          eq(llmUsageRollups.orgId, orgId),
          eq(llmUsageRollups.scope, scope),
          isNull(llmUsageRollups.scopeRefId),
          eq(llmUsageRollups.periodType, period),
          eq(llmUsageRollups.periodStart, start),
        )
      : and(
          eq(llmUsageRollups.orgId, orgId),
          eq(llmUsageRollups.scope, scope),
          eq(llmUsageRollups.scopeRefId, scopeRefId),
          eq(llmUsageRollups.periodType, period),
          eq(llmUsageRollups.periodStart, start),
        );

  const rows = await db.select().from(llmUsageRollups).where(where).limit(1);
  const total = rows[0] ? Number(rows[0].totalCostUsd) : 0;
  setCachedRollupCost(orgId, scope, scopeRefId, period, start, total);
  return total;
}

/**
 * Throws BudgetExceededError if any active budget for this call is at or
 * over 100% of its limit and configured to block. For budgets between the
 * warning threshold and 100% (or any block-mode budget that overflowed),
 * fires off a warning notification (debounced).
 *
 * Always runs *before* the Bedrock call. Reads from the rollup cache so
 * the hot path stays sub-millisecond.
 */
export async function assertBudget(ctx: MeterContext, modelId: string): Promise<void> {
  const scopes = applicableScopes(ctx, modelId);
  let budgets: LlmBudget[];
  try {
    budgets = await loadActiveBudgets(ctx.orgId, scopes);
  } catch {
    // DB unavailable (tests, transient outage). Fail open — better to miss
    // enforcement on one call than break the user request.
    return;
  }
  if (budgets.length === 0) return;

  for (const budget of budgets) {
    const period = budget.periodType as LlmBudgetPeriod;
    const used = await readRollupCost(
      ctx.orgId,
      budget.scope as LlmBudgetScope,
      budget.scopeRefId,
      period,
    );
    const limit = Number(budget.limitUsd);
    if (limit <= 0) continue;
    const pct = (used / limit) * 100;

    if (pct >= 100 && budget.enforcementMode === 'block') {
      throw new BudgetExceededError({
        scope: budget.scope as LlmBudgetScope,
        scopeRefId: budget.scopeRefId,
        limitUsd: limit,
        usedUsd: used,
        periodType: period,
      });
    }

    if (pct >= budget.warningThresholdPct) {
      // Fire-and-forget; never let alerting block a request.
      void maybeSendBudgetWarning(budget, used);
    }
  }
}
