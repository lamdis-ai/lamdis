import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const api = process.env.NEXT_PUBLIC_API_URL as string;
    const r = await fetch(`${api}/request-templates`, { cache: 'no-store' });
    const j = await r.json().catch(()=>({}));
    return NextResponse.json(j);
  } catch {
    return NextResponse.json({ templates: [] });
  }
}
