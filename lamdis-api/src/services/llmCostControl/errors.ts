import type { LlmBudgetScope } from '@lamdis/db/schema';

/**
 * Thrown by the budget gate when an LLM call would exceed an active budget
 * configured with enforcementMode='block'. The Fastify error handler maps
 * this to HTTP 429 with a structured body.
 */
export class BudgetExceededError extends Error {
  readonly code = 'budget_exceeded';
  readonly statusCode = 429;
  readonly scope: LlmBudgetScope;
  readonly scopeRefId: string | null;
  readonly limitUsd: number;
  readonly usedUsd: number;
  readonly periodType: string;

  constructor(args: {
    scope: LlmBudgetScope;
    scopeRefId: string | null;
    limitUsd: number;
    usedUsd: number;
    periodType: string;
  }) {
    super(
      `LLM budget exceeded for scope=${args.scope}` +
        (args.scopeRefId ? `:${args.scopeRefId}` : '') +
        ` (used $${args.usedUsd.toFixed(4)} of $${args.limitUsd.toFixed(4)} ${args.periodType} limit)`,
    );
    this.name = 'BudgetExceededError';
    this.scope = args.scope;
    this.scopeRefId = args.scopeRefId;
    this.limitUsd = args.limitUsd;
    this.usedUsd = args.usedUsd;
    this.periodType = args.periodType;
  }

  toJSON() {
    return {
      error: this.code,
      scope: this.scope,
      scopeRefId: this.scopeRefId,
      limitUsd: this.limitUsd,
      usedUsd: this.usedUsd,
      periodType: this.periodType,
    };
  }
}
