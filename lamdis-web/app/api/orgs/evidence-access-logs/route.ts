import { NextRequest, NextResponse } from "next/server";
import { getBearerSafe } from '@/lib/auth';
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || process.env.API_URL || "http://localhost:3001";

async function getOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("lamdis_current_org")?.value || null;
}

export async function GET(req: NextRequest) {
  const token = await getBearerSafe();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "no_org_selected" }, { status: 400 });
  }

  const searchParams = req.nextUrl.searchParams;
  const queryString = searchParams.toString();
  const url = queryString
    ? `${API_BASE}/orgs/${orgId}/evidence-access-logs?${queryString}`
    : `${API_BASE}/orgs/${orgId}/evidence-access-logs`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: token },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
