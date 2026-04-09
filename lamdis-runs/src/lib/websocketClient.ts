/**
 * WebSocket Client for Assistant Communication
 * 
 * This module provides a client for communicating with assistants that use WebSocket
 * for bidirectional streaming communication. WebSocket is commonly used for real-time
 * chat applications and some AI providers.
 */

import WebSocket from 'ws';

export type WebSocketClientConfig = {
  url: string;
  headers?: Record<string, string>;
  protocols?: string | string[];
  timeoutMs?: number;
  // How to send the message (as JSON object or raw text)
  messageFormat?: 'json' | 'text';
  // Field in JSON message to put the user content
  messageField?: string;
  // Field path to extract the content from received messages
  contentPath?: string;
  // Field path to check if the conversation is done
  finishPath?: string;
  // The value(s) that indicate the conversation is finished
  finishValue?: string | string[];
  // Whether to close connection after receiving response
  closeOnDone?: boolean;
  // Ping interval in ms (0 to disable)
  pingIntervalMs?: number;
};

export type WebSocketMessage = {
  raw: string;
  parsed?: any;
  timestamp: number;
};

export type WebSocketStreamResult = {
  fullResponse: string;
  chunks: string[];
  messages: WebSocketMessage[];
  rawResponse?: any;
  error?: string;
  latencyMs: number;
  firstTokenMs?: number;
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
 * Set value at path in an object
 */
function setByPath(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * WebSocket client class for managing persistent connections
 */
export class WebSocketAssistantClient {
  private ws: WebSocket | null = null;
  private config: WebSocketClientConfig;
  private pingInterval: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private isConnected: boolean = false;

  constructor(config: WebSocketClientConfig) {
    this.config = {
      messageFormat: 'json',
      messageField: 'message',
      contentPath: 'content',
      closeOnDone: true,
      pingIntervalMs: 30000,
      timeoutMs: 60000,
      ...config,
    };
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { url, headers, protocols, timeoutMs } = this.config;

      const wsOptions: WebSocket.ClientOptions = {
        headers,
        handshakeTimeout: timeoutMs,
      };

      this.ws = new WebSocket(url, protocols, wsOptions);

      const connectTimeout = setTimeout(() => {
        if (!this.isConnected) {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, timeoutMs || 30000);

      this.ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.isConnected = true;
        this.startPing();
        resolve();
      });

      this.ws.on('error', (err) => {
        clearTimeout(connectTimeout);
        reject(err);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        this.stopPing();
      });

      this.ws.on('message', (data) => {
        const raw = data.toString();
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
        this.messageQueue.push({
          raw,
          parsed,
          timestamp: Date.now(),
        });
      });
    });
  }

  /**
   * Start ping/pong to keep connection alive
   */
  private startPing(): void {
    const { pingIntervalMs } = this.config;
    if (pingIntervalMs && pingIntervalMs > 0) {
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, pingIntervalMs);
    }
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Send a message and wait for response
   */
  async sendMessage(
    content: string,
    additionalPayload?: Record<string, any>,
    onChunk?: (chunk: string, message: WebSocketMessage) => void,
  ): Promise<WebSocketStreamResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const startTime = Date.now();
    let firstTokenTime: number | undefined;
    const chunks: string[] = [];
    const messages: WebSocketMessage[] = [];
    let rawResponse: any;
    let error: string | undefined;

    const {
      messageFormat,
      messageField,
      contentPath,
      finishPath,
      finishValue,
      closeOnDone,
      timeoutMs,
    } = this.config;

    // Clear any pending messages
    this.messageQueue = [];

    // Build and send the message
    let outMessage: string;
    if (messageFormat === 'json') {
      const payload: any = { ...additionalPayload };
      setByPath(payload, messageField || 'message', content);
      outMessage = JSON.stringify(payload);
    } else {
      outMessage = content;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        error = 'Response timeout';
        cleanup();
        resolve(buildResult());
      }, timeoutMs || 60000);

      const finishValues = Array.isArray(finishValue) 
        ? finishValue 
        : finishValue ? [finishValue] : ['done', 'complete', 'end'];

      let done = false;

      const processMessage = (msg: WebSocketMessage) => {
        messages.push(msg);

        if (msg.parsed) {
          rawResponse = msg.parsed;

          // Extract content
          const contentValue = getByPath(msg.parsed, contentPath || 'content');
          if (typeof contentValue === 'string' && contentValue) {
            if (!firstTokenTime) {
              firstTokenTime = Date.now();
            }
            chunks.push(contentValue);
            onChunk?.(contentValue, msg);
          }

          // Check for finish condition
          if (finishPath) {
            const finishReason = getByPath(msg.parsed, finishPath);
            if (finishReason && finishValues.includes(String(finishReason))) {
              done = true;
            }
          }

          // Also check for common done indicators
          if (msg.parsed.done === true || msg.parsed.finished === true || msg.parsed.complete === true) {
            done = true;
          }
        } else if (msg.raw) {
          // Plain text message
          if (msg.raw === '[DONE]' || msg.raw === 'done' || msg.raw === 'END') {
            done = true;
          } else {
            if (!firstTokenTime) {
              firstTokenTime = Date.now();
            }
            chunks.push(msg.raw);
            onChunk?.(msg.raw, msg);
          }
        }

        return done;
      };

      const messageHandler = (data: WebSocket.Data) => {
        const raw = data.toString();
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
        const msg: WebSocketMessage = {
          raw,
          parsed,
          timestamp: Date.now(),
        };

        const isDone = processMessage(msg);
        if (isDone) {
          cleanup();
          resolve(buildResult());
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.ws?.off('message', messageHandler);
        if (closeOnDone) {
          this.close();
        }
      };

      const buildResult = (): WebSocketStreamResult => ({
        fullResponse: chunks.join(''),
        chunks,
        messages,
        rawResponse,
        error,
        latencyMs: Date.now() - startTime,
        firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
      });

      // Attach message handler
      this.ws!.on('message', messageHandler);

      // Send the message
      this.ws!.send(outMessage, (err) => {
        if (err) {
          error = err.message;
          cleanup();
          resolve(buildResult());
        }
      });
    });
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Send a one-shot message to a WebSocket assistant
 * Creates connection, sends message, waits for response, and closes
 */
