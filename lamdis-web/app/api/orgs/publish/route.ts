import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST() {
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
  const res = await fetch(`${api}/orgs/${orgId}/manifest/publish`, { method: 'POST', headers: { Authorization: bearer } });
  const text = await res.text();
  try {
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: text || 'Publish failed' }, { status: res.status });
  }
}

// bearer helper moved to lib/auth
