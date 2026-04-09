import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

async function ensureOrgId(bearer: string, api: string): Promise<string | null> {
  let me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  let orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) {
    await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: bearer } });
    me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
    const meData2 = await me.json();
    orgId = meData2?.orgs?.[0]?.orgId;
  }
  return orgId || null;
}

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const orgId = await ensureOrgId(bearer, api);
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/knowledge-categories`, { headers: { Authorization: bearer } });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const orgId = await ensureOrgId(bearer, api);
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const payload = await req.json();
  const res = await fetch(`${api}/orgs/${orgId}/knowledge-categories`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}
