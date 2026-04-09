import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const u = new URL(req.url);
  const orgId = u.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  const res = await fetch(`${api}/billing/usage?orgId=${encodeURIComponent(orgId)}`, { headers: { Authorization: bearer } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
