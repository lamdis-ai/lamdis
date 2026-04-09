import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

// Proxy audit log fetch for org variables
export async function GET() {
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  // Determine org id (reuse /me pattern for consistency with other variable routes)
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const meData = await me.json().catch(()=>({}));
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });
  const r = await fetch(`${api}/orgs/${orgId}/variables/audit`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const txt = await r.text();
  try { return NextResponse.json(JSON.parse(txt), { status: r.status }); } catch { return NextResponse.json({ error: txt }, { status: r.status }); }
}
