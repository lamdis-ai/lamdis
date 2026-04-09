import { connect, NatsConnection, JetStreamClient, StringCodec, ConsumerConfig, AckPolicy, DeliverPolicy } from 'nats';
import { db } from '../db.js';
import { evidenceEvents, outcomeTypes, outcomeInstances } from '@lamdis/db/schema';
import { eq } from 'drizzle-orm';
import { correlateEvent } from '../services/correlationEngine.js';
import { resolveConfirmationLevel } from '../services/confirmationLevelResolver.js';
import { evaluateInstance } from '../services/policyEvaluator.js';
import { fireInstanceWebhook } from '../services/instanceWebhooks.js';
import { evaluateProof } from '../services/automation/proofEvaluator.js';
import { proposeActions } from '../services/automation/actionProposer.js';
import { recordIfSignificant } from '../services/automation/dossierGenerator.js';
import { orchestratorTick } from '../services/automation/outcomeOrchestrator.js';

const sc = StringCodec();

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const STREAM_NAME = 'LAMDIS_EVENTS';
const CONSUMER_NAME = 'lamdis-api-processor';
const SUBJECT_FILTER = 'events.ingest.>';

let nc: NatsConnection | null = null;
let running = false;

/**
 * Start the NATS JetStream consumer that:
 * 1. Reads event batches from the LAMDIS_EVENTS stream
 * 2. Writes them to Postgres (evidence_events table)
 * 3. Correlates to outcome instances
 * 4. Triggers proof evaluation
 */
