import { NextRequest, NextResponse } from "next/server";
import { getSession } from '@/lib/auth0';
import { getBearerSafe } from '@/lib/auth';

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
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

  const body = await request.json();

  const res = await fetch(`${API_URL}/orgs/${orgId}/audit/export`, {
    method: "POST",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  const contentType = res.headers.get("Content-Type") || "application/json";
  const contentDisposition = res.headers.get("Content-Disposition");
  
  const blob = await res.blob();
  
  const response = new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": contentType,
    },
  });

  if (contentDisposition) {
    response.headers.set("Content-Disposition", contentDisposition);
  }

  return response;
}