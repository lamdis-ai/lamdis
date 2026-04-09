import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
  ConverseStreamCommand,
  type ContentBlock,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { assertBudget, recordUsage, type MeterContext, type TokenUsage } from "../services/llmCostControl/index.js";

export interface ChatAttachment {
  data: string; // base64 encoded
  mimeType: string; // e.g., 'image/jpeg', 'image/png', 'application/pdf'
  name?: string;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

// Explicitly provide credentials when available to override AppRunner instance role
const awsCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: awsCredentials,
});

// Legacy payload builder for InvokeModel (still used for non-streaming)
function buildAnthropicPayload(
  messages: ChatMessage[],
  opts: { system?: string; maxTokens?: number; temperature?: number }
) {
  const systemParts = [
    opts.system || "",
    ...messages.filter((m) => m.role === "system").map((m) => m.content),
  ].filter(Boolean);
  const system = systemParts.join("\n\n").slice(0, 4000) || undefined;
  const chatMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content: [{ type: "text", text: String(m.content ?? "") }],
    }));
  return {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: typeof opts.maxTokens === "number" ? opts.maxTokens : 1024,
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.7,
    ...(system ? { system } : {}),
    messages: chatMsgs,
  };
}

// Map MIME types to Bedrock image formats
function getImageFormat(mimeType: string): 'jpeg' | 'png' | 'gif' | 'webp' | null {
  const map: Record<string, 'jpeg' | 'png' | 'gif' | 'webp'> = {
    'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp',
  };
  return map[mimeType.toLowerCase()] || null;
}

// Build messages for Converse API (supports multimodal)
function buildConverseMessages(messages: ChatMessage[]): Message[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const blocks: ContentBlock[] = [];

      // Add text content
      if (m.content) {
        blocks.push({ text: String(m.content) });
      }

      // Add image attachments (Bedrock Converse supports image content blocks)
      if (m.attachments?.length) {
        for (const att of m.attachments) {
          const imgFormat = getImageFormat(att.mimeType);
          if (imgFormat) {
            blocks.push({
              image: {
                format: imgFormat,
                source: { bytes: Buffer.from(att.data, 'base64') as any },
              },
            } as ContentBlock);
          } else if (att.mimeType === 'application/pdf') {
            blocks.push({
              document: {
                format: 'pdf' as any,
                name: att.name || 'document',
                source: { bytes: Buffer.from(att.data, 'base64') as any },
              },
            } as ContentBlock);
          }
          // For unsupported types, mention them in text
          else {
            blocks.push({ text: `[Attached file: ${att.name || 'file'} (${att.mimeType})]` });
          }
        }
      }

      if (blocks.length === 0) blocks.push({ text: '' });

      return { role: m.role as "user" | "assistant", content: blocks };
    });
}

