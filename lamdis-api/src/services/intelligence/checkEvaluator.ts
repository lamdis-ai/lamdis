/**
 * Check Evaluator
 *
 * Shared evaluation engine used by both the policy evaluator (event-driven)
 * for policy evaluation. Supports all check types:
 *
 * Content checks (evaluate against data):
 *   - judge:    LLM evaluates content against a rubric
 *   - includes: Keyword presence check
 *   - regex:    Pattern matching
 *   - json_path: Value at a JSON path
 *
 * Event checks (evaluate against event streams):
 *   - event_presence:     Specific events must exist
 *   - event_sequence:     Events must occur in order
 *   - timing:             Event must occur within time limit
 *   - confirmation_level: Minimum evidence strength
 */

import { bedrockChatOnce, type ChatMessage } from '../../lib/bedrockChat.js';
import type { MeterContext } from '../llmCostControl/index.js';

const DEFAULT_JUDGE_MODEL = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001-v1:0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalResult {
  pass: boolean;
  score?: number;
  reasoning: string;
  latencyMs: number;
}

export interface EvidenceEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  confirmationLevel?: string;
  emittedAt: string;
  sequenceNumber?: number;
  eventSource?: string;
}

// ---------------------------------------------------------------------------
// Content-based evaluators
// ---------------------------------------------------------------------------

