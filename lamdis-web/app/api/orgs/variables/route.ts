import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  // Fetch org id
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const meData = await me.json().catch(()=>({}));
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });
  const r = await fetch(`${api}/orgs/${orgId}/variables`, { headers: { Authorization: bearer } });
  const txt = await r.text();
  try { return NextResponse.json(JSON.parse(txt), { status: r.status }); } catch { return NextResponse.json({ error: txt }, { status: r.status }); }
}

export async function POST(req: NextRequest) {
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const body = await req.json();
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const meData = await me.json().catch(()=>({}));
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });
  const r = await fetch(`${api}/orgs/${orgId}/variables`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  try { return NextResponse.json(JSON.parse(txt), { status: r.status }); } catch { return NextResponse.json({ error: txt }, { status: r.status }); }
}
