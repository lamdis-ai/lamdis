import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

// Accept planKey from client; no need to expose env var names client-side.
export async function POST(req: NextRequest) {
  const { planKey, priceIdEnv } = await req.json();
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgs: any[] = meData?.orgs || [];
  const activeOrg = orgs.find((o: any) => o?.org?.stripeCustomerId) || orgs.find((o: any) => !!o?.org?.currentPlan) || orgs[0];
  const orgId = activeOrg?.orgId || activeOrg?.org?._id;

  // Legacy fallback: if some older client still sends priceIdEnv, attempt to resolve.
  let legacyPriceId: string | undefined;
  if (priceIdEnv) {
    legacyPriceId = process.env[priceIdEnv as string];
    if (!legacyPriceId) {
      return NextResponse.json({ error: `Server missing environment variable ${priceIdEnv}` }, { status: 500 });
    }
  }

  const body: any = { orgId };
  if (planKey) body.planKey = planKey;
  if (legacyPriceId) body.priceId = legacyPriceId; // only when explicitly provided

  const res = await fetch(`${api}/billing/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body: JSON.stringify(body) });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

