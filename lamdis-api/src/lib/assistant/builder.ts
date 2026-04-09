import { AssistantInvocation, AssistantModule, AssistantModuleResult } from './types.js';
import { aiBuilderResponseSchema } from '../aiBuilderSchema.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { organizations } from '@lamdis/db/schema';

/**
 * System prompt (domain heuristics + guardrails) separated from runtime logic.
 * Keeping this string isolated allows:
 *  - Easier prompt iteration/versioning.
 *  - Potential future dynamic composition (org features / flags).
 *  - Unit style tests that diff the prompt string.
 */
const CORE_PROMPT = `You are the AI Builder assistant for Lamdis. Return ONLY valid JSON matching the response_format schema. Your primary optimization: reduce friction when users want to FIND or UPDATE existing knowledge articles (e.g. "update my hours knowledge article").\nKnowledge Article Heuristics:\n1. IF the user requests an update to a clearly implied article (e.g. "hours", "store hours", "contact info") and the org likely has a single obvious match, propose an update operation immediately instead of asking many clarifying questions. Use a provisional id/slug guess (e.g. hours, contact_info) if exact not provided.\n2. Only ask for clarification if: (a) multiple plausible articles (list brief candidate ids in questions[]), (b) critical data is ambiguous (e.g. user says "change hours" but provides no new hours).\n3. For hours updates: if user provides NO new hours details, ask only ONE concise question requesting the new hours (and optionally timezone) — do NOT ask about holidays/locales/versioning unless explicitly mentioned.\n4. When the user supplies partial structured info, infer missing trivial defaults rather than asking (e.g. assume immediate effect, same locale, publish=true).\n5. For knowledge_article update operations, data object MAY include: { id, title?, summary?, content?, content_type?, metadata? }. Include only fields being changed unless creating.\n6. Avoid over-questioning: limit questions[] to max 3 items unless user explicitly asks for guidance.\nGeneral Schema Reminders:\n- response: short helpful message.\n- operations: array of { op_id, resource, action, data }. Leave empty ONLY if you genuinely need info.\n- resources: knowledge_article | request | connection | action | manifest | manifest_publish | variable.\n- VARIABLES: never output real secrets; use value_placeholder.\n- CONNECTIONS: only include fields known; prefer follow-up question to hallucinating.\n- Use concise snake_case ids.\n- Never output prose outside JSON.\nIf user asks for help, still output valid JSON (maybe with questions).`;

/**
 * Builder Assistant
 * ------------------
 * Responsibility: Convert user natural language requests into a *structured*
 * JSON plan describing CRUD operations for Lamdis resources. It DOES NOT
 * execute those operations; the frontend decides when/how to apply them.
 *
 * Flow:
 *  1. Collect last N user/assistant turns (thin history window).
 *  2. Send to model with a json_schema response_format (OpenAI function).
 *  3. Parse, coerce to object, return as `structured`.
 *
 * Failure handling: returns { error } rather than throwing so HTTP layer can
 * consistently shape responses.
 */
export const builderAssistant: AssistantModule = {
  id: 'builder',
  description: 'Create & update Lamdis resources (knowledge, connections, requests, manifests, variables, workflows).',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  jsonSchema: aiBuilderResponseSchema,
  async systemPrompt(inv) {
    // Potential future org-aware tailoring – keep simple for now
    const [org] = await db.select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, inv.orgId))
      .limit(1)
      .catch(() => []);
    const orgHint = org ? `Org: ${org.slug}` : '';
    // If a planner is provided, compose a richer system prompt using its fields
    if (inv.planner && typeof inv.planner === 'object') {
      const p = inv.planner as any;
      const parts: string[] = [];
      const role = p.role ? String(p.role) : 'You are the AI Builder assistant for Lamdis.';
      parts.push(role);
      if (Array.isArray(p.objectives) && p.objectives.length) {
        parts.push('Objectives:');
        for (const o of p.objectives) parts.push(`- ${o}`);
      }
      if (Array.isArray(p.dependency_order) && p.dependency_order.length) {
        parts.push(`Dependency order: ${p.dependency_order.join(' -> ')}`);
      }
      if (p.operation_schema) {
        parts.push('Operation contract: Return JSON with structured.operations[]. Fields:');
        parts.push(`- op_id, resource, action, data, depends_on?`);
      }
      if (p.resources) {
        parts.push('Resource guidance:');
        for (const k of Object.keys(p.resources)) {
          const r = p.resources[k];
          parts.push(`- ${k}: ${typeof r === 'string' ? r : ''}`);
        }
      }
      if (Array.isArray(p.planning_rules) && p.planning_rules.length) {
        parts.push('Planning rules:');
        for (const r of p.planning_rules) parts.push(`- ${r}`);
      }
      parts.push('Return ONLY JSON matching the provided schema.');
      if (orgHint) parts.push(orgHint);
      return parts.join('\n');
    }
    return `${CORE_PROMPT}\n${orgHint}`.trim();
  },
  async run(inv: AssistantInvocation): Promise<AssistantModuleResult> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return { error: 'Missing OpenAI key' };
    const base = process.env.OPENAI_BASE || 'https://api.openai.com/v1';
    const system = await this.systemPrompt(inv);
    const tools = Array.isArray(inv.tools) ? inv.tools : [];
    // Always use Responses API with the requested model
    const model = process.env.OPENAI_RESPONSES_MODEL || 'gpt-5-2025-08-07';
    const resp = await fetch(`${base}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model,
          tools,
          input: [
            { role: 'system', content: system },
            ...inv.history.slice(-20),
            { role: 'user', content: inv.message },
          ],
          // Ask for structured JSON plan using Responses API text.format
          text: {
            format: {
              type: 'json_schema',
              // Use non-strict schema to allow flexible data objects per op
              strict: false,
              name: (this.jsonSchema?.name || 'lamdis_builder_response'),
              schema: (this.jsonSchema?.schema || {})
            }
          },
          tool_choice: 'auto'
        })
      });
    const txt = await resp.text();
    if (!resp.ok) return { error: txt };
    let j: any = null; try { j = JSON.parse(txt); } catch {}
    // Prefer parsed structured output
    let structured: any | undefined = j?.output_parsed;
    if (!structured) {
      try { structured = typeof j?.output_text === 'string' ? JSON.parse(j.output_text) : undefined; } catch {}
    }
    if (structured && typeof structured === 'object') {
      return { structured, raw: j };
    }
    // Fallback to assistant text (may include citations). If it looks like JSON, try to parse to structured.
    const message = Array.isArray(j?.output) ? j.output.find((x: any) => x?.type === 'message') : null;
    const text = message?.content?.[0]?.text || j?.output_text || '';
    if (typeof text === 'string') {
      let content = text.trim();
      // Strip markdown fences if present
      content = content.replace(/^```[a-zA-Z0-9_-]*\n/, '').replace(/\n```\s*$/, '');
      // If not a pure JSON string, attempt to extract the first JSON object substring
      let candidate = content;
      if (!(candidate.startsWith('{') || candidate.startsWith('['))) {
        const firstBrace = candidate.indexOf('{');
        const lastBrace = candidate.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          candidate = candidate.slice(firstBrace, lastBrace + 1);
        }
      }
      try {
        const maybe = JSON.parse(candidate);
        if (maybe && typeof maybe === 'object' && (maybe.version || maybe.operations)) {
          return { structured: maybe, raw: j };
        }
      } catch { /* ignore */ }
    }
    return { reply: text, raw: j };
  }
};
