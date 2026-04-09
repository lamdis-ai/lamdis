/**
 * Attribution context that MUST accompany every Bedrock invocation so we can
 * track cost back to the org / outcome / agent task / user that caused it.
 *
 * `orgId` and `serviceKey` are required. The optional fields enable scoped
 * budget enforcement (per-outcome-type, per-instance, per-agent-task budgets).
 *
 * Threading this through every call site is intentional: a missing meterContext
 * is a compile error, not a silent "unattributed" fallback.
 */
export interface MeterContext {
  orgId: string;
  /** Stable identifier for the calling service, e.g. 'agentPlanner', 'assistant', 'checkEvaluator' */
  serviceKey: string;
  outcomeInstanceId?: string;
  outcomeTypeId?: string;
  agentTaskId?: string;
  userId?: string;
}

/**
 * Token usage extracted from a Bedrock response. All counts default to 0 if
 * the upstream response did not include them (e.g. an error mid-stream).
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export type LlmCallStatus = 'success' | 'error' | 'blocked';

export interface RecordUsageInput {
  ctx: MeterContext;
  modelId: string;
  usage: TokenUsage;
  durationMs: number;
  status: LlmCallStatus;
  errorMessage?: string;
}
