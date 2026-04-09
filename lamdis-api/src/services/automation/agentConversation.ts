/**
 * Agent Conversation Engine
 *
 * Unified conversational agent that talks to the user, uses tools,
 * extracts evidence, and drives outcomes — all through natural dialogue.
 *
 * This replaces the separation between conversationProcessor (chat),
 * agentPlanner (planning), and outcomeOrchestrator (execution) with
 * a single streaming conversation loop.
 */

import { db } from '../../db.js';
import {
  outcomeInstances,
  outcomeTypes,
  proofExpectations,
  evidenceEvents,
  conversationSessions,
  actions,
} from '@lamdis/db/schema';
import { agentTasks, agentActivityLog, inputRequests } from '@lamdis/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { bedrockChatOnce, bedrockChatStreamGenerator, type ChatMessage } from '../../lib/bedrockChat.js';
import { executeTool, getToolDefinitionsForPrompt, setCredentialContext, type AgentToolResult } from './agentTools.js';
import { applyFactUpdate, formatFactsForPrompt, type FactStore } from './factReconciler.js';
import { runReflection } from './reflectionLoop.js';

// ---------------------------------------------------------------------------
// Operational Notes — agent learns from successes and failures
// ---------------------------------------------------------------------------

interface OperationalNote {
  note: string;
  category: 'blocked_source' | 'failed_approach' | 'working_approach' | 'learned';
  tool: string;
  domain?: string;
  createdAt: string;
}

function extractDomain(url?: string): string {
  if (!url) return 'unknown';
  try { return new URL(url).hostname.replace('www.', ''); } catch { return 'unknown'; }
}

function generateOperationalNote(tool: string, input: Record<string, unknown>, result: { ok: boolean; result?: any; error?: string }): OperationalNote | null {
  const error = result.error || '';
  const url = (input.url || input.instruction || '') as string;
  const domain = extractDomain(url);

  if (!result.ok) {
    if (error.includes('403') || error.includes('Forbidden'))
      return { note: `${domain} blocks automated requests (HTTP 403) — skip this source`, category: 'blocked_source', tool, domain, createdAt: new Date().toISOString() };
    if (error.includes('429') || error.includes('rate limit'))
      return { note: `${domain} rate-limits requests (HTTP 429) — try a different source`, category: 'blocked_source', tool, domain, createdAt: new Date().toISOString() };
    if (error.includes('timeout') || error.includes('timed out'))
      return { note: `${domain} timed out — likely blocks or is very slow, skip it`, category: 'blocked_source', tool, domain, createdAt: new Date().toISOString() };
    if (error.includes('tracking pixel'))
      return { note: `Images from ${domain} are tracking pixels, not real images — URLs from this source are unusable`, category: 'failed_approach', tool, domain, createdAt: new Date().toISOString() };
    if (error.includes('FAILED verification'))
      return { note: `Image from ${domain} failed verification — wrong product, try a different source`, category: 'failed_approach', tool, domain, createdAt: new Date().toISOString() };
    if (error.includes('HTML page'))
      return { note: `${domain} returned HTML instead of a file — use smart_browse for this site`, category: 'learned', tool, domain, createdAt: new Date().toISOString() };
    if (error.includes('404') || error.includes('Not Found'))
      return { note: `URL on ${domain} returned 404 — this specific page/image doesn't exist`, category: 'failed_approach', tool, domain, createdAt: new Date().toISOString() };
  }

  // Success notes
  if (result.ok) {
    if (tool === 'download_file' && result.result?.sizeBytes > 10000)
      return { note: `Successfully downloaded image from ${domain} (${result.result.sizeKB} KB) — this source works`, category: 'working_approach', tool, domain, createdAt: new Date().toISOString() };
    if (tool === 'extract_image_urls' && result.result?.imageCount > 3)
      return { note: `${domain} has ${result.result.imageCount} extractable images — good source for images`, category: 'working_approach', tool, domain, createdAt: new Date().toISOString() };
    if (tool === 'extract_image_urls' && result.result?.imageCount === 0)
      return { note: `${domain} returned 0 images — site likely uses JS rendering, try smart_browse instead`, category: 'learned', tool, domain, createdAt: new Date().toISOString() };
  }

  return null;
}

async function saveOperationalNote(instanceId: string, note: OperationalNote): Promise<void> {
  try {
    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(sql`SELECT operational_notes FROM outcome_instances WHERE id = ${instanceId} LIMIT 1`);
    const existing: OperationalNote[] = (rows.rows?.[0]?.operational_notes as any) || [];

    // Deduplicate: if same domain+category exists, replace
    const filtered = existing.filter(n => !(n.domain === note.domain && n.category === note.category && n.tool === note.tool));
    filtered.push(note);

    // Keep last 30 notes
    const trimmed = filtered.slice(-30);
    await db.execute(sql`UPDATE outcome_instances SET operational_notes = ${JSON.stringify(trimmed)}::jsonb WHERE id = ${instanceId}`);
  } catch (err: any) {
    console.error('[op-notes] Failed to save:', err?.message);
  }
}

