/**
 * Unified Assistant Client
 * 
 * This module provides a unified interface for communicating with AI assistants
 * across different protocols: HTTP (sync), SSE (server-sent events), and WebSocket.
 * The protocol is determined by the connection configuration.
 */

import fetch from 'cross-fetch';
import { sendSSEMessage, SSEClientConfig } from './sseClient.js';
import { sendWebSocketMessage, WebSocketClientConfig } from './websocketClient.js';
import { interpolateDeep, interpolateString } from './interpolation.js';

/**
 * Supported communication protocols for assistants
 */
export type AssistantProtocol = 'http' | 'http_chat' | 'sse' | 'websocket';

/**
 * Configuration for SSE-specific settings
 */
export type SSEConfig = {
  contentPath?: string;
  finishPath?: string;
  finishValue?: string | string[];
};

/**
 * Configuration for WebSocket-specific settings
 */
export type WebSocketConfig = {
  messageFormat?: 'json' | 'text';
  messageField?: string;
  contentPath?: string;
  finishPath?: string;
  finishValue?: string | string[];
  protocols?: string | string[];
  pingIntervalMs?: number;
};

/**
 * Connection configuration that determines how to communicate with an assistant
 */
export type AssistantConnectionConfig = {
  // Base URL for the assistant endpoint
  baseUrl: string;
  // Protocol to use (defaults to 'http_chat')
  protocol?: AssistantProtocol;
  // Headers to include in requests
  headers?: Record<string, string>;
  // Timeout in milliseconds
  timeoutMs?: number;
  // Path to the response field (e.g., 'reply', 'data.response')
  responseFieldPath?: string;
  // SSE-specific configuration
  sse?: SSEConfig;
  // WebSocket-specific configuration
  websocket?: WebSocketConfig;
};

/**
 * Result from sending a message to an assistant
 */
export type AssistantMessageResult = {
  // The full response text from the assistant
  reply: string;
  // The full response object (for structured responses)
  fullResponse: any;
  // Latency in milliseconds
  latencyMs: number;
  // Time to first token (for streaming protocols)
  firstTokenMs?: number;
  // Protocol used
  protocol: AssistantProtocol;
  // Whether the response was streamed
  streamed: boolean;
  // Any error that occurred
  error?: string;
  // Chunks received (for streaming protocols)
  chunks?: string[];
};

/**
 * Extract value from object using dot notation path with array index support
 */
function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let val = obj;
  for (const part of parts) {
    if (val == null) return undefined;
    const match = part.match(/^([^\[]+)\[(\d+)\]$/);
    if (match) {
      val = val[match[1]];
      if (Array.isArray(val)) {
        val = val[parseInt(match[2], 10)];
      } else {
        return undefined;
      }
    } else {
      val = val[part];
    }
  }
  return val;
}

/**
 * Send a message using synchronous HTTP POST
 */
async function sendHttpMessage(
  config: AssistantConnectionConfig,
  payload: any,
): Promise<AssistantMessageResult> {
  const startTime = Date.now();
  const { baseUrl, headers = {}, timeoutMs = 60000, responseFieldPath = 'reply' } = config;
  
  const chatUrl = `${baseUrl.replace(/\/$/, '')}/chat`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const resp = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      throw new Error(`http_chat_failed ${resp.status}: ${errTxt || '(no body)'}`);
    }
    
    const fullResponse = await resp.json().catch(() => ({}));
    
    // Extract reply using the configured responseFieldPath
    let reply: any = fullResponse;
    for (const part of responseFieldPath.split('.')) {
      reply = reply?.[part];
    }
    
    if (typeof reply !== 'string' || !reply.trim()) {
      throw new Error(`reply_missing (expected at ${responseFieldPath})`);
    }
    
    return {
      reply,
      fullResponse,
      latencyMs: Date.now() - startTime,
      protocol: 'http_chat',
      streamed: false,
    };
  } catch (e: any) {
    return {
      reply: '',
      fullResponse: null,
      latencyMs: Date.now() - startTime,
      protocol: 'http_chat',
      streamed: false,
      error: e.name === 'AbortError' ? 'Request timeout' : e.message,
    };
  }
}

/**
 * Send a message using SSE (Server-Sent Events)
 */
