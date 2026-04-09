import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

async function getOrgId(api: string, token: string) {
  const me = await fetch(`${api}/me`, { headers: { Authorization: token } }).then(r => r.json());
  return me?.orgs?.[0]?.orgId;
}

export async function GET(request: NextRequest) {
  try {
    const token = await getBearerSafe();
    const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
    const orgId = await getOrgId(api, token);
    if (!orgId) return NextResponse.json({ runs: [], total: 0 }, { status: 200 });

    const params = request.nextUrl.searchParams;
    const qs = params.toString() ? `?${params}` : '';
    const resp = await fetch(`${api}/orgs/${orgId}/runs${qs}`, { headers: { Authorization: token } });
    const json = await resp.json();
    return NextResponse.json(json, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getBearerSafe();
    const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
    const orgId = await getOrgId(api, token);
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });

    const body = await request.json();
    const resp = await fetch(`${api}/orgs/${orgId}/runs`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    return NextResponse.json(json, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