export async function startEventConsumer(): Promise<void> {
  nc = await connect({
    servers: NATS_URL,
    name: 'lamdis-api-event-consumer',
  });

  console.log(`[event-consumer] Connected to NATS at ${NATS_URL}`);

  const jsm = await nc.jetstreamManager();

  // Ensure durable consumer exists
  const consumerConfig: Partial<ConsumerConfig> = {
    durable_name: CONSUMER_NAME,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subject: SUBJECT_FILTER,
    max_ack_pending: 100,
  };

  try {
    await jsm.consumers.info(STREAM_NAME, CONSUMER_NAME);
  } catch {
    await jsm.consumers.add(STREAM_NAME, consumerConfig);
    console.log(`[event-consumer] Created consumer ${CONSUMER_NAME}`);
  }

  const js: JetStreamClient = nc.jetstream();
  const consumer = await js.consumers.get(STREAM_NAME, CONSUMER_NAME);

  running = true;
  console.log('[event-consumer] Processing events...');

  // Process messages in a loop
  while (running) {
    try {
      const messages = await consumer.fetch({ max_messages: 50, expires: 5000 });

      for await (const msg of messages) {
        try {
          const data = JSON.parse(sc.decode(msg.data));
          const events = Array.isArray(data) ? data : [data];
          await processEventBatch(events);
          msg.ack();
        } catch (err) {
          console.error('[event-consumer] Failed to process message:', err);
          // NAK with delay for retry
          msg.nak(5000);
        }
      }
    } catch (err: any) {
      if (running) {
        console.error('[event-consumer] Fetch error:', err?.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
}

/**
 * Process a batch of events:
 * 1. Resolve confirmation levels
 * 2. Insert into evidence_events (with idempotency)
 * 3. Correlate to outcome instances (via correlation engine)
 * 4. Trigger proof evaluation (via policy evaluator)
 */
async function processEventBatch(events: any[]): Promise<void> {
  // Track which instances need re-evaluation
  const instancesToEvaluate = new Set<string>();

  for (const event of events) {
    const {
      orgId,
      // Accept both old SDK field name and new name
      workflowInstanceId: legacyInstanceId,
      outcomeInstanceId: newInstanceId,
      eventType,
      payload,
      confirmationLevel: explicitLevel,
      emittedAt,
      receivedAt,
      idempotencyKey,
      sequenceNumber,
      source,
      metadata,
    } = event;

    const instanceId = newInstanceId || legacyInstanceId;

    // 1. Resolve confirmation level (explicit > auto-classify > default 'A')
    const confirmationLevel = resolveConfirmationLevel(
      eventType,
      explicitLevel,
      payload,
    );

    // 2. Insert event (idempotent via ON CONFLICT)
    try {
      await db.insert(evidenceEvents).values({
        orgId,
        outcomeInstanceId: instanceId,
        eventType,
        eventSource: source || 'sdk',
        payload,
        confirmationLevel,
        emittedAt: new Date(emittedAt),
        receivedAt: new Date(receivedAt || Date.now()),
        idempotencyKey,
        sequenceNumber,
        metadata,
      } as any).onConflictDoNothing({
        target: evidenceEvents.idempotencyKey,
      });
    } catch (err: any) {
      // Ignore unique constraint violations (dedup)
      if (err?.code !== '23505') throw err;
    }

    // 3. Correlate event to outcome instance and definition
    try {
      const correlation = await correlateEvent({
        orgId,
        outcomeInstanceId: instanceId,
        eventType,
        payload,
        confirmationLevel,
        emittedAt,
        metadata,
      });

      // Mark this instance for evaluation if it has a matched outcome type
      if (correlation.outcomeTypeId) {
        instancesToEvaluate.add(correlation.instanceId);
      }
    } catch (err: any) {
      console.error(`[event-consumer] Correlation error for ${instanceId}:`, err?.message);
    }
  }

  // 4. Evaluate proof expectations for all affected instances
  for (const instanceId of instancesToEvaluate) {
    try {
      const result = await evaluateInstance(instanceId);
      if (result.status !== 'open') {
        console.log(`[event-consumer] Instance ${instanceId.slice(0, 8)}... evaluated: ${result.status} (${result.totals.passed}/${result.totals.passed + result.totals.failed} passed)`);

        // Fire webhook on status change
        try {
          const [inst] = await db.select({ outcomeTypeId: outcomeInstances.outcomeTypeId, status: outcomeInstances.status, reviewStatus: outcomeInstances.reviewStatus, totals: outcomeInstances.totals })
            .from(outcomeInstances).where(eq(outcomeInstances.id, instanceId)).limit(1);
          if (inst?.outcomeTypeId) {
            const [ot] = await db.select({ id: outcomeTypes.id, name: outcomeTypes.name, webhook: outcomeTypes.webhook, webhookSecondary: outcomeTypes.webhookSecondary })
              .from(outcomeTypes).where(eq(outcomeTypes.id, inst.outcomeTypeId)).limit(1);
            if (ot) {
              const event = result.status === 'passed' || result.status === 'failed' ? 'completed' : 'status_change';
              fireInstanceWebhook(ot as any, { id: instanceId, status: inst.status, reviewStatus: inst.reviewStatus, totals: inst.totals }, event as any);
            }
          }
        } catch (whErr: any) {
          console.error(`[event-consumer] Webhook error for ${instanceId}:`, whErr?.message);
        }
      }

      // 5. Automation pipeline: proof evaluation → action proposal → dossier
      try {
        const proofResult = await evaluateProof(instanceId);
        const actionResult = await proposeActions(instanceId);
        await recordIfSignificant(instanceId, result, proofResult, actionResult);
      } catch (autoErr: any) {
        console.error(`[event-consumer] Automation pipeline error for ${instanceId}:`, autoErr?.message);
      }

      // 6. Agent orchestrator tick (if agent is enabled for this instance)
      try {
        const [instCheck] = await db.select({ agentEnabled: outcomeInstances.agentEnabled })
          .from(outcomeInstances).where(eq(outcomeInstances.id, instanceId)).limit(1);
        if (instCheck?.agentEnabled) {
          await orchestratorTick(instanceId);
        }
      } catch (agentErr: any) {
        console.error(`[event-consumer] Agent tick error for ${instanceId}:`, agentErr?.message);
      }
    } catch (err: any) {
      console.error(`[event-consumer] Evaluation error for ${instanceId}:`, err?.message);
    }
  }
}

/**
 * Stop the event consumer gracefully.
 */
export async function stopEventConsumer(): Promise<void> {
  running = false;
  if (nc) {
    await nc.drain();
    nc = null;
  }
  console.log('[event-consumer] Stopped');
}
