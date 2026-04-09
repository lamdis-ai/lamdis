import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function PATCH(req: NextRequest, props: { params: Promise<{ manifestId: string }> }) {
  const params = await props.params;
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const body = await req.json();
  const res = await fetch(`${api}/orgs/${orgId}/manifests/${params.manifestId}`, { method: 'PATCH', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ manifestId: string }> }) {
  const params = await props.params;
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/manifests/${params.manifestId}`, { method: 'DELETE', headers: { Authorization: bearer } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
