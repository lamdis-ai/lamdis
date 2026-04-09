import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getOrgId(api: string, token: string) {
  const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
  return me?.orgs?.[0]?.orgId;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ actionid: string }> }) {
  const { actionid } = await params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const orgId = await getOrgId(api, token);
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const resp = await fetch(`${api}/orgs/${orgId}/actions/${encodeURIComponent(actionid)}`, { headers: { Authorization: token }, cache: 'no-store' });
    const data = await resp.json().catch(()=>({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ actionid: string }> }) {
  const { actionid } = await params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const body = await req.json().catch(()=>({}));
  try {
    const orgId = await getOrgId(api, token);
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const resp = await fetch(`${api}/orgs/${orgId}/actions/${encodeURIComponent(actionid)}`, { method: 'PUT', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json().catch(()=>({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ actionid: string }> }) {
  const { actionid } = await params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const orgId = await getOrgId(api, token);
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const resp = await fetch(`${api}/orgs/${orgId}/actions/${encodeURIComponent(actionid)}`, { method: 'DELETE', headers: { Authorization: token } });
    const data = await resp.json().catch(()=>({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
