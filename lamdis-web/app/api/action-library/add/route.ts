import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const { key, orgId } = body || {};
  if (!key || !orgId) return NextResponse.json({ error: 'key and orgId required' }, { status: 400 });
  const res = await fetch(`${api}/action-library/${encodeURIComponent(key)}/add-to-manifest`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }) });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text }, { status: res.status }); }
}
