import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const message: string = body.message || '';
  const version: string | undefined = body.version;
  const debug: boolean | undefined = body.debug;

  // Resolve org id
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });

  // Call A2A chat on lamdis-api (executes tools via Agents API)
  const res = await fetch(`${api}/orgs/${orgId}/a2a/chat`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: body.history || [], version, debug }) });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text || 'Failed' }, { status: res.status }); }
}
