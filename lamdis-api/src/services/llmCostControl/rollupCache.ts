import type { LlmBudgetPeriod, LlmBudgetScope } from '@lamdis/db/schema';

/**
 * Tiny in-process cache of rollup totals so the budget gate doesn't hit
 * Postgres on every Bedrock call. TTL is intentionally short — we'd rather
 * be slightly stale on the warning threshold than miss enforcement when
 * cache invalidation slips.
 */

interface CachedRollup {
  totalCostUsd: number;
  expiresAt: number;
}

const TTL_MS = 30_000;
const cache = new Map<string, CachedRollup>();

function key(
  orgId: string,
  scope: LlmBudgetScope,
  scopeRefId: string | null,
  period: LlmBudgetPeriod,
  periodStart: Date,
): string {
  return `${orgId}|${scope}|${scopeRefId ?? ''}|${period}|${periodStart.getTime()}`;
}

export function getCachedRollupCost(
  orgId: string,
  scope: LlmBudgetScope,
  scopeRefId: string | null,
  period: LlmBudgetPeriod,
  periodStart: Date,
): number | undefined {
  const k = key(orgId, scope, scopeRefId, period, periodStart);
  const hit = cache.get(k);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(k);
    return undefined;
  }
  return hit.totalCostUsd;
}

export function setCachedRollupCost(
  orgId: string,
  scope: LlmBudgetScope,
  scopeRefId: string | null,
  period: LlmBudgetPeriod,
  periodStart: Date,
  totalCostUsd: number,
): void {
  cache.set(key(orgId, scope, scopeRefId, period, periodStart), {
    totalCostUsd,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateRollupCache(
  orgId: string,
  scope: LlmBudgetScope,
  scopeRefId: string | null,
  period: LlmBudgetPeriod,
  periodStart: Date,
): void {
  cache.delete(key(orgId, scope, scopeRefId, period, periodStart));
}

/** For tests. */
export function _clearRollupCache(): void {
  cache.clear();
}
