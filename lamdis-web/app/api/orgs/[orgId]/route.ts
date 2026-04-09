import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function PATCH(_: Request, props: { params: Promise<{ orgId: string }> }) {
  const params = await props.params;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const body = await _.json().catch(() => ({}));
  const res = await fetch(`${api}/orgs/${params.orgId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: bearer },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
