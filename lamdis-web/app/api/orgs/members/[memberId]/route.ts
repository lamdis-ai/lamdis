import { getSession } from '@/lib/auth0';
import { getBearerSafe } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3001';

export async function PATCH(request: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
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

  const { memberId } = params;
  const body = await request.json();

  const res = await fetch(`${API_BASE}/orgs/${orgId}/members/${memberId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
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

  const { memberId } = params;

  const res = await fetch(`${API_BASE}/orgs/${orgId}/members/${memberId}`, {
    method: 'DELETE',
    headers: {
      Authorization: bearer,
    },
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}