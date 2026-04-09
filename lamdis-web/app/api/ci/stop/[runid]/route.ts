import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ runid: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const resp = await fetch(`${api}/ci/stop/${encodeURIComponent(params.runid)}`, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: '{}' });
    const txt = await resp.text();
    try { return NextResponse.json(JSON.parse(txt), { status: resp.status }); } catch { return NextResponse.json({ error: txt }, { status: resp.status }); }
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
