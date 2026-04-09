/**
 * Reflection Loop — progressive reasoning over all accumulated state.
 *
 * On every interaction, reviews facts, tasks, evidence, and operational notes
 * using LLM reasoning. Merges duplicate facts, consolidates tasks, extracts
 * new insights, and refines the goal description as it becomes clearer.
 *
 * This replaces heuristic-based reconciliation with holistic LLM reasoning.
 */

import { db } from '../../db.js';
import { outcomeInstances } from '@lamdis/db/schema';
import { agentTasks, inputRequests } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import { setFact, removeFact, type FactStore } from './factReconciler.js';

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';
const REFLECTION_MIN_INTERVAL_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReflectionInput {
  instanceId: string;
  orgId: string;
  goalDescription: string;
  currentFacts: FactStore;
  tasks: Array<{ id: string; sequence: number; title: string; status: string; description?: string | null }>;
  recentEvidence: Array<{ eventType: string; payload: unknown; emittedAt: Date | string }>;
  operationalNotes: Array<{ note: string; category: string; tool: string; domain?: string }>;
  pendingInputRequests?: Array<{ id: string; requestType: string; title: string; description?: string | null }>;
}

interface ReflectionResult {
  facts: {
    merged: Record<string, any>;
    remove: string[];
  };
  tasks: {
    skip: string[];
    merge: Array<{ keep: string; remove: string[]; reason: string }>;
    complete: Array<{ taskId: string; reason: string }>;
  };
  inputRequests: {
    cancel: Array<{ requestId: string; reason: string }>;
  };
  insights: string[];
  goalRefinement: string | null;
  summary: string;
}

// ---------------------------------------------------------------------------
// Main reflection function
// ---------------------------------------------------------------------------

