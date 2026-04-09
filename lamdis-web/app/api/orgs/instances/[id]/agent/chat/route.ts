import { getBearerSafe } from '@/lib/auth';

const API_URL = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getOrgId(token: string): Promise<string | null> {
  const me = await fetch(`${API_URL()}/me`, { headers: { Authorization: token } });
  const meJson: any = await me.json().catch(() => ({}));
  return meJson?.orgs?.[0]?.orgId || null;
}

/**
 * Streaming proxy for agent chat — passes through SSE events from the API.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getBearerSafe();
  if (!token) return new Response('Unauthorized', { status: 401 });
  const orgId = await getOrgId(token);
  if (!orgId) return new Response('No org', { status: 400 });

  const body = await req.text();

  const apiRes = await fetch(`${API_URL()}/orgs/${orgId}/outcome-instances/${id}/agent/chat`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body,
  });

  // Pass through the SSE stream
  return new Response(apiRes.body, {
    status: apiRes.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
