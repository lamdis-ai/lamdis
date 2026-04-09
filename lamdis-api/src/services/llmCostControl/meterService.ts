import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { llmUsageEvents, llmUsageRollups, type LlmBudgetScope } from '@lamdis/db/schema';
import { computeCostUsd } from '../../lib/pricing/bedrockPricing.js';
import type { RecordUsageInput } from './types.js';
import { ALL_PERIODS, periodStart } from './periods.js';
import { invalidateRollupCache } from './rollupCache.js';

/**
 * Build the list of (scope, scopeRefId) tuples that this call should be
 * attributed to. Always includes 'org'; the others depend on which optional
 * fields the caller provided.
 */
function attributionScopes(
  ctx: RecordUsageInput['ctx'],
  modelId: string,
): Array<{ scope: LlmBudgetScope; scopeRefId: string | null }> {
  const out: Array<{ scope: LlmBudgetScope; scopeRefId: string | null }> = [
    { scope: 'org', scopeRefId: null },
    { scope: 'model', scopeRefId: modelId },
  ];
  if (ctx.outcomeTypeId) out.push({ scope: 'outcome_type', scopeRefId: ctx.outcomeTypeId });
  if (ctx.outcomeInstanceId) out.push({ scope: 'outcome_instance', scopeRefId: ctx.outcomeInstanceId });
  if (ctx.agentTaskId) out.push({ scope: 'agent_task', scopeRefId: ctx.agentTaskId });
  return out;
}

/**
 * Record a single LLM call: insert one row into llm_usage_events and atomically
 * upsert all applicable rollup buckets. Errors are caught and logged so a metering
 * failure never breaks the underlying LLM call (we'd rather lose a metric than
 * lose a user request).
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const { ctx, modelId, usage, durationMs, status, errorMessage } = input;
  const inputTokens = Math.max(0, usage.inputTokens || 0);
  const outputTokens = Math.max(0, usage.outputTokens || 0);
  const cachedInputTokens = Math.max(0, usage.cachedInputTokens || 0);
  const totalTokens = inputTokens + outputTokens;
  const costUsd = computeCostUsd(modelId, inputTokens, outputTokens, cachedInputTokens);

  try {
    await db.insert(llmUsageEvents).values({
      orgId: ctx.orgId,
      outcomeInstanceId: ctx.outcomeInstanceId ?? null,
      outcomeTypeId: ctx.outcomeTypeId ?? null,
      agentTaskId: ctx.agentTaskId ?? null,
      userId: ctx.userId ?? null,
      serviceKey: ctx.serviceKey,
      modelId,
      inputTokens,
      outputTokens,
      totalTokens,
      cachedInputTokens,
      costUsd: costUsd.toFixed(8),
      durationMs,
      status,
      errorMessage: errorMessage ?? null,
    } as any);

    // Don't roll up blocked calls — they didn't consume tokens.
    if (status === 'blocked') return;

    const scopes = attributionScopes(ctx, modelId);
    const now = new Date();

    // Upsert rollups for every (scope × period) combination. Atomic per row
    // via ON CONFLICT … DO UPDATE on the unique index.
    await Promise.all(
      scopes.flatMap((s) =>
        ALL_PERIODS.map(async (period) => {
          const start = periodStart(period, now);
          await db
            .insert(llmUsageRollups)
            .values({
              orgId: ctx.orgId,
              scope: s.scope,
              scopeRefId: s.scopeRefId,
              periodType: period,
              periodStart: start,
              totalInputTokens: inputTokens,
              totalOutputTokens: outputTokens,
              totalTokens,
              totalCostUsd: costUsd.toFixed(8),
              callCount: 1,
              updatedAt: now,
            } as any)
            .onConflictDoUpdate({
              target: [
                llmUsageRollups.orgId,
                llmUsageRollups.scope,
                llmUsageRollups.scopeRefId,
                llmUsageRollups.periodType,
                llmUsageRollups.periodStart,
              ],
              set: {
                totalInputTokens: sql`${llmUsageRollups.totalInputTokens} + ${inputTokens}` as any,
                totalOutputTokens: sql`${llmUsageRollups.totalOutputTokens} + ${outputTokens}` as any,
                totalTokens: sql`${llmUsageRollups.totalTokens} + ${totalTokens}` as any,
                totalCostUsd: sql`${llmUsageRollups.totalCostUsd} + ${costUsd.toFixed(8)}::numeric` as any,
                callCount: sql`${llmUsageRollups.callCount} + 1` as any,
                updatedAt: now,
              },
            });
          invalidateRollupCache(ctx.orgId, s.scope, s.scopeRefId, period, start);
        }),
      ),
    );
  } catch (err) {
    // Never fail the originating LLM call because metering failed.
    // eslint-disable-next-line no-console
    console.error('[meterService] recordUsage failed', {
      orgId: ctx.orgId,
      serviceKey: ctx.serviceKey,
      modelId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
