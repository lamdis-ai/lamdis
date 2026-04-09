import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function PATCH(
  req: Request,
  props: { params: Promise<{ orgId: string; memberId: string }> }
) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${api}/orgs/${params.orgId}/members/${params.memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: bearer },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _: Request,
  props: { params: Promise<{ orgId: string; memberId: string }> }
) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const res = await fetch(`${api}/orgs/${params.orgId}/members/${params.memberId}`, {
    method: 'DELETE',
    headers: { Authorization: bearer }
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
