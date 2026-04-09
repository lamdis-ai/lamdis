import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ suiteId: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    // Try to fetch suite directly by ID (without org prefix)
    const resp = await fetch(`${api}/suites/${encodeURIComponent(params.suiteId)}`, { headers: { Authorization: token }, cache: 'no-store' });
    const txt = await resp.text();
    try {
      return NextResponse.json(JSON.parse(txt), { status: resp.status });
    } catch {
      return NextResponse.json({ error: txt }, { status: resp.status });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
