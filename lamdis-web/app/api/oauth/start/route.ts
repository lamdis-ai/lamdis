import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.redirect(new URL('/api/auth/login', req.url));
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const provider = new URL(req.url).searchParams.get('provider');
  if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/oauth/${encodeURIComponent(provider)}/start`, { redirect: 'manual', headers: { Authorization: bearer } });
  const loc = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && loc) return NextResponse.redirect(loc);
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text || 'Failed' }, { status: res.status }); }
}