export async function evaluateJudge(
  rubric: string,
  data: unknown,
  threshold: number,
  meterContext: MeterContext,
  scope?: string,
): Promise<EvalResult> {
  const start = Date.now();

  const systemPrompt = `You are a strict compliance evaluator. You must evaluate evidence data against a given rubric and return your assessment.

Return ONLY a valid JSON object with these exact fields:
{
  "pass": boolean,
  "score": number between 0 and 1,
  "reasoning": string explaining your evaluation
}

Do not include any other text before or after the JSON object.`;

  const userPrompt = `Evaluation Rubric:
${rubric}

Evidence Data to evaluate:
${JSON.stringify(data, null, 2).slice(0, 8000)}

Evaluate the evidence against the rubric. Be strict and thorough. Score between 0 (completely fails) and 1 (perfectly meets criteria).`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await bedrockChatOnce({
      modelId: DEFAULT_JUDGE_MODEL,
      messages,
      temperature: 0.1,
      maxTokens: 1024,
      meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'checkEvaluator.judge' },
    });

    const raw = response.trim().replace(/^```[a-zA-Z]*\n/, '').replace(/\n```\s*$/, '');
    const parsed = JSON.parse(raw);
    const score = Number(parsed.score) || 0;

    return {
      pass: score >= threshold && !!parsed.pass,
      score,
      reasoning: String(parsed.reasoning || ''),
      latencyMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      pass: false,
      reasoning: `Evaluation error: ${e?.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

export function evaluateIncludes(
  keywords: string[],
  data: unknown,
  matchMode: 'all' | 'any' = 'all',
): EvalResult {
  const start = Date.now();
  const text = JSON.stringify(data).toLowerCase();
  const found = keywords.filter(k => text.includes(k.toLowerCase()));
  const pass = matchMode === 'all' ? found.length === keywords.length : found.length > 0;
  return {
    pass,
    score: keywords.length > 0 ? found.length / keywords.length : 1,
    reasoning: pass
      ? `Found keywords: ${found.join(', ')}`
      : `Missing keywords: ${keywords.filter(k => !found.includes(k)).join(', ')}`,
    latencyMs: Date.now() - start,
  };
}

export function evaluateRegex(
  pattern: string,
  data: unknown,
  shouldMatch: boolean = true,
): EvalResult {
  const start = Date.now();
  const text = JSON.stringify(data);
  try {
    const regex = new RegExp(pattern, 'gi');
    const matches = text.match(regex) || [];
    const pass = shouldMatch ? matches.length > 0 : matches.length === 0;
    return {
      pass,
      reasoning: pass
        ? `Pattern ${shouldMatch ? 'matched' : 'did not match'} as expected`
        : `Pattern ${shouldMatch ? 'did not match' : 'matched'} unexpectedly`,
      latencyMs: Date.now() - start,
    };
  } catch (e: any) {
    return { pass: false, reasoning: `Invalid regex: ${e?.message}`, latencyMs: Date.now() - start };
  }
}

export function evaluateJsonPath(
  path: string,
  expected: unknown,
  data: unknown,
  operator: string = 'eq',
): EvalResult {
  const start = Date.now();
  const actual = getPath(data, path);
  const pass = compareValues(actual, operator, expected);
  return {
    pass,
    reasoning: pass
      ? `Value at ${path} (${operator}) check passed`
      : `Value at ${path} is "${actual}", expected ${operator} "${expected}"`,
    latencyMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Event-based evaluators (NEW)
// ---------------------------------------------------------------------------

/**
 * Check that specific event types exist in the event stream.
 */
export function evaluateEventPresence(
  requiredEventTypes: string[],
  events: EvidenceEvent[],
  withinMs?: number,
): EvalResult {
  const start = Date.now();
  const eventTypes = new Set(events.map(e => e.eventType));

  // If withinMs specified, check time window
  if (withinMs && events.length > 0) {
    const firstTime = new Date(events[0].emittedAt).getTime();
    const windowEvents = events.filter(e =>
      new Date(e.emittedAt).getTime() - firstTime <= withinMs
    );
    const windowTypes = new Set(windowEvents.map(e => e.eventType));
    const found = requiredEventTypes.filter(t => windowTypes.has(t));
    const missing = requiredEventTypes.filter(t => !windowTypes.has(t));
    const pass = missing.length === 0;
    return {
      pass,
      score: requiredEventTypes.length > 0 ? found.length / requiredEventTypes.length : 1,
      reasoning: pass
        ? `All required events found within ${withinMs}ms window`
        : `Missing events within ${withinMs}ms: ${missing.join(', ')}`,
      latencyMs: Date.now() - start,
    };
  }

  const found = requiredEventTypes.filter(t => eventTypes.has(t));
  const missing = requiredEventTypes.filter(t => !eventTypes.has(t));
  const pass = missing.length === 0;

  return {
    pass,
    score: requiredEventTypes.length > 0 ? found.length / requiredEventTypes.length : 1,
    reasoning: pass
      ? `All required events present: ${found.join(', ')}`
      : `Missing events: ${missing.join(', ')}`,
    latencyMs: Date.now() - start,
  };
}

/**
 * Check that events occur in a specific order.
 */
export function evaluateEventSequence(
  expectedSequence: string[],
  events: EvidenceEvent[],
  ordered: boolean = true,
  withinMs?: number,
): EvalResult {
  const start = Date.now();

  if (expectedSequence.length === 0) {
    return { pass: true, reasoning: 'Empty sequence always passes', latencyMs: 0 };
  }

  // Filter to only relevant events
  const relevantSet = new Set(expectedSequence);
  let relevant = events
    .filter(e => relevantSet.has(e.eventType))
    .sort((a, b) => new Date(a.emittedAt).getTime() - new Date(b.emittedAt).getTime());

  // Check time window
  if (withinMs && relevant.length > 0) {
    const firstTime = new Date(relevant[0].emittedAt).getTime();
    relevant = relevant.filter(e =>
      new Date(e.emittedAt).getTime() - firstTime <= withinMs
    );
  }

  // Check all events present
  const foundTypes = new Set(relevant.map(e => e.eventType));
  const missing = expectedSequence.filter(t => !foundTypes.has(t));
  if (missing.length > 0) {
    return {
      pass: false,
      reasoning: `Missing events in sequence: ${missing.join(', ')}`,
      latencyMs: Date.now() - start,
    };
  }

  if (!ordered) {
    return {
      pass: true,
      reasoning: `All events in sequence found (order not required)`,
      latencyMs: Date.now() - start,
    };
  }

  // Check order: each event type must appear after the previous in the sequence
  let lastIndex = -1;
  for (const expectedType of expectedSequence) {
    const idx = relevant.findIndex((e, i) => i > lastIndex && e.eventType === expectedType);
    if (idx === -1) {
      return {
        pass: false,
        reasoning: `Event "${expectedType}" not found in correct order after "${expectedSequence[expectedSequence.indexOf(expectedType) - 1] || 'start'}"`,
        latencyMs: Date.now() - start,
      };
    }
    lastIndex = idx;
  }

  return {
    pass: true,
    reasoning: `Events occurred in expected sequence: ${expectedSequence.join(' → ')}`,
    latencyMs: Date.now() - start,
  };
}

/**
 * Check that an event occurs within a time limit after a trigger event.
 */
export function evaluateTiming(
  eventType: string,
  maxMs: number,
  events: EvidenceEvent[],
  fromEvent?: string,
): EvalResult {
  const start = Date.now();

  const sorted = [...events].sort((a, b) =>
    new Date(a.emittedAt).getTime() - new Date(b.emittedAt).getTime()
  );

  const targetEvent = sorted.find(e => e.eventType === eventType);
  if (!targetEvent) {
    return {
      pass: false,
      reasoning: `Event "${eventType}" not found`,
      latencyMs: Date.now() - start,
    };
  }

  let referenceTime: number;
  if (fromEvent) {
    const refEvent = sorted.find(e => e.eventType === fromEvent);
    if (!refEvent) {
      return {
        pass: false,
        reasoning: `Reference event "${fromEvent}" not found`,
        latencyMs: Date.now() - start,
      };
    }
    referenceTime = new Date(refEvent.emittedAt).getTime();
  } else {
    // Use first event as reference
    referenceTime = sorted.length > 0 ? new Date(sorted[0].emittedAt).getTime() : Date.now();
  }

  const targetTime = new Date(targetEvent.emittedAt).getTime();
  const elapsedMs = targetTime - referenceTime;
  const pass = elapsedMs <= maxMs;

  return {
    pass,
    reasoning: pass
      ? `Event "${eventType}" occurred ${elapsedMs}ms after ${fromEvent || 'start'} (limit: ${maxMs}ms)`
      : `Event "${eventType}" took ${elapsedMs}ms, exceeding limit of ${maxMs}ms`,
    latencyMs: Date.now() - start,
  };
}

/**
 * Check that events have at least a minimum confirmation level.
 */
export function evaluateConfirmationLevel(
  minLevel: string,
  forEventTypes: string[],
  events: EvidenceEvent[],
): EvalResult {
  const start = Date.now();
  const levelOrder = ['A', 'B', 'C', 'D', 'E'];
  const minIdx = levelOrder.indexOf(minLevel);

  if (minIdx === -1) {
    return { pass: false, reasoning: `Invalid confirmation level: ${minLevel}`, latencyMs: 0 };
  }

  const relevant = events.filter(e => forEventTypes.includes(e.eventType));
  if (relevant.length === 0) {
    return {
      pass: false,
      reasoning: `No events found for types: ${forEventTypes.join(', ')}`,
      latencyMs: Date.now() - start,
    };
  }

  const failures: string[] = [];
  for (const event of relevant) {
    const eventLevel = event.confirmationLevel || 'A';
    const eventIdx = levelOrder.indexOf(eventLevel);
    if (eventIdx < minIdx) {
      failures.push(`${event.eventType}: level ${eventLevel} < required ${minLevel}`);
    }
  }

  const pass = failures.length === 0;
  return {
    pass,
    reasoning: pass
      ? `All events meet minimum confirmation level ${minLevel}`
      : `Insufficient confirmation: ${failures.join('; ')}`,
    latencyMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Unified evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a single check against available data and events.
 */
export async function evaluateCheck(
  checkType: string,
  config: Record<string, unknown>,
  data: unknown,
  events: EvidenceEvent[],
  meterContext: MeterContext,
  judgeThreshold: number = 0.75,
): Promise<EvalResult> {
  switch (checkType) {
    case 'judge':
      return evaluateJudge(
        (config.rubric as string) || '',
        config.scope === 'all_events' ? events : data,
        (config.threshold as number) || judgeThreshold,
        meterContext,
        config.scope as string,
      );

    case 'includes':
      return evaluateIncludes(
        (config.keywords as string[]) || [],
        config.scope === 'all_events' ? events : data,
        (config.matchMode as 'all' | 'any') || 'all',
      );

    case 'regex':
      return evaluateRegex(
        (config.pattern as string) || '',
        config.scope === 'all_events' ? events : data,
        config.shouldMatch !== false,
      );

    case 'json_path':
      return evaluateJsonPath(
        (config.path as string) || '',
        config.expected,
        config.scope === 'all_events' ? events : data,
        (config.operator as string) || 'eq',
      );

    case 'event_presence':
      return evaluateEventPresence(
        (config.eventTypes as string[]) || [],
        events,
        config.withinMs as number | undefined,
      );

    case 'event_sequence':
      return evaluateEventSequence(
        (config.eventTypes as string[]) || [],
        events,
        config.ordered !== false,
        config.withinMs as number | undefined,
      );

    case 'timing':
      return evaluateTiming(
        (config.eventType as string) || '',
        (config.maxMs as number) || 30000,
        events,
        config.fromEvent as string | undefined,
      );

    case 'confirmation_level':
      return evaluateConfirmationLevel(
        (config.minLevel as string) || 'A',
        (config.forEventTypes as string[]) || [],
        events,
      );

    case 'playbook_document_present':
      return evaluatePlaybookDocumentPresent(
        (config.documentTemplateId as string) || '',
        events,
      );

    default:
      return { pass: false, reasoning: `Unknown check type: "${checkType}"`, latencyMs: 0 };
  }
}

/**
 * Pass iff the instance has emitted at least one evidence event of type
 * `document.uploaded` (or `document.submitted`) whose payload references
 * the required documentTemplateId. Used to enforce
 * playbook_document_requirements at runtime.
 */
export function evaluatePlaybookDocumentPresent(
  documentTemplateId: string,
  events: EvidenceEvent[],
): EvalResult {
  const start = Date.now();
  if (!documentTemplateId) {
    return { pass: false, reasoning: 'Missing documentTemplateId in check config', latencyMs: 0 };
  }

  const matching = events.find((e) => {
    if (e.eventType !== 'document.uploaded' && e.eventType !== 'document.submitted') return false;
    const payload = e.payload as Record<string, unknown> | undefined;
    return payload?.documentTemplateId === documentTemplateId;
  });

  return {
    pass: !!matching,
    score: matching ? 1 : 0,
    reasoning: matching
      ? `Document ${documentTemplateId} present (event ${matching.id})`
      : `Required document ${documentTemplateId} not yet uploaded`,
    latencyMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let current: any = obj;
  const parts = path.split('.').filter(Boolean);
  for (const part of parts) {
    if (current == null) return undefined;
    const bracketMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (bracketMatch) {
      current = current[bracketMatch[1]];
      if (Array.isArray(current)) current = current[parseInt(bracketMatch[2])];
    } else {
      current = current[part];
    }
  }
  return current;
}

function compareValues(left: unknown, operator: string, right: unknown): boolean {
  switch (operator) {
    case 'eq': return JSON.stringify(left) === JSON.stringify(right);
    case 'neq': return JSON.stringify(left) !== JSON.stringify(right);
    case 'gt': return Number(left) > Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'lte': return Number(left) <= Number(right);
    case 'contains': return String(left).toLowerCase().includes(String(right).toLowerCase());
    case 'not_contains': return !String(left).toLowerCase().includes(String(right).toLowerCase());
    case 'regex': try { return new RegExp(String(right), 'i').test(String(left)); } catch { return false; }
    case 'exists': return left !== undefined && left !== null;
    case 'not_exists': return left === undefined || left === null;
    default: return JSON.stringify(left) === JSON.stringify(right);
  }
}
