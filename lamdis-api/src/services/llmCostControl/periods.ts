import type { LlmBudgetPeriod } from '@lamdis/db/schema';

/**
 * Compute the start of the current period for a given period type, in UTC.
 * Used as the bucket key for llm_usage_rollups.
 *
 * - 'monthly'  → first second of the current calendar month, UTC
 * - 'daily'    → midnight UTC today
 * - 'lifetime' → epoch (single bucket per scope)
 */
export function periodStart(period: LlmBudgetPeriod, now: Date = new Date()): Date {
  switch (period) {
    case 'monthly':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    case 'daily':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    case 'lifetime':
      return new Date(0);
  }
}

export const ALL_PERIODS: LlmBudgetPeriod[] = ['monthly', 'daily', 'lifetime'];
