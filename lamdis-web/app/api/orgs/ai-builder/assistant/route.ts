import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';
import { AIBUILDER_PLANNER } from '@/lib/aiBuilderPlanner';

export async function POST(req: NextRequest) {
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const meData = await me.json().catch(()=>({}));
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });
  // Enable web search tool by default so the assistant can fetch up-to-date docs
  const tools = Array.isArray((body as any)?.tools) ? (body as any).tools : [{ type: 'web_search' }];
  const payload = { ...body, tools, planner: AIBUILDER_PLANNER, audience: 'business-builder' } as any;
  const r = await fetch(`${api}/orgs/${orgId}/ai-builder/assistant`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
  const txt = await r.text();
  try { return NextResponse.json(JSON.parse(txt), { status: r.status }); } catch { return NextResponse.json({ error: txt }, { status: r.status }); }
}