function formatOperationalNotes(notes: OperationalNote[]): string {
  if (!notes || notes.length === 0) return '';
  const blockedSources = notes.filter(n => n.category === 'blocked_source');
  const failedApproaches = notes.filter(n => n.category === 'failed_approach');
  const workingApproaches = notes.filter(n => n.category === 'working_approach');
  const learned = notes.filter(n => n.category === 'learned');

  let text = '\n\n## Operational Notes (learnings from previous attempts — DO NOT repeat failed approaches)\n';
  if (blockedSources.length > 0) {
    text += 'BLOCKED SOURCES (do NOT try these again):\n';
    blockedSources.forEach(n => text += `- ${n.note}\n`);
  }
  if (failedApproaches.length > 0) {
    text += 'FAILED APPROACHES:\n';
    failedApproaches.forEach(n => text += `- ${n.note}\n`);
  }
  if (workingApproaches.length > 0) {
    text += 'WORKING SOURCES (prefer these):\n';
    workingApproaches.forEach(n => text += `- ${n.note}\n`);
  }
  if (learned.length > 0) {
    text += 'LEARNED:\n';
    learned.forEach(n => text += `- ${n.note}\n`);
  }
  return text;
}

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

// ---------------------------------------------------------------------------
// Auto-task tracking — create task records from conversation tool usage
// ---------------------------------------------------------------------------

const toolTaskNames: Record<string, string> = {
  web_search: 'Search the web',
  web_fetch: 'Fetch webpage',
  smart_browse: 'Browse website',
  download_file: 'Download file',
  extract_image_urls: 'Extract images',
  store_file: 'Save file',
  code_execute: 'Run code',
  credential_store: 'Manage credentials',
  send_message: 'Send message',
  image_process: 'Process image',
};

