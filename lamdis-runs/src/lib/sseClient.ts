/**
 * Server-Sent Events (SSE) Client for Assistant Communication
 * 
 * This module provides a client for communicating with assistants that use SSE
 * for streaming responses. SSE is commonly used by OpenAI-compatible APIs and
 * many other AI chat providers.
 */

import fetch from 'cross-fetch';

export type SSEClientConfig = {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  // Field path to extract the content from each SSE event data
  // e.g., "choices[0].delta.content" for OpenAI format
  contentPath?: string;
  // Field path to check if the stream is done
  // e.g., "choices[0].finish_reason" for OpenAI format
  finishPath?: string;
  // The value that indicates the stream is finished
  finishValue?: string | string[];
};

export type SSEEvent = {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
};

export type SSEStreamResult = {
  fullResponse: string;
  chunks: string[];
  events: SSEEvent[];
  rawResponse?: any;
  error?: string;
  latencyMs: number;
  firstTokenMs?: number;
};

/**
 * Parse SSE event lines into structured events
 */
function parseSSEEvents(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = text.split('\n');
  let currentEvent: Partial<SSEEvent> = {};
  let dataLines: string[] = [];

  for (const line of lines) {
    if (line === '') {
      // Empty line indicates end of event
      if (dataLines.length > 0) {
        currentEvent.data = dataLines.join('\n');
        events.push(currentEvent as SSEEvent);
      }
      currentEvent = {};
      dataLines = [];
      continue;
    }

    if (line.startsWith(':')) {
      // Comment line, ignore
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      // Field name only, treat as empty value
      const field = line;
      if (field === 'data') {
        dataLines.push('');
      }
      continue;
    }

    const field = line.slice(0, colonIndex);
    // Value starts after colon, strip leading space if present
    let value = line.slice(colonIndex + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    switch (field) {
      case 'id':
        currentEvent.id = value;
        break;
      case 'event':
        currentEvent.event = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'retry':
        currentEvent.retry = parseInt(value, 10);
        break;
    }
  }

  // Handle case where stream doesn't end with empty line
  if (dataLines.length > 0) {
    currentEvent.data = dataLines.join('\n');
    events.push(currentEvent as SSEEvent);
  }

  return events;
}

/**
 * Extract value from object using dot notation path with array index support
 * e.g., "choices[0].delta.content"
 */
function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let val = obj;
  for (const part of parts) {
    if (val == null) return undefined;
    // Handle array index notation like items[0]
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
 * Send a message to an SSE-based assistant and collect the streamed response
 */
export async function sendSSEMessage(
  config: SSEClientConfig,
  payload: any,
  onChunk?: (chunk: string, event: SSEEvent) => void,
): Promise<SSEStreamResult> {
  const startTime = Date.now();
  let firstTokenTime: number | undefined;
  const chunks: string[] = [];
  const events: SSEEvent[] = [];
  let error: string | undefined;
  let rawResponse: any;

  const {
    url,
    headers = {},
    timeoutMs = 60000,
    contentPath = 'choices[0].delta.content',
    finishPath = 'choices[0].finish_reason',
    finishValue = ['stop', 'length', 'content_filter'],
  } = config;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`SSE request failed: ${response.status} ${errText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Handle non-streaming JSON response (fallback)
    if (contentType.includes('application/json')) {
      const json = await response.json();
      rawResponse = json;
      const content = getByPath(json, contentPath.replace('.delta.', '.message.')) || 
                     json.reply || 
                     json.content || 
                     json.response ||
                     (typeof json.choices?.[0]?.message?.content === 'string' ? json.choices[0].message.content : '');
      if (content) {
        chunks.push(content);
        firstTokenTime = Date.now();
      }
      return {
        fullResponse: content || '',
        chunks,
        events: [],
        rawResponse,
        latencyMs: Date.now() - startTime,
        firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
      };
    }

    // Handle SSE streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    const finishValues = Array.isArray(finishValue) ? finishValue : [finishValue];

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete events in the buffer
      const eventEndIndex = buffer.lastIndexOf('\n\n');
      if (eventEndIndex !== -1) {
        const completeEvents = buffer.slice(0, eventEndIndex + 2);
        buffer = buffer.slice(eventEndIndex + 2);
        
        const parsedEvents = parseSSEEvents(completeEvents);
        
        for (const event of parsedEvents) {
          events.push(event);
          
          // Check for [DONE] signal (OpenAI convention)
          if (event.data === '[DONE]') {
            done = true;
            break;
          }

          try {
            const data = JSON.parse(event.data);
            rawResponse = data;

            // Extract content chunk
            const content = getByPath(data, contentPath);
            if (typeof content === 'string' && content) {
              if (!firstTokenTime) {
                firstTokenTime = Date.now();
              }
              chunks.push(content);
              onChunk?.(content, event);
            }

            // Check for finish condition
            const finishReason = getByPath(data, finishPath);
            if (finishReason && finishValues.includes(String(finishReason))) {
              done = true;
              break;
            }
          } catch {
            // Not JSON, might be a plain text chunk
            if (event.data && event.data !== '[DONE]') {
              if (!firstTokenTime) {
                firstTokenTime = Date.now();
              }
              chunks.push(event.data);
              onChunk?.(event.data, event);
            }
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const remainingEvents = parseSSEEvents(buffer);
      for (const event of remainingEvents) {
        if (event.data && event.data !== '[DONE]') {
          events.push(event);
          try {
            const data = JSON.parse(event.data);
            const content = getByPath(data, contentPath);
            if (typeof content === 'string' && content) {
              chunks.push(content);
            }
          } catch {
            chunks.push(event.data);
          }
        }
      }
    }

  } catch (e: any) {
    if (e.name === 'AbortError') {
      error = 'Request timeout';
    } else {
      error = e.message || 'SSE request failed';
    }
  } finally {
    clearTimeout(timeout);
  }

  return {
    fullResponse: chunks.join(''),
    chunks,
    events,
    rawResponse,
    error,
    latencyMs: Date.now() - startTime,
    firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
  };
}

/**
 * Create an SSE client configuration for common providers
 */
export function createSSEConfig(
  provider: 'openai' | 'anthropic' | 'azure' | 'custom',
  baseConfig: Partial<SSEClientConfig>,
): SSEClientConfig {
  const defaults: Record<string, Partial<SSEClientConfig>> = {
    openai: {
      contentPath: 'choices[0].delta.content',
      finishPath: 'choices[0].finish_reason',
      finishValue: ['stop', 'length', 'content_filter'],
    },
    anthropic: {
      contentPath: 'delta.text',
      finishPath: 'delta.stop_reason',
      finishValue: ['end_turn', 'max_tokens', 'stop_sequence'],
    },
    azure: {
      contentPath: 'choices[0].delta.content',
      finishPath: 'choices[0].finish_reason',
      finishValue: ['stop', 'length', 'content_filter'],
    },
    custom: {},
  };

  return {
    url: '',
    timeoutMs: 60000,
    ...defaults[provider],
    ...baseConfig,
  } as SSEClientConfig;
}