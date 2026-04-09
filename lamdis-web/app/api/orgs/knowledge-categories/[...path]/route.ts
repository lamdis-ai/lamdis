import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function DELETE(_req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  let orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) {
    await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: bearer } });
    me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
    const meData2 = await me.json();
    orgId = meData2?.orgs?.[0]?.orgId;
  }
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const pathParam = encodeURIComponent((params.path || []).join('/'));
  const res = await fetch(`${api}/orgs/${orgId}/knowledge-categories/${pathParam}`, { method: 'DELETE', headers: { Authorization: bearer } });
  const data = await res.json().catch(()=>({ ok: res.ok }));
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}
