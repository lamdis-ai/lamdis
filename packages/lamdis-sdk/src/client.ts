import type { LamdisConfig, LamdisEvent, IngestResponse } from './types.js';

/**
 * HTTP client with batching for the Lamdis event ingestion API.
 *
 * Buffers events in memory and flushes them in batches either:
 * - When the batch reaches maxBatchSize
 * - When flushIntervalMs elapses
 * - When flush() is called explicitly
 */
export class EventClient {
  private buffer: LamdisEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;
  private readonly debug: boolean;

  constructor(config: LamdisConfig) {
    this.endpoint = (config.endpoint || 'http://localhost:3102').replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.maxBatchSize = config.maxBatchSize ?? 50;
    this.flushIntervalMs = config.flushIntervalMs ?? 100;
    this.maxRetries = config.maxRetries ?? 3;
    this.debug = config.debug ?? false;

    // Start periodic flush
    this.timer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush().catch(this.logError.bind(this));
      }
    }, this.flushIntervalMs);

    // Ensure timer doesn't prevent process exit
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  /**
   * Add an event to the buffer. Triggers flush if batch size reached.
   */
  async enqueue(event: LamdisEvent): Promise<void> {
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Flush all buffered events to the ingestion API.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0, this.maxBatchSize);
    await this.sendBatch(events);
  }

  /**
   * Flush remaining events and stop the periodic timer.
   */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private async sendBatch(events: LamdisEvent[]): Promise<IngestResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.endpoint}/v1/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-lamdis-api-key': this.apiKey,
          },
          body: JSON.stringify({ events }),
        });

        if (response.ok) {
          const result = await response.json() as IngestResponse;
          if (this.debug) {
            console.log(`[lamdis-sdk] Sent ${events.length} events: ${result.accepted} accepted, ${result.duplicates} duplicates`);
          }
          return result;
        }

        // Non-retryable status codes
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          const body = await response.text();
          throw new Error(`Lamdis ingestion failed (${response.status}): ${body}`);
        }

        lastError = new Error(`Lamdis ingestion failed (${response.status})`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof Error && err.message.includes('ingestion failed (4')) {
          throw err; // Don't retry 4xx errors
        }
      }

      // Exponential backoff with jitter
      if (attempt < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted — re-queue events and throw
    this.buffer.unshift(...events);
    throw lastError || new Error('Lamdis ingestion failed after retries');
  }

  private logError(err: unknown): void {
    if (this.debug) {
      console.error('[lamdis-sdk] Flush error:', err);
    }
  }
}
