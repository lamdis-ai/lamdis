import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getOrgId(token: string, api: string): Promise<string | null> {
  let me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' });
  let meData = await me.json();
  return meData?.orgs?.[0]?.orgId || null;
}

export async function GET(req: NextRequest, props: { params: Promise<{ bindingId: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const orgId = await getOrgId(token, api);
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 400 });

    const resp = await fetch(`${api}/orgs/${orgId}/action-bindings/${params.bindingId}`, {
      headers: { Authorization: token },
      cache: 'no-store',
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ bindingId: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const orgId = await getOrgId(token, api);
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 400 });

    const body = await req.json();
    const resp = await fetch(`${api}/orgs/${orgId}/action-bindings/${params.bindingId}`, {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ bindingId: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const orgId = await getOrgId(token, api);
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 400 });

    const resp = await fetch(`${api}/orgs/${orgId}/action-bindings/${params.bindingId}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    });
    if (resp.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
