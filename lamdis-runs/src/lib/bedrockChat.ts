import { bedrockClient, InvokeModelCommand } from "./bedrockClient.js";
import {
  assertBudget,
  recordUsage,
  type MeterContext,
  type TokenUsage,
} from "./llmCostControl.js";

export type ChatMessage = { role: "system"|"user"|"assistant"; content: string };

function isTitan(modelId: string): boolean {
  return /^amazon\.titan-text/i.test(modelId);
}

function buildAnthropicPayload(messages: ChatMessage[], opts: { system?: string; maxTokens?: number; temperature?: number }) {
  const systemParts = [opts.system || "", ...messages.filter(m => m.role === 'system').map(m => m.content)].filter(Boolean);
  const system = systemParts.join("\n\n").slice(0, 4000) || undefined;
  const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: [{ type: 'text', text: String(m.content ?? '') }] }));
  return {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: typeof opts.maxTokens === 'number' ? opts.maxTokens : 1024,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.3,
    ...(system ? { system } : {}),
    messages: chatMsgs,
  };
}

function buildTitanPrompt(messages: ChatMessage[], system?: string): string {
  const lines: string[] = [];
  if (system) lines.push(`System: ${system}`);
  for (const m of messages) {
    if (m.role === 'system') continue;
    const label = m.role === 'user' ? 'User' : 'Assistant';
    lines.push(`${label}: ${m.content}`);
  }
  // Nudge the model to continue as assistant
  lines.push('Assistant:');
  return lines.join('\n');
}

/**
 * Extract token usage from a Bedrock InvokeModel response. Anthropic Messages
 * responses include `usage.input_tokens` / `usage.output_tokens`. Titan
 * responses use `inputTextTokenCount` / `results[0].tokenCount`.
 */
function extractInvokeUsage(modelId: string, decoded: string): TokenUsage {
  try {
    const jr = JSON.parse(decoded);
    if (isTitan(modelId)) {
      return {
        inputTokens: jr?.inputTextTokenCount ?? 0,
        outputTokens: jr?.results?.[0]?.tokenCount ?? 0,
      };
    }
    return {
      inputTokens: jr?.usage?.input_tokens ?? 0,
      outputTokens: jr?.usage?.output_tokens ?? 0,
      cachedInputTokens: jr?.usage?.cache_read_input_tokens ?? 0,
    };
  } catch {
    return { inputTokens: 0, outputTokens: 0 };
  }
}

/**
 * Required `meterContext` is used to gate this call against any active budget
 * for the org/outcome/agent task BEFORE the call, and to record token usage +
 * cost AFTER. A budget block throws BudgetExceededError; metering failures
 * are logged but never break the call.
 */
export async function bedrockChatOnce(params: {
  modelId: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  meterContext: MeterContext;
}): Promise<string> {
  const { modelId, messages, system, maxTokens, temperature, topP, meterContext } = params;
  if (!modelId) throw new Error('bedrock_model_missing');

  await assertBudget(meterContext, modelId);

  const startedAt = Date.now();
  const finish = (decoded: string, status: 'success' | 'error', errorMessage?: string) => {
    void recordUsage({
      ctx: meterContext,
      modelId,
      usage: status === 'success' ? extractInvokeUsage(modelId, decoded) : { inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - startedAt,
      status,
      errorMessage,
    });
  };

  if (isTitan(modelId)) {
    const inputText = buildTitanPrompt(messages, system);
    const body = {
      inputText,
      textGenerationConfig: {
        maxTokenCount: typeof maxTokens === 'number' ? maxTokens : 512,
        temperature: typeof temperature === 'number' ? temperature : 0.3,
        topP: typeof topP === 'number' ? topP : 0.9,
      },
    } as any;
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });
    let decoded = '';
    try {
      const resp = await bedrockClient.send(command);
      decoded = new TextDecoder().decode(resp.body as any);
    } catch (err: any) {
      finish('', 'error', err?.message ?? String(err));
      throw err;
    }
    finish(decoded, 'success');
    try {
      const jr = JSON.parse(decoded) as { results?: { outputText?: string }[] };
      return jr?.results?.[0]?.outputText ?? '';
    } catch {
      return '';
    }
  }

  // Default to Anthropic Messages schema
  const payload = buildAnthropicPayload(messages, { system, maxTokens, temperature });
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });
  let decoded = '';
  try {
    const resp = await bedrockClient.send(command);
    decoded = new TextDecoder().decode(resp.body as any);
  } catch (err: any) {
    finish('', 'error', err?.message ?? String(err));
    throw err;
  }
  finish(decoded, 'success');
  try {
    const jr = JSON.parse(decoded) as { content?: { text?: string }[] };
    return String(jr?.content?.[0]?.text || '');
  } catch {
    return '';
  }
}
