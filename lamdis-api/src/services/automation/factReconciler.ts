/**
 * Fact Reconciler — maintains structured current state from evidence events.
 *
 * Uses LLM reasoning to determine how each evidence event maps to facts.
 * No heuristic regex — the LLM decides the canonical fact key, the value,
 * and whether it updates an existing fact or creates a new one.
 *
 * The FactStore is stored on outcomeInstances.currentFacts and fed into the agent's system prompt
 * so it always uses the latest corrected values.
 */

import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import type { MeterContext } from '../llmCostControl/index.js';

const RECONCILER_MODEL = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

export interface FactEntry {
  value: any;
  previousValues?: Array<{ value: any; changedAt: string }>;
  updatedAt: string;
  source: string; // 'user:chat' | 'agent:tool' | 'agent:conversation'
}

export type FactStore = Record<string, FactEntry>;

// ---------------------------------------------------------------------------
// LLM-based fact reconciliation
// ---------------------------------------------------------------------------

interface ReconcileResult {
  factKey: string | null;  // null = skip this event (not a fact)
  value: any;
}

/**
 * Use LLM to determine what fact an evidence event represents.
 * Returns the canonical fact key and extracted value,
 * or null factKey if the event is not a user-facing fact.
 */
async function reconcileWithLLM(
  eventType: string,
  payload: Record<string, unknown>,
  existingKeys: string[],
  meterContext: MeterContext,
): Promise<ReconcileResult> {
  // Fast skip for tool/system events — no LLM needed
  if (eventType.startsWith('tool.') || eventType.startsWith('input.') || eventType.startsWith('action.')) {
    return { factKey: null, value: null };
  }

  try {
    const response = await bedrockChatOnce({
      modelId: RECONCILER_MODEL,
      meterContext: { ...meterContext, serviceKey: 'factReconciler' },
      messages: [{
        role: 'user',
        content: `An evidence event was recorded. Determine what fact it represents.

Event type: "${eventType}"
Event payload: ${JSON.stringify(payload)}

Existing fact keys in the store: [${existingKeys.map(k => `"${k}"`).join(', ')}]

Rules:
1. If this event updates or corrects an EXISTING fact, return that exact existing key. For example if "vehicle.color" exists and this event corrects the color, use "vehicle.color".
2. If this is a NEW fact, return a short dot-separated key like "vehicle.color", "asking_price", "location", "vehicle.year", "vehicle.model".
3. If this event is NOT a meaningful fact about the objective (e.g. system status, tool metadata, confirmation of receipt), return null for factKey.
4. Extract the core value — strip metadata like confidence scores, timestamps, previous values.
5. Use simple, flat values when possible (string, number) not nested objects.

Return ONLY valid JSON:
{"factKey": "the.key" or null, "value": "the extracted value"}`,
      }],
      system: 'You reconcile evidence events into structured facts. Be concise. Respond ONLY with valid JSON. Prefer reusing existing keys over creating new ones when the event clearly updates the same concept.',
      maxTokens: 256,
      temperature: 0.0,
    });

    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return {
      factKey: parsed.factKey || null,
      value: parsed.value ?? null,
    };
  } catch (err: any) {
    console.error('[fact-reconciler] LLM reconciliation failed:', err?.message);
    // Skip this event — better to miss a fact than store it under the wrong key
    return { factKey: null, value: null };
  }
}

/**
 * Apply a single evidence event to the fact store.
 * Uses LLM reasoning to determine the fact key and value.
 * Returns a new FactStore (immutable).
 */
export async function applyFactUpdate(
  currentFacts: FactStore | null | undefined,
  eventType: string,
  payload: Record<string, unknown>,
  source: string,
  meterContext: MeterContext,
): Promise<FactStore> {
  const facts = { ...(currentFacts || {}) };
  const existingKeys = Object.keys(facts);

  const { factKey, value } = await reconcileWithLLM(eventType, payload, existingKeys, meterContext);
  if (!factKey) return facts;

  const existing = facts[factKey];
  const now = new Date().toISOString();

  // Build history
  const previousValues = existing?.previousValues ? [...existing.previousValues] : [];
  if (existing && existing.value !== undefined && existing.value !== value) {
    previousValues.push({ value: existing.value, changedAt: existing.updatedAt });
  }

  // Keep last 10 history entries
  while (previousValues.length > 10) previousValues.shift();

  facts[factKey] = {
    value,
    previousValues: previousValues.length > 0 ? previousValues : undefined,
    updatedAt: now,
    source,
  };

  return facts;
}

/**
 * Reconcile a full set of evidence events into a FactStore.
 * Events should be sorted by emittedAt ascending (oldest first).
 */
export async function reconcileAllFacts(
  events: Array<{ eventType: string; payload: Record<string, unknown>; eventSource: string; emittedAt: Date | string }>,
  meterContext: MeterContext,
): Promise<FactStore> {
  let facts: FactStore = {};
  for (const event of events) {
    facts = await applyFactUpdate(facts, event.eventType, event.payload as Record<string, unknown>, event.eventSource, meterContext);
  }
  return facts;
}

/**
 * Manually set a fact (from user UI or API).
 */
export function setFact(
  currentFacts: FactStore | null | undefined,
  key: string,
  value: any,
  source: string = 'user:manual',
): FactStore {
  const facts = currentFacts || {};
  const existing = facts[key];
  const now = new Date().toISOString();

  const previousValues = existing?.previousValues ? [...existing.previousValues] : [];
  if (existing && existing.value !== undefined) {
    previousValues.push({ value: existing.value, changedAt: existing.updatedAt });
  }
  while (previousValues.length > 10) previousValues.shift();

  return {
    ...facts,
    [key]: {
      value,
      previousValues: previousValues.length > 0 ? previousValues : undefined,
      updatedAt: now,
      source,
    },
  };
}

/**
 * Remove a fact.
 */
export function removeFact(currentFacts: FactStore | null | undefined, key: string): FactStore {
  const facts = currentFacts || {};
  const { [key]: _, ...rest } = facts;
  return rest;
}

/**
 * Format facts for the agent system prompt.
 */
export function formatFactsForPrompt(facts: FactStore): string {
  const entries = Object.entries(facts);
  if (entries.length === 0) return 'No facts collected yet.';

  return entries.map(([key, fact]) => {
    const label = key.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let line = `- ${label}: ${typeof fact.value === 'object' ? JSON.stringify(fact.value) : fact.value}`;
    if (fact.previousValues?.length) {
      const last = fact.previousValues[fact.previousValues.length - 1];
      line += ` (was: ${typeof last.value === 'object' ? JSON.stringify(last.value) : last.value})`;
    }
    return line;
  }).join('\n');
}
