import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

// Basic JSON health endpoint (GET) plus lightweight HEAD handler for container platforms
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
