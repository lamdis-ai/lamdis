import type { EmitOptions, WorkflowHandle, LamdisEvent, Environment } from './types.js';
import type { EventClient } from './client.js';
import { uuidv7 } from './uuidv7.js';

/**
 * Represents a single workflow instance.
 * Created by Lamdis.startWorkflow().
 */
export class WorkflowInstance implements WorkflowHandle {
  readonly id: string;
  private seq = 0;
  private completed = false;
  private readonly client: EventClient;
  private readonly workflowKey: string;
  private readonly environment: Environment;
  private readonly source: string;

  constructor(
    client: EventClient,
    workflowKey: string,
    environment: Environment,
    source?: string,
    existingId?: string,
  ) {
    this.id = existingId ?? uuidv7();
    this.client = client;
    this.workflowKey = workflowKey;
    this.environment = environment;
    this.source = source ?? 'sdk';
  }

  /**
   * Emit an evidence event for this workflow instance.
   */
  async emit(
    eventType: string,
    payload: Record<string, unknown>,
    options?: EmitOptions,
  ): Promise<void> {
    if (this.completed) {
      throw new Error(`Workflow instance ${this.id} is already completed`);
    }

    this.seq++;

    const event: LamdisEvent = {
      workflowInstanceId: this.id,
      eventType,
      payload,
      emittedAt: new Date().toISOString(),
      idempotencyKey: options?.idempotencyKey ?? `${this.id}:${eventType}:${this.seq}`,
      sequenceNumber: this.seq,
      source: this.source,
      metadata: {
        ...options?.metadata,
        workflowKey: this.workflowKey,
        environment: this.environment,
      },
    };

    await this.client.enqueue(event);
  }

  /**
   * Mark the workflow as complete and flush remaining events.
   */
  async complete(): Promise<void> {
    if (this.completed) return;

    await this.emit('workflow.completed', {
      workflowKey: this.workflowKey,
    });

    this.completed = true;
    await this.client.flush();
  }
}