export async function runReflection(input: ReflectionInput): Promise<void> {
  const { instanceId } = input;

  // Debounce — check if we reflected recently
  try {
    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(sql`SELECT metadata FROM outcome_instances WHERE id = ${instanceId} LIMIT 1`);
    const metadata = (rows.rows?.[0]?.metadata || {}) as Record<string, unknown>;
    const lastReflection = metadata.lastReflectionAt as string | undefined;
    if (lastReflection && Date.now() - new Date(lastReflection).getTime() < REFLECTION_MIN_INTERVAL_MS) {
      return; // Too soon
    }
  } catch { /* proceed if check fails */ }

  // Run the LLM reflection
  const result = await callReflectionLLM(input);
  if (!result) return;

  // Apply results
  await applyReflection(instanceId, input.currentFacts, result);

  console.log(`[reflection] ${instanceId}: ${result.summary}`);
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

async function callReflectionLLM(input: ReflectionInput): Promise<ReflectionResult | null> {
  const factsText = Object.entries(input.currentFacts)
    .map(([key, fact]) => `  "${key}": ${JSON.stringify(fact.value)}`)
    .join('\n');

  const tasksText = input.tasks
    .map(t => `  [${t.status}] #${t.sequence} "${t.title}" (id: ${t.id})${t.description ? ` — ${t.description}` : ''}`)
    .join('\n');

  const evidenceText = input.recentEvidence.slice(0, 30)
    .map(e => `  ${e.eventType}: ${JSON.stringify(e.payload).slice(0, 200)}`)
    .join('\n');

  const pendingRequestsText = (input.pendingInputRequests || [])
    .map(r => `  [${r.requestType}] "${r.title}" (id: ${r.id})${r.description ? ` — ${r.description}` : ''}`)
    .join('\n');

  const notesText = input.operationalNotes
    .map(n => `  [${n.category}] ${n.note}`)
    .join('\n');

  try {
    const response = await bedrockChatOnce({
      modelId: MODEL_ID,
      meterContext: {
        orgId: input.orgId,
        serviceKey: 'reflectionLoop',
        outcomeInstanceId: input.instanceId,
      },
      messages: [{
        role: 'user',
        content: `You are reviewing the accumulated state of an autonomous agent working toward a goal. Reflect on everything and produce reconciled updates.

GOAL: ${input.goalDescription}

CURRENT FACTS:
${factsText || '  (none)'}

CURRENT TASKS (${input.tasks.length}):
${tasksText || '  (none)'}

RECENT EVIDENCE (${input.recentEvidence.length} events):
${evidenceText || '  (none)'}

PENDING INPUT REQUESTS (asks to the user — cancel any that are now redundant):
${pendingRequestsText || '  (none)'}

OPERATIONAL NOTES:
${notesText || '  (none)'}

Review everything holistically and return a JSON object:
{
  "facts": {
    "merged": { "canonical_key": "current best value", ... },
    "remove": ["stale_key_1", "stale_key_2"]
  },
  "tasks": {
    "skip": ["taskId_of_duplicate_or_irrelevant"],
    "merge": [{ "keep": "taskId_to_keep", "remove": ["taskId_to_skip"], "reason": "why" }],
    "complete": [{ "taskId": "taskId_satisfied_by_evidence", "reason": "what evidence proves it's done" }]
  },
  "inputRequests": {
    "cancel": [{ "requestId": "id_of_pending_request", "reason": "facts/evidence already provide what was requested" }]
  },
  "insights": ["new learning from reviewing evidence and results"],
  "goalRefinement": "refined goal description if the objective has become clearer, or null if unchanged",
  "summary": "1-2 sentence reflection on current state"
}

Rules:
- If multiple facts describe the same thing (e.g. "vehicle.color" and "vehicle.color_update"), merge into ONE canonical key with the latest correct value
- If two tasks have the same intent, keep the one with more progress (completed > in_progress > pending) and skip the other
- **CRITICAL: Mark tasks as completed when facts/evidence prove they're done.** Examples:
  * Task "user provides photos" → complete if facts contain photo filenames or evidence shows mediaCount > 0
  * Task "configure twilio" → complete if facts contain twilio.auth_token AND a twilio.sms.sent evidence event exists
  * Task "find credentials" → complete if facts contain those credentials
  * Task "verify X" → complete if evidence confirms X
- **CRITICAL: Cancel pending input requests that are no longer needed.** If a pending input request asks for something that the facts/evidence already contain, cancel it. Examples:
  * Pending request "Vespa Photos and Details" → cancel if facts contain listings.photos OR evidence shows communication.received.* with mediaCount > 0
  * Pending request "twilio credentials" → cancel if facts contain twilio.auth_token AND a successful sms_sent evidence event exists
  * Pending request "platform login" → cancel if facts mark that platform's auth_needed: false
  Stale pending requests block the user with redundant asks — cancel them aggressively when the data is already there.
- Only remove facts if evidence clearly supersedes them — be conservative
- Remove STALE failure facts (e.g. "twilio.auth_failure_count: 5+ errors") if newer evidence shows the issue is resolved
- goalRefinement should capture anything that's become clearer about what the user actually wants — details, preferences, constraints discovered during execution. Return null if the goal hasn't changed.
- insights should capture patterns you notice — what approaches work, what domains are reliable, what the user cares about
- Return empty arrays/objects for sections with no changes — don't force changes`,
      }],
      system: 'You are a reflection engine for an autonomous agent. Review accumulated state and produce reconciled updates. Respond ONLY with valid JSON. Be conservative — prefer keeping data over removing it.',
      maxTokens: 2048,
      temperature: 0.1,
    });

    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    // Find JSON object in response
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(jsonStr.slice(start, end + 1));

    return {
      facts: {
        merged: parsed.facts?.merged || {},
        remove: Array.isArray(parsed.facts?.remove) ? parsed.facts.remove : [],
      },
      tasks: {
        skip: Array.isArray(parsed.tasks?.skip) ? parsed.tasks.skip : [],
        merge: Array.isArray(parsed.tasks?.merge) ? parsed.tasks.merge : [],
        complete: Array.isArray(parsed.tasks?.complete) ? parsed.tasks.complete : [],
      },
      inputRequests: {
        cancel: Array.isArray(parsed.inputRequests?.cancel) ? parsed.inputRequests.cancel : [],
      },
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      goalRefinement: parsed.goalRefinement || null,
      summary: parsed.summary || 'Reflection complete.',
    };
  } catch (err: any) {
    console.error('[reflection] LLM call failed:', err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Apply reflection results
// ---------------------------------------------------------------------------

async function applyReflection(
  instanceId: string,
  currentFacts: FactStore,
  result: ReflectionResult,
): Promise<void> {
  const { sql } = await import('drizzle-orm');
  let facts = { ...currentFacts };

  // 1. Merge/update facts
  for (const [key, value] of Object.entries(result.facts.merged)) {
    facts = setFact(facts, key, value, 'agent:reflection');
  }

  // 2. Remove stale facts
  for (const key of result.facts.remove) {
    facts = removeFact(facts, key);
  }

  // 3. Save updated facts
  await db.execute(sql`UPDATE outcome_instances SET current_facts = ${JSON.stringify(facts)}::jsonb, updated_at = NOW() WHERE id = ${instanceId}`);

  // 4. Skip duplicate/irrelevant tasks
  for (const taskId of result.tasks.skip) {
    await db.update(agentTasks).set({
      status: 'skipped',
      updatedAt: new Date(),
    } as any).where(eq(agentTasks.id, taskId));
  }

  // 5. Merge duplicate tasks
  for (const merge of result.tasks.merge) {
    for (const removeId of merge.remove) {
      await db.update(agentTasks).set({
        status: 'skipped',
        description: `Merged into another task: ${merge.reason}`,
        updatedAt: new Date(),
      } as any).where(eq(agentTasks.id, removeId));
    }
  }

  // 5b. Complete tasks that evidence proves are done
  for (const completion of result.tasks.complete) {
    if (!completion.taskId) continue;
    await db.update(agentTasks).set({
      status: 'completed',
      description: `Auto-completed by reflection: ${completion.reason}`,
      completedAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(agentTasks.id, completion.taskId));
    console.log(`[reflection] ${instanceId}: completed task ${completion.taskId} — ${completion.reason}`);
  }

  // 5c. Cancel pending input requests that are no longer needed
  for (const cancel of result.inputRequests.cancel) {
    if (!cancel.requestId) continue;
    await db.update(inputRequests).set({
      status: 'cancelled',
      response: { autoCancelled: true, reason: cancel.reason },
      respondedAt: new Date(),
      updatedAt: new Date(),
    } as any).where(and(
      eq(inputRequests.id, cancel.requestId),
      eq(inputRequests.status, 'pending'),
    ));
    console.log(`[reflection] ${instanceId}: cancelled input request ${cancel.requestId} — ${cancel.reason}`);
  }

  // 6. Save insights as operational notes
  if (result.insights.length > 0) {
    const rows = await db.execute(sql`SELECT operational_notes FROM outcome_instances WHERE id = ${instanceId} LIMIT 1`);
    const existing: Array<{ note: string; category: string; tool: string; createdAt: string }> = (rows.rows?.[0]?.operational_notes as any) || [];

    const newNotes = result.insights.map(insight => ({
      note: insight,
      category: 'learned' as const,
      tool: 'reflection',
      createdAt: new Date().toISOString(),
    }));

    // Deduplicate by content
    const existingNoteTexts = new Set(existing.map(n => n.note));
    const uniqueNewNotes = newNotes.filter(n => !existingNoteTexts.has(n.note));

    if (uniqueNewNotes.length > 0) {
      const combined = [...existing, ...uniqueNewNotes].slice(-30);
      await db.execute(sql`UPDATE outcome_instances SET operational_notes = ${JSON.stringify(combined)}::jsonb WHERE id = ${instanceId}`);
    }
  }

  // 7. Refine goal description if the reflection produced one
  if (result.goalRefinement) {
    await db.execute(sql`UPDATE outcome_instances SET goal_description = ${result.goalRefinement}, updated_at = NOW() WHERE id = ${instanceId}`);
  }

  // 8. Update lastReflectionAt in metadata
  await db.execute(sql`UPDATE outcome_instances SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ lastReflectionAt: new Date().toISOString() })}::jsonb WHERE id = ${instanceId}`);
}