export async function sendWebSocketMessage(
  config: WebSocketClientConfig,
  content: string,
  additionalPayload?: Record<string, any>,
  onChunk?: (chunk: string, message: WebSocketMessage) => void,
): Promise<WebSocketStreamResult> {
  const client = new WebSocketAssistantClient({
    ...config,
    closeOnDone: true,
  });

  try {
    await client.connect();
    return await client.sendMessage(content, additionalPayload, onChunk);
  } catch (e: any) {
    return {
      fullResponse: '',
      chunks: [],
      messages: [],
      error: e.message || 'WebSocket connection failed',
      latencyMs: 0,
    };
  } finally {
    client.close();
  }
}

/**
 * Create a WebSocket client configuration for common providers
 */
export function createWebSocketConfig(
  provider: 'openai-realtime' | 'anthropic' | 'custom',
  baseConfig: Partial<WebSocketClientConfig>,
): WebSocketClientConfig {
  const defaults: Record<string, Partial<WebSocketClientConfig>> = {
    'openai-realtime': {
      messageFormat: 'json',
      messageField: 'input',
      contentPath: 'delta.content',
      finishPath: 'type',
      finishValue: ['response.done', 'response.audio_transcript.done'],
    },
    anthropic: {
      messageFormat: 'json',
      messageField: 'content',
      contentPath: 'delta.text',
      finishPath: 'type',
      finishValue: ['message_stop', 'content_block_stop'],
    },
    custom: {},
  };

  return {
    url: '',
    timeoutMs: 60000,
    closeOnDone: true,
    ...defaults[provider],
    ...baseConfig,
  } as WebSocketClientConfig;
}