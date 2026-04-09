/**
 * Bedrock model pricing table.
 *
 * Prices are USD per 1K tokens. Sourced from AWS Bedrock public pricing for
 * Anthropic Claude models. Update when AWS publishes new rates or when we
 * adopt new models.
 *
 * Unknown models return zero cost AND log a warning so they show up in
 * monitoring instead of silently going untracked.
 */

export interface BedrockModelPricing {
  inputPer1k: number;
  outputPer1k: number;
  /** Cost per 1K cached input tokens (prompt caching reads). Optional. */
  cachedInputPer1k?: number;
}

/**
 * Keyed by exact Bedrock model id (including region prefixes like `us.`).
 */
const PRICING: Record<string, BedrockModelPricing> = {
  // Claude Sonnet 4 (May 2025)
  'us.anthropic.claude-sonnet-4-20250514-v1:0': {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    cachedInputPer1k: 0.0003,
  },
  'anthropic.claude-sonnet-4-20250514-v1:0': {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    cachedInputPer1k: 0.0003,
  },

  // Claude Sonnet 4.6
  'us.anthropic.claude-sonnet-4-6': {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    cachedInputPer1k: 0.0003,
  },
  'anthropic.claude-sonnet-4-6': {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    cachedInputPer1k: 0.0003,
  },

  // Claude Haiku 4.5
  'anthropic.claude-haiku-4-5-20251001-v1:0': {
    inputPer1k: 0.001,
    outputPer1k: 0.005,
    cachedInputPer1k: 0.0001,
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
    inputPer1k: 0.001,
    outputPer1k: 0.005,
    cachedInputPer1k: 0.0001,
  },
};

const warnedUnknownModels = new Set<string>();

export function getModelPricing(modelId: string): BedrockModelPricing | undefined {
  return PRICING[modelId];
}

/**
 * Compute cost in USD for a single LLM call. Returns 0 (and logs once) for
 * unknown models so the call still records and shows up in dashboards.
 */
export function computeCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const pricing = PRICING[modelId];
  if (!pricing) {
    if (!warnedUnknownModels.has(modelId)) {
      warnedUnknownModels.add(modelId);
      // eslint-disable-next-line no-console
      console.warn(
        `[bedrockPricing] Unknown model id "${modelId}" — cost will be reported as $0. Add pricing to bedrockPricing.ts.`,
      );
    }
    return 0;
  }

  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const inputCost = (billableInputTokens / 1000) * pricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1k;
  const cachedCost =
    cachedInputTokens > 0 && pricing.cachedInputPer1k != null
      ? (cachedInputTokens / 1000) * pricing.cachedInputPer1k
      : 0;

  return inputCost + outputCost + cachedCost;
}

/**
 * Format a USD amount for display. Small amounts get extra precision so a
 * $0.0001 call doesn't render as "$0.00".
 */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(6)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
