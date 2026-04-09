import { getBearerSafe } from '@/lib/auth';

const API_URL = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getOrgId(token: string): Promise<string | null> {
  const me = await fetch(`${API_URL()}/me`, { headers: { Authorization: token } });
  const meJson: any = await me.json().catch(() => ({}));
  return meJson?.orgs?.[0]?.orgId || null;
}

/**
 * Mint a single-use viewer token for the live browser WebSocket.
 * Returns { token, wsUrl } where wsUrl is the direct WebSocket URL the client connects to.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getBearerSafe();
  if (!token) return new Response('Unauthorized', { status: 401 });
  const orgId = await getOrgId(token);
  if (!orgId) return new Response('No org', { status: 400 });

  const apiRes = await fetch(
    `${API_URL()}/orgs/${orgId}/outcome-instances/${id}/browser-view/token`,
    {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: '{}',
    }
  );

  if (!apiRes.ok) {
    return new Response('Failed to mint viewer token', { status: apiRes.status });
  }

  const data: any = await apiRes.json();
  const wsBase = API_URL().replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/browser-view/ws?token=${encodeURIComponent(data.token)}`;

  return Response.json({ token: data.token, wsUrl, expiresInMs: data.expiresInMs });
}
