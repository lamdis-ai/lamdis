import { NextRequest, NextResponse } from 'next/server';

const api = process.env.NEXT_PUBLIC_API_URL as string;

/**
 * GET /api/auth0-orgs/join/[code]
 * Look up a join code (public endpoint)
 */
export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  try {
    const res = await fetch(`${api}/auth0-orgs/join/${encodeURIComponent(params.code)}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Failed to lookup join code:', error);
    return NextResponse.json({ error: 'Failed to lookup code' }, { status: 500 });
  }
}
