import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ runid: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const sp = req.nextUrl.searchParams;
  // Clamp waitMs to avoid overly frequent polling
  const rawWait = Number(sp.get('waitMs') || '0');
  const clampedWait = (() => {
    const n = isFinite(rawWait) ? Math.floor(rawWait) : 0;
    // Default to 5000 if unspecified/zero; min 1500ms, max 15000ms
    if (!n) return 5000;
    return Math.max(1500, Math.min(15000, n));
  })();
  const waitMs = String(clampedWait);
  const verbose = sp.get('verbose') || '1';
  const since = sp.get('since') || '';
  try {
    const url = `${api}/ci/result/${encodeURIComponent(params.runid)}?waitMs=${encodeURIComponent(waitMs)}&verbose=${encodeURIComponent(verbose)}${since ? `&since=${encodeURIComponent(since)}` : ''}`;
    const resp = await fetch(url, { headers: { Authorization: token }, cache: 'no-store' });
    const txt = await resp.text();
    try { return NextResponse.json(JSON.parse(txt), { status: resp.status }); } catch { return NextResponse.json({ error: txt }, { status: resp.status }); }
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
