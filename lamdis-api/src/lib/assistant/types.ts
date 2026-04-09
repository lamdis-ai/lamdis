/**
 * Invocation context passed to an AssistantModule.
 * NOTE: The assistant layer is intentionally *stateless* w.r.t. persistence.
 * It never mutates org data directly; it only calls a model to produce
 * structured intent (operations, questions, summaries, etc.).
 * Persisting / applying operations is handled in the web application layer.
 */
export interface AssistantInvocation {
  orgId: string;
  message: string;
  history: Array<{ role: 'user'|'assistant'; content: string }>;
  mode?: string; // e.g. 'builder' | 'integration'
  // Optional planning spec injected by the client/web tier to shape behavior
  planner?: any;
  // Optional tools config (e.g., web_search)
  tools?: any[];
}

/**
 * Result returned by a module.
 * - If `structured` is present it should already match the declared schema.
 * - `reply` is a fallback natural language string for lightweight modes.
 * - `raw` can contain the raw model payload for debug / logging.
 */
export interface AssistantModuleResult {
  reply?: string;                     // Natural language reply (fallback when no structured)
  structured?: any;                   // Structured schema-specific payload
  raw?: any;                          // Raw model response for debug
  error?: string;                     // Error if failed
}

/**
 * Pluggable assistant implementation. New modes (e.g. integration, support)
 * can be added without touching routing logic: just register them in
 * assistant/registry.ts.
 */
export interface AssistantModule {
  /** Unique mode id (exposed to clients) */
  id: string;
  /** Human readable description */
  description: string;
  /** Primary OpenAI (or other) model name */
  model?: string;
  /** Returns the system prompt string */
  systemPrompt(inv: AssistantInvocation): Promise<string> | string;
  /** Optional JSON schema for response_format (OpenAI beta) */
  jsonSchema?: any;
  /** Execute the module – handles calling the model + shaping output */
  run(inv: AssistantInvocation): Promise<AssistantModuleResult>;
}

export type AssistantRegistry = Record<string, AssistantModule>;