async function createToolTask(instanceId: string, orgId: string, toolName: string, input: Record<string, unknown>): Promise<string> {
  const label = toolTaskNames[toolName] || toolName;
  const detail = (input.query || input.url || input.instruction || input.fileName || input.action || '') as string;
  const title = detail ? `${label}: ${String(detail).slice(0, 60)}` : label;

  const { sql } = await import('drizzle-orm');

  // Dedup: if a task with the same title was created in the last 5 minutes, reuse it
  // (increment a runCount in actionInput) instead of inserting a new row.
  const recent = await db.execute(sql`
    SELECT id, action_input
    FROM agent_tasks
    WHERE outcome_instance_id = ${instanceId}
      AND title = ${title}
      AND task_type = 'tool_call'
      AND created_at > NOW() - INTERVAL '5 minutes'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (recent.rows?.[0]) {
    const existingId = recent.rows[0].id as string;
    const existingInput = (recent.rows[0].action_input || {}) as Record<string, unknown>;
    const runCount = ((existingInput.runCount as number) || 1) + 1;
    await db.execute(sql`
      UPDATE agent_tasks
      SET action_input = ${JSON.stringify({ ...existingInput, runCount })}::jsonb,
          status = 'in_progress',
          started_at = NOW(),
          updated_at = NOW(),
          completed_at = NULL
      WHERE id = ${existingId}
    `);
    return existingId;
  }

  // Get next sequence
  const seqRows = await db.execute(sql`SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq FROM agent_tasks WHERE outcome_instance_id = ${instanceId}`);
  const nextSeq = (seqRows.rows?.[0]?.next_seq as number) || 1;

  const [task] = await db.insert(agentTasks).values({
    orgId,
    outcomeInstanceId: instanceId,
    sequence: nextSeq,
    title,
    taskType: 'tool_call',
    actionInput: { runCount: 1, tool: toolName },
    status: 'in_progress',
    startedAt: new Date(),
  } as any).returning();

  return task.id;
}

async function completeToolTask(taskId: string, ok: boolean, output?: unknown): Promise<void> {
  await db.update(agentTasks).set({
    status: ok ? 'completed' : 'failed',
    actionOutput: typeof output === 'object' ? output as Record<string, unknown> : { result: output },
    completedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(agentTasks.id, taskId));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentChatEvent {
  type: 'thinking' | 'message' | 'tool_call' | 'tool_result' | 'evidence' | 'status' | 'done' | 'error';
  data: unknown;
}

export interface AgentChatContext {
  instanceId: string;
  orgId: string;
  message: string;
  attachments?: Array<{ data: string; mimeType: string; name?: string }>;
}

// ---------------------------------------------------------------------------
// Streaming chat — the main entry point
// ---------------------------------------------------------------------------

/**
 * Process a user message and yield streaming events.
 * This is the core agent loop: talk, think, use tools, record evidence.
 */
export async function* agentChat(ctx: AgentChatContext): AsyncGenerator<AgentChatEvent> {
  const { instanceId, orgId, message, attachments } = ctx;

  try {
    // 1. Load full context
    const context = await loadAgentContext(instanceId, orgId);
    if (!context) {
      yield { type: 'error', data: { message: 'Instance not found' } };
      return;
    }

    // 2. Set credential context for tools
    setCredentialContext(orgId, instanceId);

    // 2.5. Run reflection — reconcile facts, tasks, notes before proceeding
    yield { type: 'status', data: { agentStatus: 'reflecting' } };
    const instanceTasks = await db.select({
      id: agentTasks.id, sequence: agentTasks.sequence, title: agentTasks.title,
      status: agentTasks.status, description: agentTasks.description,
    }).from(agentTasks)
      .where(eq(agentTasks.outcomeInstanceId, instanceId))
      .orderBy(agentTasks.sequence);

    // Load pending input requests so reflection can cancel stale ones
    const pendingInputReqs = await db.select({
      id: inputRequests.id,
      requestType: inputRequests.requestType,
      title: inputRequests.title,
      description: inputRequests.description,
    }).from(inputRequests)
      .where(and(
        eq(inputRequests.outcomeInstanceId, instanceId),
        eq(inputRequests.status, 'pending'),
      ));

    await runReflection({
      instanceId,
      orgId,
      goalDescription: context.goalDescription,
      currentFacts: context.currentFacts,
      tasks: instanceTasks.map(t => ({ ...t, status: t.status || 'pending', description: t.description || null })),
      recentEvidence: context.recentEvidence,
      operationalNotes: context.operationalNotes,
      pendingInputRequests: pendingInputReqs.map(r => ({
        ...r,
        description: r.description || null,
      })),
    });

    // Reload facts after reflection (they may have been updated)
    const { sql } = await import('drizzle-orm');
    const refreshed = await db.execute(sql`SELECT current_facts, goal_description, operational_notes FROM outcome_instances WHERE id = ${instanceId} LIMIT 1`);
    if (refreshed.rows?.[0]) {
      context.currentFacts = (refreshed.rows[0].current_facts || {}) as FactStore;
      context.goalDescription = (refreshed.rows[0].goal_description as string) || context.goalDescription;
      context.operationalNotes = (refreshed.rows[0].operational_notes || []) as OperationalNote[];
    }

    // 3. Save user message to conversation history
    context.history.push({ role: 'user', content: message });
    yield { type: 'status', data: { agentStatus: 'thinking' } };

    // 3. Build the conversation and call LLM
    const systemPrompt = buildAgentSystemPrompt(context);
    const llmMessages: ChatMessage[] = [];

    // Add conversation history (last 30 turns)
    for (const h of context.history.slice(-30)) {
      llmMessages.push({
        role: h.role as 'user' | 'assistant',
        content: h.content,
        attachments: h.role === 'user' && h === context.history[context.history.length - 1] && attachments
          ? attachments.map(a => ({ data: a.data, mimeType: a.mimeType, name: a.name }))
          : undefined,
      });
    }

    // 4. Call the LLM
    let fullResponse = '';
    let toolCalls: Array<{ tool: string; input: Record<string, unknown> }> = [];

    yield { type: 'thinking', data: { text: 'Thinking...' } };

    const rawResponse = await bedrockChatOnce({
      modelId: MODEL_ID,
      messages: llmMessages,
      system: systemPrompt,
      maxTokens: 4096,
      temperature: 0.4,
      meterContext: {
        orgId,
        serviceKey: 'agentConversation.primary',
        outcomeInstanceId: instanceId,
      },
    });

    // 5. Parse the response for tool calls and messages
    const parsed = parseAgentResponse(rawResponse);

    // 6. Execute any tool calls
    // Track tool results alongside calls so LLM can see actual output
    const toolResults: Array<{ tool: string; ok: boolean; result?: unknown; error?: string }> = [];

    if (parsed.toolCalls.length > 0) {
      for (const tc of parsed.toolCalls) {
        yield { type: 'tool_call', data: { tool: tc.tool, input: tc.input } };
        await logAgentActivity(instanceId, orgId, 'executing', `Using ${tc.tool}`, { tool: tc.tool, input: tc.input });

        // Create a task record so the Plan tab shows this action
        const taskId = await createToolTask(instanceId, orgId, tc.tool, tc.input);

        const toolResult = await executeTool(tc.tool, tc.input, { orgId, instanceId });
        yield { type: 'tool_result', data: { tool: tc.tool, ok: toolResult.ok, result: toolResult.result, error: toolResult.error } };

        // Mark task completed/failed
        await completeToolTask(taskId, toolResult.ok, toolResult.result);

        await emitToolEvidence(orgId, instanceId, tc.tool, tc.input, toolResult);
        yield { type: 'evidence', data: { eventType: `tool.${tc.tool}`, ok: toolResult.ok } };

        // Generate and save operational note from this result
        const note = generateOperationalNote(tc.tool, tc.input, toolResult);
        if (note) await saveOperationalNote(instanceId, note);

        toolCalls.push(tc);
        toolResults.push({ tool: tc.tool, ok: toolResult.ok, result: toolResult.result, error: toolResult.error });
      }

      // 7. Agentic tool loop — keep calling LLM and executing tools
      const MAX_TOOL_ROUNDS = 5;
      let currentParsed = parsed;
      let round = 0;
      let roundResults = toolResults;

      while (currentParsed.toolCalls.length > 0 && currentParsed.needsFollowUp && round < MAX_TOOL_ROUNDS) {
        round++;

        // Build rich tool result summary with ACTUAL output data
        const toolResultDetails = roundResults.map(tr => {
          if (tr.ok) {
            const resultStr = (JSON.stringify(tr.result) || 'OK').slice(0, 800);
            return `Tool ${tr.tool}: SUCCESS\n${resultStr}`;
          } else {
            return `Tool ${tr.tool}: FAILED — ${tr.error || 'unknown error'}`;
          }
        }).join('\n\n');

        llmMessages.push({
          role: 'assistant',
          content: (currentParsed.thinkingText || '') + '\n' + (currentParsed.messageText || '') + '\n\n[Tool calls executed]',
        });
        llmMessages.push({
          role: 'user',
          content: `[SYSTEM: Tool results from round ${round}]\n${toolResultDetails}\n\nBased on these results, continue working. Call more tools if needed, or give your final response.`,
        });

        const followUpResponse = await bedrockChatOnce({
          modelId: MODEL_ID,
          messages: llmMessages,
          system: systemPrompt,
          maxTokens: 4096,
          temperature: 0.4,
          meterContext: {
            orgId,
            serviceKey: 'agentConversation.followUp',
            outcomeInstanceId: instanceId,
          },
        });

        currentParsed = parseAgentResponse(followUpResponse);
        roundResults = [];

        // Execute any new tool calls from this round
        if (currentParsed.toolCalls.length > 0) {
          for (const tc of currentParsed.toolCalls) {
            yield { type: 'tool_call', data: { tool: tc.tool, input: tc.input } };
            await logAgentActivity(instanceId, orgId, 'executing', `Using ${tc.tool}`, { tool: tc.tool, input: tc.input });

            const loopTaskId = await createToolTask(instanceId, orgId, tc.tool, tc.input);

            const toolResult = await executeTool(tc.tool, tc.input, { orgId, instanceId });
            yield { type: 'tool_result', data: { tool: tc.tool, ok: toolResult.ok, result: toolResult.result, error: toolResult.error } };

            await completeToolTask(loopTaskId, toolResult.ok, toolResult.result);

            await emitToolEvidence(orgId, instanceId, tc.tool, tc.input, toolResult);
            yield { type: 'evidence', data: { eventType: `tool.${tc.tool}`, ok: toolResult.ok } };

            const loopNote = generateOperationalNote(tc.tool, tc.input, toolResult);
            if (loopNote) await saveOperationalNote(instanceId, loopNote);

            toolCalls.push(tc);
            roundResults.push({ tool: tc.tool, ok: toolResult.ok, result: toolResult.result, error: toolResult.error });
          }
        }

        // Extract facts from each round
        if (currentParsed.extractedFacts.length > 0) {
          for (const fact of currentParsed.extractedFacts) {
            await emitConversationEvidence(orgId, instanceId, fact);
            yield { type: 'evidence', data: { eventType: fact.eventType, confidence: fact.confidence } };
          }
        }

        fullResponse = currentParsed.messageText || fullResponse;
      }

      if (round === 0) {
        fullResponse = parsed.messageText;
      }
    } else {
      fullResponse = parsed.messageText;
    }

    // 7.5. Post-tool reflection — reconcile everything learned from this interaction
    if (toolCalls.length > 0) {
      yield { type: 'status', data: { agentStatus: 'reflecting' } };
      const postTasks = await db.select({
        id: agentTasks.id, sequence: agentTasks.sequence, title: agentTasks.title,
        status: agentTasks.status, description: agentTasks.description,
      }).from(agentTasks)
        .where(eq(agentTasks.outcomeInstanceId, instanceId))
        .orderBy(agentTasks.sequence);

      // Reload evidence since tools may have emitted new events
      const postEvidence = await db.select().from(evidenceEvents)
        .where(eq(evidenceEvents.outcomeInstanceId, instanceId))
        .orderBy(desc(evidenceEvents.emittedAt)).limit(30);

      const { sql: sql2 } = await import('drizzle-orm');
      const postState = await db.execute(sql2`SELECT current_facts, operational_notes FROM outcome_instances WHERE id = ${instanceId} LIMIT 1`);
      const postFacts = (postState.rows?.[0]?.current_facts || {}) as FactStore;
      const postNotes = (postState.rows?.[0]?.operational_notes || []) as OperationalNote[];

      await runReflection({
        instanceId,
        orgId,
        goalDescription: context.goalDescription,
        currentFacts: postFacts,
        tasks: postTasks.map(t => ({ ...t, status: t.status || 'pending', description: t.description || null })),
        recentEvidence: postEvidence as any[],
        operationalNotes: postNotes,
      });
    }

    // 8. Stream the final message
    yield { type: 'message', data: { text: fullResponse } };

    // 9. Extract evidence from the conversation
    if (parsed.extractedFacts.length > 0) {
      for (const fact of parsed.extractedFacts) {
        await emitConversationEvidence(orgId, instanceId, fact);
        yield { type: 'evidence', data: { eventType: fact.eventType, confidence: fact.confidence } };
      }
    }

    // 10. Save conversation history
    context.history.push({ role: 'assistant', content: fullResponse });
    await saveConversationHistory(instanceId, context.history, parsed.extractedFacts);

    // 11. Update agent status
    await db.update(outcomeInstances).set({
      agentStatus: 'executing',
      updatedAt: new Date(),
    }).where(eq(outcomeInstances.id, instanceId));

    // 12. Log activity
    await logAgentActivity(instanceId, orgId, 'planning',
      fullResponse.slice(0, 100) + (fullResponse.length > 100 ? '...' : ''),
      { toolsUsed: parsed.toolCalls.map(tc => tc.tool), factsExtracted: parsed.extractedFacts.length });

    yield { type: 'status', data: { agentStatus: 'executing' } };
    yield { type: 'done', data: { messageLength: fullResponse.length, toolsUsed: parsed.toolCalls.length, factsExtracted: parsed.extractedFacts.length } };

  } catch (err: any) {
    console.error(`[agent-conversation] Error for ${instanceId}:`, err?.message);
    yield { type: 'error', data: { message: err?.message || 'Agent error' } };
  }
}

// ---------------------------------------------------------------------------
// Non-streaming variant (for orchestrator background calls)
// ---------------------------------------------------------------------------

export async function agentChatSync(ctx: AgentChatContext): Promise<{
  message: string;
  toolsUsed: string[];
  factsExtracted: number;
}> {
  const events: AgentChatEvent[] = [];
  for await (const event of agentChat(ctx)) {
    events.push(event);
  }
  const messageEvent = events.find(e => e.type === 'message');
  const doneEvent = events.find(e => e.type === 'done');
  return {
    message: (messageEvent?.data as any)?.text || '',
    toolsUsed: (doneEvent?.data as any)?.toolsUsed || [],
    factsExtracted: (doneEvent?.data as any)?.factsExtracted || 0,
  };
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

interface AgentContext {
  instance: any;
  outcomeType: any;
  expectations: any[];
  recentEvidence: any[];
  history: Array<{ role: string; content: string }>;
  availableActions: any[];
  guidelines: Record<string, unknown>;
  goalDescription: string;
  currentFacts: FactStore;
  operationalNotes: OperationalNote[];
}

async function loadAgentContext(instanceId: string, orgId: string): Promise<AgentContext | null> {
  const [instance] = await db.select().from(outcomeInstances)
    .where(eq(outcomeInstances.id, instanceId)).limit(1);
  if (!instance) return null;

  let outcomeType: any = null;
  let expectations: any[] = [];
  if (instance.outcomeTypeId) {
    [outcomeType] = await db.select().from(outcomeTypes)
      .where(eq(outcomeTypes.id, instance.outcomeTypeId)).limit(1);
    expectations = await db.select().from(proofExpectations)
      .where(and(eq(proofExpectations.outcomeTypeId, instance.outcomeTypeId), eq(proofExpectations.enabled, true)));
  }

  const recentEvidence = await db.select().from(evidenceEvents)
    .where(eq(evidenceEvents.outcomeInstanceId, instanceId))
    .orderBy(desc(evidenceEvents.emittedAt)).limit(20);

  // Load conversation history from the instance's conversation session or metadata
  const [session] = await db.select().from(conversationSessions)
    .where(eq(conversationSessions.outcomeInstanceId, instanceId))
    .orderBy(desc(conversationSessions.updatedAt)).limit(1);

  const sessionContext = (session?.context || {}) as Record<string, unknown>;
  const history = (sessionContext.messages as Array<{ role: string; content: string }>) || [];

  const availableActions = await db.select({
    id: actions.id, actionId: actions.actionId, title: actions.title, description: actions.description,
  }).from(actions).where(and(eq(actions.orgId, orgId), eq(actions.enabled, true)));

  return {
    instance,
    outcomeType,
    expectations,
    recentEvidence,
    history,
    availableActions,
    guidelines: (instance.guidelines || {}) as Record<string, unknown>,
    goalDescription: instance.goalDescription || '',
    currentFacts: ((instance as any).currentFacts || {}) as FactStore,
    operationalNotes: ((instance as any).operationalNotes || []) as OperationalNote[],
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildAgentSystemPrompt(context: AgentContext): string {
  const toolDefs = getToolDefinitionsForPrompt({ orgId: context.instance?.orgId });

  let prompt = `You are Lamdis, an autonomous AI agent. You take REAL actions on behalf of users. You are NOT a chatbot — you are an agent that gets things done.

## CRITICAL: You ARE Autonomous
You CAN and MUST take real actions:
- Log into websites using smart_browse (Facebook, Craigslist, OfferUp, etc.) — it uses a real browser with human-like behavior
- Post listings, fill forms, upload images, click buttons
- Save and retrieve credentials from the encrypted credential store
- Search the web, fetch pages, process images, execute code
- Download files and images from URLs using download_file — they are saved to the objective workspace
- Store generated content (listings, drafts, data) using store_file
- You have a persistent file workspace per objective — use it to save photos, drafts, and anything else

When the user says "post on Facebook Marketplace", you DO IT:
1. Check credential_store for saved credentials
2. If missing, OFFER TO RETRIEVE THEM:
   a. "I can log into [service].com with smart_browse and grab your API keys from the dashboard. Want me to do that, or would you prefer to paste them here?"
   b. If the user says yes, use smart_browse to navigate to the service's dashboard/settings page, find the credentials, and save them
   c. If the user wants to provide manually, use credential_store with operation "request" — this creates a secure form in the Tasks tab
   d. Save with credential_store (use save_org so it persists)
3. Use smart_browse to navigate, login, create the listing (it uses a real browser with human-like behavior)
4. Report back with results

When you need API credentials (Twilio, Stripe, etc.):
1. FIRST check if the user has a local bridge connected — if so, use local_filesystem to search for existing credentials:
   local_filesystem({ action: "find_env_vars", query: "TWILIO" }) — scans all .env files on their machine
   local_filesystem({ action: "exec_command", command: "cat ~/.twilio-cli/config.json" }) — check CLI configs
2. If not found locally, offer to retrieve them from the provider's website: "I can log into your Twilio console and grab your credentials. Want me to do that?"
3. If the user agrees, use smart_browse to go to the provider's dashboard and extract the credentials
4. If the user prefers manual entry, create a credential request — a secure form will appear in their Tasks tab
5. NEVER just ask the user to "paste credentials in the chat" — always use the secure credential_store request form

When you have the local_filesystem tool available (user is running lamdis-connect):
- You can search their filesystem, read files, find env vars, and run terminal commands
- Use it to find credentials, check project configs, run builds, install packages, etc.
- All operations are scoped to the directory they specified — you cannot access outside it
- Example: local_filesystem({ action: "exec_command", command: "npm list twilio" }) to check if Twilio SDK is installed

When you need product-specific images (e.g. a specific car, scooter, item):
1. Do NOT use Unsplash/Pexels — they have generic stock photos, not specific models/colors
2. BEST METHOD — Google Images via smart_browse:
   a. smart_browse({ url: "https://www.google.com/search?q=QUERY&tbm=isch", instruction: "Find the best photos of [product]. Click on a good result to open the preview panel. Use save_image to save the large preview image.", extractImages: true })
   b. save_image action downloads the image directly from the browser — no 403/CORS issues
   c. Repeat for multiple images
3. ALTERNATIVE — Dealer/listing sites:
   a. Use extract_image_urls on dealer listing pages (NOT search results pages)
   b. Use download_file with expectedContent to verify the image matches
4. Do NOT use extract_image_urls on google.com, facebook.com, instagram.com — they are JS-rendered and return 0 images. Use smart_browse instead.
5. If a download fails or times out, SKIP that URL immediately and try the next one — do not retry the same host
6. vespa.com and many manufacturer sites BLOCK downloads — avoid them, use third-party listings instead
7. Use store_file with action "list" to verify what's saved
8. NEVER tell the user you "can't download files" — you CAN. If one source blocks, immediately try another.

## MFA / Two-Factor Authentication
When smart_browse returns an mfaChallenge in its result:
1. Use request_mfa_code to ask the user for the verification code — include the screenshotUrl so they can see the challenge
2. Tell the user you've hit an MFA challenge and they should check the Action Items panel (or just type the code in chat)
3. STOP — do not call smart_browse again until the user provides the code
When the user provides the MFA code (in chat or via input request):
1. Call smart_browse WITHOUT a url (continues on the same browser session)
2. Instruction: "Type the verification code {code} into the input field and submit"
The browser session persists between tool calls, so you CAN resume exactly where you left off.

## Receiving SMS/MMS (Inbound)
When you need to receive texts or photos from the user via SMS:
1. Use setup_twilio_webhook with the Twilio credentials (accountSid, authToken, fromNumber) to configure the phone number
2. This creates a webhook channel and configures Twilio to forward all inbound SMS/MMS to this Lamdis instance
3. Once configured, any SMS/MMS sent to the Twilio number will automatically:
   - Download attached photos/media to your workspace (as files you can access)
   - Create evidence events (communication.received.twilio) that wake you up
   - Include mediaCount and mediaFiles in the evidence payload
4. Tell the user to text their photos to the Twilio number — you'll receive them automatically
5. You only need to call setup_twilio_webhook ONCE per phone number — check if a channel already exists first

NEVER say: "I can't access websites", "I can't log in", "I can't download files", "for security reasons", "I'll walk you through it", "I need you to do it manually"
The user has authorized you to act. That's the whole point.
If a tool fails, try a different approach. Only report a limitation if you've exhausted ALL tools and alternatives.

## Your Goal
${context.goalDescription || 'Help the user with their request.'}

## User's Guidelines
${Object.keys(context.guidelines).length > 0 ? JSON.stringify(context.guidelines, null, 2) : 'No specific guidelines set.'}

## How You Work
1. Take action first, explain second — don't ask for permission to do things the user already requested
2. Use tools aggressively: smart_browse for real browser interaction, download_file for saving files, web_search for finding information
3. Every action is recorded as evidence toward proving the outcome
4. When you need credentials, ask once, save to credential_store with save_org, never ask again
5. Be transparent about what you're doing but don't over-explain

## Available Tools
When you need to use a tool, include a TOOL_CALL block in your response:

\`\`\`tool_call
{"tool": "tool_name", "input": {"param": "value"}}
\`\`\`

${toolDefs}

## Evidence Extraction
While conversing, extract any facts the user provides. Include an EVIDENCE block:

\`\`\`evidence
[{"eventType": "user.provided.photos", "payload": {"count": 4}, "confidence": 0.95}]
\`\`\`

## Response Format
Respond naturally to the user. Intersperse tool calls and evidence blocks as needed.
Your natural language response should be direct and helpful — like a capable assistant, not a chatbot.`;

  // Add outcome context
  if (context.outcomeType) {
    prompt += `\n\n## Outcome Context\nType: ${context.outcomeType.name}`;
    if (context.outcomeType.description) prompt += `\nDescription: ${context.outcomeType.description}`;
    if (context.outcomeType.successCriteria?.length > 0) {
      prompt += `\nSuccess Criteria:\n${(context.outcomeType.successCriteria as any[]).map((c: any) => `- ${c.description}`).join('\n')}`;
    }
  }

  // Add proof expectations (hidden from user language)
  if (context.expectations.length > 0) {
    prompt += `\n\n## [INTERNAL] Proof Expectations (don't mention these directly to user)\n${context.expectations.map(e => `- ${e.name}: ${e.checkType}`).join('\n')}`;
  }

  // Add CURRENT FACTS (reconciled, authoritative)
  const factsText = formatFactsForPrompt(context.currentFacts);
  prompt += `\n\n## Current Facts (AUTHORITATIVE — use these over the original goal text if they differ)
${factsText}
IMPORTANT: If a fact above contradicts the original goal text, ALWAYS use the fact. The user corrected it during conversation. For example, if the goal says "red" but the facts say "Grigio Titanio", search for "Grigio Titanio".`;

  // Add recent evidence (raw, for additional context)
  if (context.recentEvidence.length > 0) {
    prompt += `\n\n## Recent Evidence Events (${context.recentEvidence.length} total)\n${context.recentEvidence.slice(0, 5).map(e => `- ${e.eventType}: ${JSON.stringify(e.payload).slice(0, 100)}`).join('\n')}`;
  }

  // Add proof status
  // Add operational notes (learnings from tool successes/failures)
  prompt += formatOperationalNotes(context.operationalNotes);

  prompt += `\n\n## Current Status\nProof: ${context.instance.proofStatus || 'gathering'}, Confidence: ${((context.instance.confidenceScore || 0) * 100).toFixed(0)}%, Events: ${context.instance.eventCount || 0}`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface ParsedAgentResponse {
  messageText: string;
  thinkingText: string;
  toolCalls: Array<{ tool: string; input: Record<string, unknown> }>;
  extractedFacts: Array<{ eventType: string; payload: Record<string, unknown>; confidence: number }>;
  needsFollowUp: boolean;
}

function parseAgentResponse(raw: string): ParsedAgentResponse {
  const toolCalls: ParsedAgentResponse['toolCalls'] = [];
  const extractedFacts: ParsedAgentResponse['extractedFacts'] = [];
  let messageText = raw;
  let thinkingText = '';

  // Extract tool_call blocks
  const toolCallRegex = /```tool_call\s*([\s\S]*?)```/g;
  let match;
  while ((match = toolCallRegex.exec(raw)) !== null) {
    try {
      const tc = JSON.parse(match[1].trim());
      if (tc.tool && tc.input) {
        toolCalls.push({ tool: tc.tool, input: tc.input });
      }
    } catch { /* skip malformed */ }
  }
  messageText = messageText.replace(toolCallRegex, '').trim();

  // Extract evidence blocks
  const evidenceRegex = /```evidence\s*([\s\S]*?)```/g;
  while ((match = evidenceRegex.exec(raw)) !== null) {
    try {
      const facts = JSON.parse(match[1].trim());
      if (Array.isArray(facts)) {
        for (const f of facts) {
          if (f.eventType) {
            extractedFacts.push({
              eventType: f.eventType,
              payload: f.payload || {},
              confidence: f.confidence ?? 0.8,
            });
          }
        }
      }
    } catch { /* skip malformed */ }
  }
  messageText = messageText.replace(evidenceRegex, '').trim();

  // Clean up empty lines
  messageText = messageText.replace(/\n{3,}/g, '\n\n').trim();

  return {
    messageText,
    thinkingText,
    toolCalls,
    extractedFacts,
    needsFollowUp: toolCalls.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Evidence emission
// ---------------------------------------------------------------------------

async function emitToolEvidence(
  orgId: string,
  instanceId: string,
  toolName: string,
  input: Record<string, unknown>,
  result: AgentToolResult,
) {
  try {
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId: instanceId,
      eventType: `tool.${toolName}`,
      eventSource: 'agent:tool',
      payload: { tool: toolName, input: truncate(input), ok: result.ok, result: truncate(result.result), error: result.error },
      confirmationLevel: 'A',
      idempotencyKey: `tool-${instanceId}-${toolName}-${Date.now()}`,
      emittedAt: new Date(),
    });
  } catch (err: any) {
    console.error('[agent-conversation] Failed to emit tool evidence:', err?.message);
  }
}

async function emitConversationEvidence(
  orgId: string,
  instanceId: string,
  fact: { eventType: string; payload: Record<string, unknown>; confidence: number },
) {
  try {
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId: instanceId,
      eventType: fact.eventType,
      eventSource: 'agent:conversation',
      payload: fact.payload,
      confirmationLevel: 'A',
      idempotencyKey: `conv-${instanceId}-${fact.eventType}-${Date.now()}`,
      emittedAt: new Date(),
      metadata: { extractionConfidence: fact.confidence },
    });

    // Reconcile fact into currentFacts on the instance (use raw SQL — column added after Drizzle types)
    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(sql`SELECT current_facts FROM outcome_instances WHERE id = ${instanceId} LIMIT 1`);
    const existingFacts = (rows.rows?.[0]?.current_facts || {}) as FactStore;
    const updatedFacts = await applyFactUpdate(existingFacts, fact.eventType, fact.payload, 'agent:conversation', {
      orgId,
      serviceKey: 'factReconciler',
      outcomeInstanceId: instanceId,
    });
    await db.execute(sql`UPDATE outcome_instances SET current_facts = ${JSON.stringify(updatedFacts)}::jsonb WHERE id = ${instanceId}`);
  } catch (err: any) {
    console.error('[agent-conversation] Failed to emit conversation evidence:', err?.message);
  }
}

