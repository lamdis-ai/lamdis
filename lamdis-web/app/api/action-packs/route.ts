import { NextResponse } from 'next/server';

// Proxy public list of action packs from main API (no auth required per spec)
export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const res = await fetch(`${api}/public/action-packs`, { cache: 'no-store' });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text }, { status: res.status }); }
}
