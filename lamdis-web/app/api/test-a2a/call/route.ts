import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const skill = String(body?.skill || '');
    const input = (body?.input && typeof body.input === 'object') ? body.input : undefined;
    const org = String(body?.org || ''); // allow explicit org or slug; else fetch from session/org API later if needed
    if (!skill) return NextResponse.json({ error: 'skill_required' }, { status: 400 });
    if (!org) return NextResponse.json({ error: 'org_required' }, { status: 400 });
    const base = (process.env.NEXT_PUBLIC_AGENTS_BASE || 'http://localhost:8081').replace(/\/$/, '');
    const bearer = await getBearerSafe();
    const headers: Record<string,string> = { 'content-type':'application/json' };
    if (bearer) headers['authorization'] = bearer;
    const r = await fetch(`${base}/a2a/${encodeURIComponent(org)}/v1`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'message/send', params: { message: { parts: [ input ? { skill, input } : { skill } ] } } })
    });
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch {}
    return NextResponse.json({ ok: r.ok, status: r.status, json: json ?? null, raw: json ? undefined : text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 200 });
  }
}
