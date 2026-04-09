import { NextRequest, NextResponse } from "next/server";
import { getBearerSafe } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function GET(req: NextRequest) {
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/user-profile/me`, {
    headers: {
      Authorization: bearer,
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest) {
  const bearer = await getBearerSafe();
  if (!bearer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();

  const res = await fetch(`${API_BASE}/user-profile/me`, {
    method: "PUT",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}