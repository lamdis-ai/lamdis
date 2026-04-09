import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { planKey } = await req.json();
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgs: any[] = meData?.orgs || [];
  const activeOrg = orgs.find((o: any) => o?.org?.stripeCustomerId) || orgs.find((o: any) => !!o?.org?.currentPlan) || orgs[0];
  const orgId = activeOrg?.orgId || activeOrg?.org?._id;

  if (!orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 });
  }

  const res = await fetch(`${api}/billing/free-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer },
    body: JSON.stringify({ orgId, planKey })
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}