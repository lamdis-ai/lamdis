import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ ok: false }, { status: 401 });
  const me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  const orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) return NextResponse.json({ ok: false }, { status: 400 });
  const integ = await fetch(`${api}/orgs/${orgId}/integrations`, { headers: { Authorization: bearer } });
  const iData = await integ.json();
  const hasOpenAI = !!iData?.integrations?.openai;
  return NextResponse.json({ ok: hasOpenAI });
}
