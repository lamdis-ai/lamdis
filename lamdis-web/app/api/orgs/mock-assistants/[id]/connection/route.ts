import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const body = await req.json().catch(()=>({}));
    const headers: Record<string,string> = { Authorization: String(token) };
    let init: RequestInit = { method: 'POST', headers };
    if (body && Object.keys(body).length) {
      headers['Content-Type'] = 'application/json';
      init = { ...init, body: JSON.stringify(body) };
    }
    const resp = await fetch(`${api}/orgs/${orgId}/mock-assistants/${params.id}/connection`, init);
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
