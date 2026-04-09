import { NextResponse } from 'next/server';

export async function GET(_: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const res = await fetch(`${api}/public/action-packs/${encodeURIComponent(params.key)}`, { cache: 'no-store' });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text), { status: res.status }); } catch { return NextResponse.json({ error: text }, { status: res.status }); }
}
