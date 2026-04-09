import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET(_req: NextRequest, props: { params: Promise<{ semver: string }> }) {
  const params = await props.params;
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/manifest/version/${params.semver}`, { headers: { Authorization: bearer } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
