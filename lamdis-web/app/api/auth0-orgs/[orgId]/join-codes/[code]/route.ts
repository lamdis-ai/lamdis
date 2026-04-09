import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

const api = process.env.NEXT_PUBLIC_API_URL as string;

/**
 * DELETE /api/auth0-orgs/[orgId]/join-codes/[code]
 * Revoke a join code
 */
export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ orgId: string; code: string }> }
) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${api}/auth0-orgs/${encodeURIComponent(params.orgId)}/join-codes/${encodeURIComponent(params.code)}`,
      {
        method: 'DELETE',
        headers: { Authorization: bearer },
      }
    );
    
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Failed to delete join code:', error);
    return NextResponse.json({ error: 'Failed to delete join code' }, { status: 500 });
  }
}
