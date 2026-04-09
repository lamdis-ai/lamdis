import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json([], { status: 200 });
    const resp = await fetch(`${api}/orgs/${orgId}/mock-assistants`, { headers: { Authorization: token }, cache: 'no-store' });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const body = await req.json().catch(()=>({}));
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const resp = await fetch(`${api}/orgs/${orgId}/mock-assistants`, { method:'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