// Extract system prompt from messages
function extractSystemPrompt(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

/**
 * Extract token usage from a Bedrock Converse response. Returns zeros if the
 * upstream didn't include usage (rare but possible on errors).
 */
function extractConverseUsage(resp: { usage?: { inputTokens?: number; outputTokens?: number } }): TokenUsage {
  return {
    inputTokens: resp.usage?.inputTokens ?? 0,
    outputTokens: resp.usage?.outputTokens ?? 0,
  };
}

/**
 * Non-streaming chat completion using Converse API
 * Uses ConverseCommand for better compatibility with inference profiles
 *
 * Required `meterContext` is used to (a) gate against any active budget for
 * this org/outcome/agent task BEFORE the call, and (b) record token usage +
 * cost AFTER the call. A failure in either path is logged but never breaks
 * the underlying request — except a budget block, which throws BudgetExceededError.
 */
export async function bedrockChatOnce(params: {
  modelId: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  meterContext: MeterContext;
}): Promise<string> {
  const { modelId, messages, system, maxTokens, temperature, meterContext } = params;
  if (!modelId) throw new Error("bedrock_model_missing");

  await assertBudget(meterContext, modelId);

  // Build system prompt
  const systemPrompt = system || extractSystemPrompt(messages);

  // Build messages for Converse API
  const converseMessages = buildConverseMessages(messages);

  const command = new ConverseCommand({
    modelId,
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    messages: converseMessages,
    inferenceConfig: {
      temperature: typeof temperature === "number" ? temperature : 0.7,
      maxTokens: typeof maxTokens === "number" ? maxTokens : 1024,
    },
  });

  const startedAt = Date.now();
  let resp;
  try {
    resp = await bedrockClient.send(command);
  } catch (err: any) {
    void recordUsage({
      ctx: meterContext,
      modelId,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - startedAt,
      status: 'error',
      errorMessage: err?.message ?? String(err),
    });
    throw err;
  }

  void recordUsage({
    ctx: meterContext,
    modelId,
    usage: extractConverseUsage(resp as any),
    durationMs: Date.now() - startedAt,
    status: 'success',
  });

  // Extract text from the response
  const content = resp.output?.message?.content;
  if (content && Array.isArray(content)) {
    const textBlocks = content.filter(block => 'text' in block);
    if (textBlocks.length > 0) {
      return (textBlocks[0] as { text: string }).text || "";
    }
  }
  return "";
}

/**
 * Stream chat completion using ConverseStreamCommand (modern API)
 * 
 * This uses the higher-level Converse API which provides a cleaner
 * interface for streaming responses from Claude models.
 */
export async function bedrockChatStream(params: {
  modelId: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  callbacks: StreamCallbacks;
  meterContext: MeterContext;
}): Promise<string> {
  const { modelId, messages, system, maxTokens, temperature, callbacks, meterContext } = params;
  if (!modelId) throw new Error("bedrock_model_missing");

  await assertBudget(meterContext, modelId);

  // Build system prompt
  const systemPrompt = system || extractSystemPrompt(messages);

  // Build messages for Converse API
  const converseMessages = buildConverseMessages(messages);

  const command = new ConverseStreamCommand({
    modelId,
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    messages: converseMessages,
    inferenceConfig: {
      temperature: typeof temperature === "number" ? temperature : 0.3,
      maxTokens: typeof maxTokens === "number" ? maxTokens : 4096,
    },
    // Claude-specific options
    additionalModelRequestFields: {
      top_k: 200,
    },
  });

  let fullText = "";
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const startedAt = Date.now();
  let errorMessage: string | undefined;
  let status: 'success' | 'error' = 'success';

  try {
    const response = await bedrockClient.send(command);

    if (response.stream) {
      for await (const event of response.stream) {
        // Handle different event types
        if (event.contentBlockDelta?.delta?.text) {
          const text = event.contentBlockDelta.delta.text;
          fullText += text;
          callbacks.onText?.(text);
        } else if (event.metadata?.usage) {
          // Bedrock emits a metadata event near end-of-stream with token counts.
          usage = {
            inputTokens: event.metadata.usage.inputTokens ?? 0,
            outputTokens: event.metadata.usage.outputTokens ?? 0,
          };
        }
        // Other event types: messageStart, contentBlockStart, contentBlockStop, messageStop
      }
    }

    callbacks.onComplete?.(fullText);
    return fullText;
  } catch (error: any) {
    status = 'error';
    errorMessage = error?.message ?? String(error);
    callbacks.onError?.(error);
    throw error;
  } finally {
    // Record whatever usage we observed, even on aborted/errored streams.
    void recordUsage({
      ctx: meterContext,
      modelId,
      usage,
      durationMs: Date.now() - startedAt,
      status,
      errorMessage,
    });
  }
}

/**
 * Async generator for streaming - yields SSE-friendly events
 * 
 * Usage:
 * for await (const event of bedrockChatStreamGenerator(params)) {
 *   // event.type: 'text' | 'complete' | 'done'
 *   // event.data: string content
 * }
 */
export async function* bedrockChatStreamGenerator(params: {
  modelId: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  meterContext: MeterContext;
}): AsyncGenerator<{ type: string; data: any }> {
  const { modelId, messages, system, maxTokens, temperature, meterContext } = params;
  if (!modelId) throw new Error("bedrock_model_missing");

  await assertBudget(meterContext, modelId);

  // Build system prompt
  const systemPrompt = system || extractSystemPrompt(messages);

  // Build messages for Converse API
  const converseMessages = buildConverseMessages(messages);

  const command = new ConverseStreamCommand({
    modelId,
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    messages: converseMessages,
    inferenceConfig: {
      temperature: typeof temperature === "number" ? temperature : 0.3,
      maxTokens: typeof maxTokens === "number" ? maxTokens : 4096,
    },
    additionalModelRequestFields: {
      top_k: 200,
    },
  });

  let fullText = "";
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const startedAt = Date.now();
  let status: 'success' | 'error' = 'success';
  let errorMessage: string | undefined;

  try {
    const response = await bedrockClient.send(command);

    if (response.stream) {
      for await (const event of response.stream) {
        if (event.contentBlockDelta?.delta?.text) {
          const text = event.contentBlockDelta.delta.text;
          fullText += text;
          yield { type: "text", data: text };
        } else if (event.metadata?.usage) {
          usage = {
            inputTokens: event.metadata.usage.inputTokens ?? 0,
            outputTokens: event.metadata.usage.outputTokens ?? 0,
          };
        } else if (event.messageStop) {
          yield { type: "complete", data: fullText };
        }
      }
    }

    yield { type: "done", data: null };
  } catch (err: any) {
    status = 'error';
    errorMessage = err?.message ?? String(err);
    throw err;
  } finally {
    void recordUsage({
      ctx: meterContext,
      modelId,
      usage,
      durationMs: Date.now() - startedAt,
      status,
      errorMessage,
    });
  }
}

/**
 * Get the Bedrock client instance (for external use if needed)
 */
export function getBedrockClient(): BedrockRuntimeClient {
  return bedrockClient;
}
