/**
 * LLM cost control for lamdis-runs.
 *
 * This is a small parallel implementation of the same gate + meter logic
 * that lives in lamdis-api/src/services/llmCostControl. Both services write
 * to the same shared tables (llm_usage_events, llm_budgets, llm_usage_rollups
 * defined in @lamdis/db/schema), so a budget set in one service is honored
 * by the other.
 *
 * Kept thin: only what lamdis-runs's two LLM call sites (judgeService,
 * extractionService) need. If logic diverges, extract a shared package
 * (currently not worth the publishing overhead).
 */

import { sql, and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@lamdis/db/connection';
import {
  llmUsageEvents,
  llmUsageRollups,
  llmBudgets,
  type LlmBudgetPeriod,
  type LlmBudgetScope,
} from '@lamdis/db/schema';

export interface MeterContext {
  orgId: string;
  serviceKey: string;
  outcomeInstanceId?: string;
  outcomeTypeId?: string;
  agentTaskId?: string;
  userId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export class BudgetExceededError extends Error {
  readonly code = 'budget_exceeded';
  readonly statusCode = 429;
  constructor(
    public readonly scope: LlmBudgetScope,
    public readonly scopeRefId: string | null,
    public readonly limitUsd: number,
    public readonly usedUsd: number,
    public readonly periodType: string,
  ) {
    super(
      `LLM budget exceeded for scope=${scope}` +
        (scopeRefId ? `:${scopeRefId}` : '') +
        ` (used $${usedUsd.toFixed(4)} of $${limitUsd.toFixed(4)} ${periodType} limit)`,
    );
  }
}

// ─── Pricing ─────────────────────────────────────────────────────────────

interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
  cachedInputPer1k?: number;
}

const PRICING: Record<string, ModelPricing> = {
  'us.anthropic.claude-sonnet-4-20250514-v1:0': { inputPer1k: 0.003, outputPer1k: 0.015, cachedInputPer1k: 0.0003 },
  'anthropic.claude-sonnet-4-20250514-v1:0': { inputPer1k: 0.003, outputPer1k: 0.015, cachedInputPer1k: 0.0003 },
  'us.anthropic.claude-sonnet-4-6': { inputPer1k: 0.003, outputPer1k: 0.015, cachedInputPer1k: 0.0003 },
  'anthropic.claude-sonnet-4-6': { inputPer1k: 0.003, outputPer1k: 0.015, cachedInputPer1k: 0.0003 },
  'anthropic.claude-haiku-4-5-20251001-v1:0': { inputPer1k: 0.001, outputPer1k: 0.005, cachedInputPer1k: 0.0001 },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': { inputPer1k: 0.001, outputPer1k: 0.005, cachedInputPer1k: 0.0001 },
};

function computeCostUsd(modelId: string, input: number, output: number, cached = 0): number {
  const p = PRICING[modelId];
  if (!p) return 0;
  const billable = Math.max(0, input - cached);
  return (
    (billable / 1000) * p.inputPer1k +
    (output / 1000) * p.outputPer1k +
    (cached > 0 && p.cachedInputPer1k ? (cached / 1000) * p.cachedInputPer1k : 0)
  );
}

// ─── Periods ─────────────────────────────────────────────────────────────

const ALL_PERIODS: LlmBudgetPeriod[] = ['monthly', 'daily', 'lifetime'];

function periodStart(period: LlmBudgetPeriod, now = new Date()): Date {
  switch (period) {
    case 'monthly':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case 'daily':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    case 'lifetime':
      return new Date(0);
  }
}

// ─── Scope attribution ───────────────────────────────────────────────────

interface ScopeRef {
  scope: LlmBudgetScope;
  scopeRefId: string | null;
}

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

// ─── Budget gate ─────────────────────────────────────────────────────────

export async function assertBudget(ctx: MeterContext, modelId: string): Promise<void> {
  let db;
  try {
    db = getDb();
  } catch {
    // No DB available (e.g. in unit tests). Skip the gate.
    return;
  }
  const scopes = applicableScopes(ctx, modelId);
  let budgets;
  try {
    budgets = await db
      .select()
      .from(llmBudgets)
      .where(and(eq(llmBudgets.orgId, ctx.orgId), eq(llmBudgets.enabled, true)));
  } catch {
    // DB error reading budgets — fail open. We'd rather miss enforcement than break the call.
    return;
  }

  const matching = budgets.filter((b) =>
    scopes.some(
      (s) =>
        s.scope === b.scope &&
        ((s.scopeRefId === null && b.scopeRefId === null) || s.scopeRefId === b.scopeRefId),
    ),
  );
  if (matching.length === 0) return;

  for (const budget of matching) {
    const period = budget.periodType as LlmBudgetPeriod;
    const start = periodStart(period);
    const where =
      budget.scopeRefId === null
        ? and(
            eq(llmUsageRollups.orgId, ctx.orgId),
            eq(llmUsageRollups.scope, budget.scope),
            isNull(llmUsageRollups.scopeRefId),
            eq(llmUsageRollups.periodType, period),
            eq(llmUsageRollups.periodStart, start),
          )
        : and(
            eq(llmUsageRollups.orgId, ctx.orgId),
            eq(llmUsageRollups.scope, budget.scope),
            eq(llmUsageRollups.scopeRefId, budget.scopeRefId),
            eq(llmUsageRollups.periodType, period),
            eq(llmUsageRollups.periodStart, start),
          );
    const rows = await db.select().from(llmUsageRollups).where(where).limit(1);
    const used = rows[0] ? Number(rows[0].totalCostUsd) : 0;
    const limit = Number(budget.limitUsd);
    if (limit <= 0) continue;
    if (used >= limit && budget.enforcementMode === 'block') {
      throw new BudgetExceededError(
        budget.scope as LlmBudgetScope,
        budget.scopeRefId,
        limit,
        used,
        period,
      );
    }
  }
}

// ─── Usage recording ─────────────────────────────────────────────────────

export interface RecordUsageInput {
  ctx: MeterContext;
  modelId: string;
  usage: TokenUsage;
  durationMs: number;
  status: 'success' | 'error' | 'blocked';
  errorMessage?: string;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  let db;
  try {
    db = getDb();
  } catch {
    // No DB available (e.g. unit tests). Skip metering.
    return;
  }
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

    if (status === 'blocked') return;

    const scopes = applicableScopes(ctx, modelId);
    const now = new Date();
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
                totalInputTokens: sql`${llmUsageRollups.totalInputTokens} + ${inputTokens}`,
                totalOutputTokens: sql`${llmUsageRollups.totalOutputTokens} + ${outputTokens}`,
                totalTokens: sql`${llmUsageRollups.totalTokens} + ${totalTokens}`,
                totalCostUsd: sql`${llmUsageRollups.totalCostUsd} + ${costUsd.toFixed(8)}::numeric`,
                callCount: sql`${llmUsageRollups.callCount} + 1`,
                updatedAt: now,
              },
            });
        }),
      ),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[lamdis-runs llmCostControl] recordUsage failed', {
      orgId: ctx.orgId,
      serviceKey: ctx.serviceKey,
      modelId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
