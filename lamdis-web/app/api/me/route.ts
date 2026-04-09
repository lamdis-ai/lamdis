import { NextResponse } from 'next/server';
import { getSession, getBearerSafe } from '@/lib/auth';

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const session = await getSession();
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ user: (session as any)?.user ?? null, orgs: [] });
  }
  try {
    const headers: HeadersInit = { Authorization: bearer };
    const meResp = await fetch(`${api}/me`, { headers });
    const meData = await meResp.json();
    if (!meResp.ok) {
      if ((session as any)?.user) {
        console.error('[/api/me] Backend error but session exists:', meResp.status, meData);
        return NextResponse.json({ user: (session as any).user, orgs: [], backendError: true });
      }
      return NextResponse.json(meData, { status: meResp.status });
    }
    const merged = { ...meData, user: (session as any)?.user ?? meData?.user };
    return NextResponse.json(merged);
  } catch (error) {
    console.error('[/api/me] Backend fetch failed:', error);
    if ((session as any)?.user) {
      return NextResponse.json({ user: (session as any).user, orgs: [], backendError: true });
    }
    return NextResponse.json({ user: null, orgs: [] }, { status: 500 });
  }
}
