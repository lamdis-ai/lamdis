import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'no_token' }, { status: 200 });
  const res = await fetch(`${api}/auth/me`, { headers: { Authorization: bearer } });
  let body: any = null;
  try { body = await res.json(); } catch {}
  return NextResponse.json({ status: res.status, body });
}
