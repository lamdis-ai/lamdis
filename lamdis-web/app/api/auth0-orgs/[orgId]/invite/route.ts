import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

const api = process.env.NEXT_PUBLIC_API_URL as string;

/**
 * POST /api/auth0-orgs/[orgId]/invite
 * Invite a user by email
 */
export async function POST(req: NextRequest, props: { params: Promise<{ orgId: string }> }) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    
    const res = await fetch(`${api}/auth0-orgs/${encodeURIComponent(params.orgId)}/invite`, {
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
    console.error('Failed to send invitation:', error);
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
  }
}
