import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getOrgId(token: string, api: string): Promise<string | null> {
  let me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' });
  let meData = await me.json();
  let orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) {
    await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: token } });
    me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' });
    meData = await me.json();
    orgId = meData?.orgs?.[0]?.orgId;
  }
  return orgId || null;
}

export async function GET(req: NextRequest) {
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const orgId = await getOrgId(token, api);
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 400 });

    const url = new URL(req.url);
    const params = url.searchParams.toString();
    const qs = params ? `?${params}` : '';

    const resp = await fetch(`${api}/orgs/${orgId}/setups${qs}`, {
      headers: { Authorization: token },
      cache: 'no-store',
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const orgId = await getOrgId(token, api);
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 400 });

    const body = await req.json();
    const resp = await fetch(`${api}/orgs/${orgId}/setups`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
