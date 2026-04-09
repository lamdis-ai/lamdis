import { NextRequest, NextResponse } from "next/server";
import { getSession } from '@/lib/auth0';
import { getBearerSafe } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function PATCH(request: NextRequest, props: { params: Promise<{ keyId: string }> }) {
  const params = await props.params;
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

  const { keyId } = params;

  try {
    const body = await request.json();
    const res = await fetch(`${API_URL}/orgs/${orgId}/api-keys/${keyId}`, {
      method: "PATCH",
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error updating API key:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ keyId: string }> }) {
  const params = await props.params;
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

  const { keyId } = params;

  try {
    const res = await fetch(`${API_URL}/orgs/${orgId}/api-keys/${keyId}`, {
      method: "DELETE",
      headers: {
        Authorization: bearer,
      },
    });

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error deleting API key:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}