import { getBearerSafe } from '@/lib/auth';
import { getOrgId } from '@/lib/apiProxy';

const INGEST_URL = () => (process.env.LAMDIS_INGEST_URL || 'http://localhost:3102').replace(/\/$/, '');

export async function POST(req: Request) {
  try {
    const token = await getBearerSafe();
    if (!token) return new Response('Unauthorized', { status: 401 });
    const orgId = await getOrgId(token);
    if (!orgId) return new Response('No org', { status: 400 });

    const body = await req.json();
    const { apiKey, events } = body;

    if (!apiKey || !Array.isArray(events) || events.length === 0) {
      return Response.json({ error: 'apiKey and events[] are required' }, { status: 400 });
    }

    // Add emittedAt and idempotencyKey to each event if missing
    const enriched = events.map((evt: any) => ({
      ...evt,
      emittedAt: evt.emittedAt || new Date().toISOString(),
      idempotencyKey: evt.idempotencyKey || crypto.randomUUID(),
    }));

    const res = await fetch(`${INGEST_URL()}/v1/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lamdis-api-key': apiKey,
      },
      body: JSON.stringify({ events: enriched }),
    });

    const txt = await res.text();
    return new Response(txt, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed to send events' }, { status: 500 });
  }
}
