import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET(_: Request, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  try {
    const token = await getBearerSafe();
    const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
    const me = await fetch(`${api}/me`, { headers: { Authorization: token } }).then(r => r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });
    const resp = await fetch(`${api}/orgs/${orgId}/runs/${encodeURIComponent(params.runId)}`, { headers: { Authorization: token } });
    const json = await resp.json();
    return NextResponse.json(json, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
