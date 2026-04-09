import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const base = (process.env.NEXT_PUBLIC_AGENTS_BASE || 'http://localhost:8081').replace(/\/$/, '');
    const r = await fetch(`${base}/healthz`, { cache: 'no-store' });
    const j = await r.json();
    return NextResponse.json({ ok: r.ok && !!j?.ok, upstream: j }, { status: r.ok ? 200 : 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 200 });
  }
}
