import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

// Proxy for Integration Assistant chat
// Forwards message/history/tools to backend (expected endpoint to be implemented server-side)
// Body: { message, history, tools }
export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  // Resolve org for scoping
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const meData = await me.json().catch(()=>({}));
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });

  // Ensure tools array includes web_search_preview if client requests it
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  const payload = { message: body.message, history: body.history, tools };
  const res = await fetch(`${api}/orgs/${orgId}/integrations/assistant`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
  const txt = await res.text();
  try { return NextResponse.json(JSON.parse(txt), { status: res.status }); } catch { return NextResponse.json({ error: txt || 'Failed' }, { status: res.status }); }
}
