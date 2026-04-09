import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

const api = process.env.NEXT_PUBLIC_API_URL as string;

/**
 * GET /api/auth0-orgs/[orgId]/join-codes
 * List active join codes for the organization
 * 
 * POST /api/auth0-orgs/[orgId]/join-codes
 * Create a new join code
 */
export async function GET(req: NextRequest, props: { params: Promise<{ orgId: string }> }) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const res = await fetch(`${api}/auth0-orgs/${encodeURIComponent(params.orgId)}/join-codes`, {
      headers: { Authorization: bearer },
    });
    
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Failed to list join codes:', error);
    return NextResponse.json({ error: 'Failed to list join codes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ orgId: string }> }) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    
    const res = await fetch(`${api}/auth0-orgs/${encodeURIComponent(params.orgId)}/join-codes`, {
      method: 'POST',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Failed to create join code:', error);
    return NextResponse.json({ error: 'Failed to create join code' }, { status: 500 });
  }
}
