import { NextRequest, NextResponse } from "next/server";
import { getSession } from '@/lib/auth0';
import { getBearerSafe } from '@/lib/auth';

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgId = request.headers.get("x-org-id");
  if (!orgId) {
    return NextResponse.json({ error: "org_id_required" }, { status: 400 });
  }

  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: "no_access_token" }, { status: 401 });
  }

  const { auditId } = await params;

  const res = await fetch(`${API_URL}/orgs/${orgId}/audit/${auditId}`, {
    headers: {
      Authorization: bearer,
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}