import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

// Resolve the current user's orgId via /me, bootstrapping if necessary (dev)
async function getOrgContext(api: string, bearer: string): Promise<{ orgId: string | null; orgFromMe?: any }>{
  try {
    let meResp = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
    let meData: any = await meResp.json().catch(() => ({}));
    if (!meResp.ok) return { orgId: null };
    let orgId: string | null = meData?.orgs?.[0]?.orgId || null;
    if (!orgId) {
      // Try bootstrap once (creates default org + membership in dev)
      await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: bearer } });
      meResp = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
      meData = await meResp.json().catch(() => ({}));
      orgId = meData?.orgs?.[0]?.orgId || null;
    }
    return { orgId, orgFromMe: meData?.orgs?.[0]?.org };
  } catch {
    return { orgId: null };
  }
}

export async function GET() {
  const api = (process.env.NEXT_PUBLIC_API_URL as string) || 'http://localhost:3001';
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { orgId, orgFromMe } = await getOrgContext(api, bearer);
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });

  const res = await fetch(`${api}/orgs/${encodeURIComponent(orgId)}`, { headers: { Authorization: bearer } });
  const text = await res.text();
  try {
    const data = text ? JSON.parse(text) : {};
    const org = data?.org || orgFromMe || null;
    return NextResponse.json({ org, profile: org?.profile || {} }, { status: res.status || 200 });
  } catch {
    return NextResponse.json({ error: 'Upstream parse error', body: text }, { status: res.status || 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const api = (process.env.NEXT_PUBLIC_API_URL as string) || 'http://localhost:3001';
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { orgId } = await getOrgContext(api, bearer);
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${api}/orgs/${encodeURIComponent(orgId)}`, {
    method: 'PATCH',
    headers: { Authorization: bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: body?.profile || {} })
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json({ ok: res.ok, body: text }, { status: res.status });
  }
}
