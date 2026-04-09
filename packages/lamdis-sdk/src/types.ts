/** Confirmation level: how strong the evidence is */
export type ConfirmationLevel = 'A' | 'B' | 'C' | 'D' | 'E';

/** Environment where the workflow is running */
export type Environment = 'ci' | 'staging' | 'production' | 'synthetic';

/** SDK configuration */
export interface LamdisConfig {
  /** API key for authentication (lamdis_sk_...) */
  apiKey: string;
  /** Ingestion endpoint URL */
  endpoint?: string;
  /** Environment label */
  environment?: Environment;
  /** Flush interval in milliseconds (default: 100) */
  flushIntervalMs?: number;
  /** Max events per flush batch (default: 50) */
  maxBatchSize?: number;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/** Options when emitting an event */
export interface EmitOptions {
  /** Custom idempotency key (auto-generated if omitted) */
  idempotencyKey?: string;
  /** Extra metadata */
  metadata?: Record<string, unknown>;
}

/** A single event to be sent to Lamdis */
export interface LamdisEvent {
  workflowInstanceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  emittedAt: string;
  idempotencyKey?: string;
  sequenceNumber?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/** Response from the ingestion API */
export interface IngestResponse {
  accepted: number;
  duplicates: number;
}

/** Workflow instance handle returned by startWorkflow() */
export interface WorkflowHandle {
  /** The distributed workflow instance ID (UUIDv7) */
  readonly id: string;
  /** Emit an evidence event */
  emit(eventType: string, payload: Record<string, unknown>, options?: EmitOptions): Promise<void>;
  /** Mark the workflow as complete and flush remaining events */
  complete(): Promise<void>;
}
