import { bedrockChatOnce } from './bedrockChat.js';
import type { MeterContext } from './llmCostControl.js';

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMChatResult {
  messages: LLMMessage[];
  latencyMs: number;
}

export async function runLLMConversation(messages: LLMMessage[], meterContext: MeterContext): Promise<LLMChatResult> {
  const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
  const started = Date.now();
  const content = await bedrockChatOnce({ modelId, messages: messages as any, meterContext });
  const outMessages: LLMMessage[] = [...messages, { role: 'assistant', content }];
  return { messages: outMessages, latencyMs: Date.now() - started };
}
