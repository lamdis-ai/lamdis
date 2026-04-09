import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const url = new URL(req.url);
  const search = url.search || '';
  const res = await fetch(`${api}/action-library${search}`, { headers: { Authorization: bearer } });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text }, { status: res.status }); }
}

export async function POST(req: NextRequest) {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(()=>({}));
  const res = await fetch(`${api}/action-library`, { method: 'POST', headers: { Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text }, { status: res.status }); }
}
