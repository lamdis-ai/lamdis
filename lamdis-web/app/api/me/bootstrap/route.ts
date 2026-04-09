import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const res = await fetch(`${api}/me/bootstrap`, {
    method: 'POST',
    headers: { Authorization: bearer },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const res = await fetch(`${api}/me/bootstrap`, {
    method: 'POST',
    headers: { Authorization: bearer },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
