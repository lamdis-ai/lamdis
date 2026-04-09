import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const includeSources = req.nextUrl.searchParams.get('includeSources') || '0';
  const r = await fetch(`${api}/analytics/actions?orgId=${encodeURIComponent(orgId)}&range=${encodeURIComponent(req.nextUrl.searchParams.get('range')||'7d')}&includeSources=${encodeURIComponent(includeSources)}`, { headers: { Authorization: bearer }, cache: 'no-store' });
  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text), { status: r.status }); } catch { return NextResponse.json({ error: text }, { status: r.status }); }
}
