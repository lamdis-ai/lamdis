import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  // Resolve orgId via /me (with bootstrap fallback)
  let me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  let meData = await me.json();
  let orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) {
    await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: bearer } });
    me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
    meData = await me.json();
    orgId = meData?.orgs?.[0]?.orgId;
  }
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/actions/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body: JSON.stringify(body) });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return NextResponse.json(data, { status: res.status });
}