// ---------------------------------------------------------------------------
// Conversation persistence
// ---------------------------------------------------------------------------

async function saveConversationHistory(
  instanceId: string,
  history: Array<{ role: string; content: string }>,
  extractedFacts: Array<{ eventType: string; payload: Record<string, unknown>; confidence: number }>,
) {
  // Try to update existing conversation session, or store in instance metadata
  const [session] = await db.select().from(conversationSessions)
    .where(eq(conversationSessions.outcomeInstanceId, instanceId))
    .orderBy(desc(conversationSessions.updatedAt)).limit(1);

  if (session) {
    const context = (session.context || {}) as Record<string, unknown>;
    const collectedFacts = (context.collectedFacts as any[]) || [];
    for (const f of extractedFacts) {
      collectedFacts.push({ eventType: f.eventType, payload: f.payload });
    }
    await db.update(conversationSessions).set({
      context: { ...context, messages: history.slice(-50), collectedFacts },
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(conversationSessions.id, session.id));
  } else {
    // Create a new conversation session for this agent interaction
    const [inst] = await db.select({ orgId: outcomeInstances.orgId })
      .from(outcomeInstances).where(eq(outcomeInstances.id, instanceId)).limit(1);
    if (inst) {
      await db.insert(conversationSessions).values({
        orgId: inst.orgId,
        outcomeInstanceId: instanceId,
        channel: 'chat',
        participantType: 'agent',
        status: 'active',
        context: { messages: history.slice(-50), collectedFacts: extractedFacts.map(f => ({ eventType: f.eventType, payload: f.payload })) },
      } as any);
    }
  }
}

// ---------------------------------------------------------------------------
// Activity logging
// ---------------------------------------------------------------------------

async function logAgentActivity(
  instanceId: string,
  orgId: string,
  activityType: string,
  summary: string,
  details?: Record<string, unknown>,
) {
  try {
    await db.insert(agentActivityLog).values({
      orgId,
      outcomeInstanceId: instanceId,
      activityType,
      summary,
      details,
    } as any);
  } catch (err: any) {
    console.error('[agent-conversation] Activity log error:', err?.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(obj: unknown): unknown {
  const str = JSON.stringify(obj);
  if (str && str.length > 2000) {
    return { _truncated: true, preview: str.slice(0, 500) };
  }
  return obj;
}
