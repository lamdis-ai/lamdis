import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

// GET /api/orgs/providers -> provider union (scopes + mode) for first org of current user
export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const meResp = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await meResp.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ providers: [] });
  const res = await fetch(`${api}/orgs/${orgId}/providers`, { headers: { Authorization: bearer } });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text || 'Failed' }, { status: res.status }); }
}

// POST /api/orgs/providers { provider, mode } -> set provider mode (agent|lamdis)
export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const { provider, mode } = body || {};
  const meResp = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await meResp.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  if (!provider || !mode) return NextResponse.json({ error: 'provider and mode required' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/providers/${encodeURIComponent(provider)}/mode`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text || 'Failed' }, { status: res.status }); }
}
