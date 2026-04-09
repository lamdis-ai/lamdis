/**
 * Chat Discovery Service
 *
 * Drives a structured interview to extract a customer's process. The user
 * sends free-form turns; the LLM systematically asks about systems,
 * approvers, documents, and steps until it has enough to draft a playbook.
 *
 * The service is stateless on its own — callers persist the message
 * history (e.g. via conversationSessions) and pass it back in on each turn.
 */

import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import type { PlaybookDraft } from './types.js';

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

const SYSTEM_PROMPT = `You are running an interview to capture a customer's process for a Lamdis Outcome. Your goal is to gather enough information to produce a structured Outcome Playbook draft.

Cover, in order:
1. Outline the procedure end-to-end (steps).
2. Which systems they use at each step (Google Drive, Salesforce, Slack, DocuSign, fax, email, etc.).
3. Who approves what (named roles or specific people).
4. Required documents/evidence (forms, certificates, IDs).
5. Any special handling (escalation contacts, deadlines, tone).

Behavior:
- Ask one focused question per turn.
- Confirm assumptions back to the user.
- When you believe you have enough, respond with a JSON object on its own line prefixed by DRAFT::
  Example: DRAFT::{ "name": "...", "steps": [...], "systems": [...], "approvers": [...], "documents": [...], "unresolved": [...] }

Until then, just continue the conversation naturally with one question at a time.`;

export interface ChatTurnInput {
  orgId: string;
  outcomeTypeId: string;
  outcomeTypeName: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
  createdBy?: string;
}

export interface ChatTurnResult {
  reply: string;
  draft: PlaybookDraft | null;
}

function tryExtractDraft(reply: string, input: ChatTurnInput): PlaybookDraft | null {
  const idx = reply.indexOf('DRAFT::');
  if (idx === -1) return null;
  const jsonText = reply.slice(idx + 'DRAFT::'.length).trim();
  try {
    const parsed = JSON.parse(jsonText);
    return {
      source: 'chat',
      orgId: input.orgId,
      outcomeTypeId: input.outcomeTypeId,
      name: parsed.name || `${input.outcomeTypeName} (chat draft)`,
      summary: parsed.summary,
      steps: parsed.steps ?? [],
      systems: parsed.systems ?? [],
      approvers: parsed.approvers ?? [],
      documents: parsed.documents ?? [],
      unresolved: parsed.unresolved ?? [],
      createdBy: input.createdBy,
    };
  } catch {
    return null;
  }
}

export const chatDiscoveryService = {
  async turn(input: ChatTurnInput): Promise<ChatTurnResult> {
    const messages = [
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input.userMessage },
    ];
    const reply = await bedrockChatOnce({
      modelId: MODEL_ID,
      messages,
      system: `${SYSTEM_PROMPT}\n\nOutcome being configured: ${input.outcomeTypeName}`,
      maxTokens: 2048,
      temperature: 0.4,
      meterContext: {
        orgId: input.orgId,
        serviceKey: 'chatDiscovery.turn',
        outcomeTypeId: input.outcomeTypeId,
        userId: input.createdBy,
      },
    });
    return { reply, draft: tryExtractDraft(reply, input) };
  },
};
