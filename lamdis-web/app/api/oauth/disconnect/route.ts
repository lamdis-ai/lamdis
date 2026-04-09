import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');
  if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/oauth/${encodeURIComponent(provider)}/disconnect`, { method: 'DELETE', headers: { Authorization: bearer } });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text || 'Failed' }, { status: res.status }); }
}
