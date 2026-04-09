import { getSession } from '@/lib/auth0';
import { getBearerSafe } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = request.headers.get('x-org-id');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing x-org-id header' }, { status: 400 });
  }

  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'no_access_token' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/orgs/${orgId}/members`, {
    headers: {
      Authorization: bearer,
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = request.headers.get('x-org-id');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing x-org-id header' }, { status: 400 });
  }

  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: 'no_access_token' }, { status: 401 });
  }

  const body = await request.json();
  
  const res = await fetch(`${API_BASE}/orgs/${orgId}/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}