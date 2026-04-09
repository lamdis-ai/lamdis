import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const resp = await fetch(`${api}/orgs/${orgId}/mock-assistants/${params.id}`, { headers: { Authorization: String(token) }, cache: 'no-store' });
    if (!resp.ok) {
      const data = await resp.json().catch(()=>({}));
      return NextResponse.json({ error: data?.error || 'not_found' }, { status: resp.status });
    }
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const resp = await fetch(`${api}/orgs/${orgId}/mock-assistants/${params.id}`, { method: 'DELETE', headers: { Authorization: String(token) } });
    return new NextResponse(null, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const body = await req.json().catch(()=>({}));
    const resp = await fetch(`${api}/orgs/${orgId}/mock-assistants/${params.id}`, { method: 'PATCH', headers: { Authorization: String(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json().catch(()=>({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
