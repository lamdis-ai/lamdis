import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
  const res = await fetch(`${api}/orgs/${orgId}/assistants`, { headers: { Authorization: bearer } });
  const data = await res.json();
  const assistants = Array.isArray(data?.assistants) ? data.assistants : [];
  return NextResponse.json(assistants);
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
  const res = await fetch(`${api}/orgs/${orgId}/assistants`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body: JSON.stringify(payload) });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  let meData = await me.json();
  let orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/assistants/${encodeURIComponent(id || '')}`, { method: 'DELETE', headers: { Authorization: bearer } });
  return new NextResponse(null, { status: res.status });
}