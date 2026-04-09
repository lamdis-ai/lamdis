import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

const api = process.env.NEXT_PUBLIC_API_URL as string;

/**
 * GET /api/auth0-orgs/my-orgs
 * List organizations the current user belongs to
 */
export async function GET() {
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  try {
    const res = await fetch(`${api}/auth0-orgs/my-orgs`, {
      headers: { Authorization: bearer },
    });
    
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Failed to list organizations:', error);
    return NextResponse.json({ error: 'Failed to list organizations' }, { status: 500 });
  }
}
