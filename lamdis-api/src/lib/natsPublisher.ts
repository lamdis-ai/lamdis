import { connect, NatsConnection, JetStreamClient, JetStreamManager, StringCodec } from 'nats';

let nc: NatsConnection | null = null;
let js: JetStreamClient | null = null;

const sc = StringCodec();

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const STREAM_NAME = 'LAMDIS_EVENTS';
const SUBJECT_INGEST = 'events.ingest';

/**
 * Connect to NATS and ensure the JetStream stream exists.
 * Called lazily on first publish.
 */
async function ensureConnected(): Promise<JetStreamClient> {
  if (nc && js) return js;

  nc = await connect({
    servers: NATS_URL,
    name: 'lamdis-api-publisher',
  });

  console.log(`[nats-publisher] Connected to ${NATS_URL}`);

  const jsm: JetStreamManager = await nc.jetstreamManager();

  // Ensure the stream exists
  try {
    await jsm.streams.info(STREAM_NAME);
  } catch {
    await jsm.streams.add({
      name: STREAM_NAME,
      subjects: [`${SUBJECT_INGEST}.>`],
      retention: 'workqueue' as any,
      max_age: 24 * 60 * 60 * 1_000_000_000, // 24h in nanoseconds
      max_bytes: 1024 * 1024 * 1024, // 1 GB
      storage: 'file' as any,
      num_replicas: 1,
    });
    console.log(`[nats-publisher] Created stream ${STREAM_NAME}`);
  }

  js = nc.jetstream();
  return js;
}

/**
 * Publish an event batch to JetStream.
 */
export async function publishEvents(orgId: string, events: unknown[]): Promise<void> {
  const client = await ensureConnected();
  const subject = `${SUBJECT_INGEST}.${orgId}`;
  const data = sc.encode(JSON.stringify(events));
  await client.publish(subject, data);
}

/**
 * Gracefully close the publisher NATS connection.
 */
export async function closeNatsPublisher(): Promise<void> {
  if (nc) {
    await nc.drain();
    nc = null;
    js = null;
    console.log('[nats-publisher] Disconnected');
  }
}
