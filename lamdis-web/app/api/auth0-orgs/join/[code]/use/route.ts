import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

const api = process.env.NEXT_PUBLIC_API_URL as string;

/**
 * POST /api/auth0-orgs/join/[code]/use
 * Mark a join code as used after joining the org
 */
export async function POST(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const res = await fetch(`${api}/auth0-orgs/join/${encodeURIComponent(params.code)}/use`, {
      method: 'POST',
      headers: { Authorization: bearer },
    });
    
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Failed to use join code:', error);
    return NextResponse.json({ error: 'Failed to complete join' }, { status: 500 });
  }
}
