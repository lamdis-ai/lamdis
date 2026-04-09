import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: Request) {
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // Resolve org dynamically via /api/me (first org for now; could use activeOrg selection later)
  const meResp = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/me`, { headers: { Authorization: bearer } });
  if (!meResp.ok) return NextResponse.json({ error: 'Failed to resolve org context' }, { status: 400 });
  const meData = await meResp.json().catch(()=>null);
  const orgId = meData?.orgs?.[0]?.orgId || meData?.orgs?.[0]?.org?._id;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const body = await req.json().catch(()=>({}));
  const { packKey, context, skipped } = body || {};
  if (!packKey) return NextResponse.json({ error: 'packKey required' }, { status: 400 });
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/public';
  const url = `${apiBase}/orgs/${orgId}/action-packs/${encodeURIComponent(packKey)}/apply`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearer}` }, body: JSON.stringify({ context, skipped }) });
  const text = await resp.text();
  let data: any = text; try { data = JSON.parse(text); } catch {}
  return NextResponse.json(data, { status: resp.status });
}
