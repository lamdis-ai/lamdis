import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

// Helper to resolve orgId
async function resolveOrgId(bearer: string) {
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const meData = await me.json().catch(()=>({}));
  return meData?.orgs?.[0]?.orgId;
}

// GET /api/orgs/connections -> list connections for first org
export async function GET() {
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const orgId = await resolveOrgId(bearer);
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });
  const r = await fetch(`${api}/orgs/${orgId}/connections`, { headers: { Authorization: bearer } });
  const txt = await r.text();
  try { return NextResponse.json(JSON.parse(txt), { status: r.status }); } catch { return NextResponse.json({ error: txt }, { status: r.status }); }
}

// POST /api/orgs/connections -> create/update connection
export async function POST(req: NextRequest) {
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const body = await req.json().catch(()=>({}));
  const orgId = await resolveOrgId(bearer);
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });
  const r = await fetch(`${api}/orgs/${orgId}/connections`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  try { return NextResponse.json(JSON.parse(txt), { status: r.status }); } catch { return NextResponse.json({ error: txt }, { status: r.status }); }
}

// DELETE /api/orgs/connections?key=CONN_KEY -> delete entire connection
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Key required' }, { status: 400 });
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const orgId = await resolveOrgId(bearer);
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });
  const r = await fetch(`${api}/orgs/${orgId}/connections/${encodeURIComponent(key)}`, { method: 'DELETE', headers: { Authorization: bearer } });
  const txt = await r.text();
  try { return NextResponse.json(JSON.parse(txt), { status: r.status }); } catch { return NextResponse.json({ error: txt }, { status: r.status }); }
}

export async function HEAD() { /* noop to appease next */ }

export const runtime = 'nodejs';