async function sendSSEAssistantMessage(
  config: AssistantConnectionConfig,
  payload: any,
  onChunk?: (chunk: string) => void,
): Promise<AssistantMessageResult> {
  const { 
    baseUrl, 
    headers = {}, 
    timeoutMs = 60000, 
    responseFieldPath = 'reply',
    sse = {} 
  } = config;
  
  // Determine the SSE endpoint URL
  // Common patterns: /chat/stream, /stream, /v1/chat/completions (with stream: true)
  let streamUrl = baseUrl.replace(/\/$/, '');
  if (!streamUrl.includes('/stream') && !streamUrl.includes('/completions')) {
    streamUrl += '/chat/stream';
  }
  
  const sseConfig: SSEClientConfig = {
    url: streamUrl,
    headers,
    timeoutMs,
    contentPath: sse.contentPath || 'choices[0].delta.content',
    finishPath: sse.finishPath || 'choices[0].finish_reason',
    finishValue: sse.finishValue || ['stop', 'length', 'content_filter'],
  };
  
  // For OpenAI-compatible APIs, add stream: true to payload
  const streamPayload = { ...payload, stream: true };
  
  const result = await sendSSEMessage(sseConfig, streamPayload, (chunk) => {
    onChunk?.(chunk);
  });
  
  return {
    reply: result.fullResponse,
    fullResponse: result.rawResponse,
    latencyMs: result.latencyMs,
    firstTokenMs: result.firstTokenMs,
    protocol: 'sse',
    streamed: true,
    error: result.error,
    chunks: result.chunks,
  };
}

/**
 * Send a message using WebSocket
 */
async function sendWebSocketAssistantMessage(
  config: AssistantConnectionConfig,
  payload: any,
  onChunk?: (chunk: string) => void,
): Promise<AssistantMessageResult> {
  const { 
    baseUrl, 
    headers = {}, 
    timeoutMs = 60000,
    websocket = {} 
  } = config;
  
  // Convert HTTP URL to WebSocket URL
  let wsUrl = baseUrl.replace(/^http/, 'ws');
  if (!wsUrl.includes('/ws') && !wsUrl.includes('/socket') && !wsUrl.includes('/realtime')) {
    wsUrl += '/ws';
  }
  
  const wsConfig: WebSocketClientConfig = {
    url: wsUrl,
    headers,
    timeoutMs,
    messageFormat: websocket.messageFormat || 'json',
    messageField: websocket.messageField || 'message',
    contentPath: websocket.contentPath || 'content',
    finishPath: websocket.finishPath || 'done',
    finishValue: websocket.finishValue || ['done', 'complete', 'true'],
    protocols: websocket.protocols,
    pingIntervalMs: websocket.pingIntervalMs,
    closeOnDone: true,
  };
  
  const messageContent = payload.message || payload.content || '';
  
  const result = await sendWebSocketMessage(wsConfig, messageContent, payload, (chunk) => {
    onChunk?.(chunk);
  });
  
  return {
    reply: result.fullResponse,
    fullResponse: result.rawResponse,
    latencyMs: result.latencyMs,
    firstTokenMs: result.firstTokenMs,
    protocol: 'websocket',
    streamed: true,
    error: result.error,
    chunks: result.chunks,
  };
}

/**
 * Send a message to an assistant using the appropriate protocol
 * 
 * @param config Connection configuration for the assistant
 * @param payload Message payload to send
 * @param onChunk Optional callback for streaming responses
 */
export async function sendAssistantMessage(
  config: AssistantConnectionConfig,
  payload: any,
  onChunk?: (chunk: string) => void,
): Promise<AssistantMessageResult> {
  const protocol = config.protocol || 'http_chat';
  
  switch (protocol) {
    case 'sse':
      return sendSSEAssistantMessage(config, payload, onChunk);
    
    case 'websocket':
      return sendWebSocketAssistantMessage(config, payload, onChunk);
    
    case 'http':
    case 'http_chat':
    default:
      return sendHttpMessage(config, payload);
  }
}

/**
 * Create an assistant connection config from organization connection data
 */
export function createConnectionConfig(
  connection: any,
  overrides?: Partial<AssistantConnectionConfig>,
): AssistantConnectionConfig {
  // Support both new protocol field and legacy channel field
  const protocol = connection.protocol || connection.channel || 'http_chat';
  
  return {
    baseUrl: connection.base_url || connection.baseUrl || '',
    protocol: protocol as AssistantProtocol,
    headers: connection.headers || {},
    timeoutMs: connection.timeoutMs || connection.timeout_ms || 60000,
    responseFieldPath: connection.responseFieldPath || connection.response_field_path || 'reply',
    sse: connection.sse || {
      contentPath: connection.sse_content_path,
      finishPath: connection.sse_finish_path,
      finishValue: connection.sse_finish_value,
    },
    websocket: connection.websocket || {
      messageFormat: connection.ws_message_format,
      messageField: connection.ws_message_field,
      contentPath: connection.ws_content_path,
      finishPath: connection.ws_finish_path,
      finishValue: connection.ws_finish_value,
      protocols: connection.ws_protocols,
    },
    ...overrides,
  };
}

/**
 * Determine if a protocol supports streaming
 */
export function isStreamingProtocol(protocol: AssistantProtocol): boolean {
  return protocol === 'sse' || protocol === 'websocket';
}