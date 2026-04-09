import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const { orgId, planKey = 'team' } = body || {};
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  const res = await fetch(`${api}/billing/mock/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body: JSON.stringify({ orgId, planKey }) });
  const data = await res.json().catch(()=>({}));
  return NextResponse.json(data, { status: res.status });
}
