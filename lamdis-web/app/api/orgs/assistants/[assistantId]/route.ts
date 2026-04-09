import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL || process.env.API_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: Promise<{ assistantId: string }> }) {
  const { assistantId } = await params;
  const orgId = req.headers.get('x-org-id');
  if (!orgId) return NextResponse.json({ error: 'org_required' }, { status: 400 });

  try {
    const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/assistants/${encodeURIComponent(assistantId)}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'not_found' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch assistant' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ assistantId: string }> }) {
  const { assistantId } = await params;
  const orgId = req.headers.get('x-org-id');
  if (!orgId) return NextResponse.json({ error: 'org_required' }, { status: 400 });

  try {
    const body = await req.json();
    const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/assistants/${encodeURIComponent(assistantId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to update' }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update assistant' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ assistantId: string }> }) {
  const { assistantId } = await params;
  const orgId = req.headers.get('x-org-id');
  if (!orgId) return NextResponse.json({ error: 'org_required' }, { status: 400 });

  try {
    const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/assistants/${encodeURIComponent(assistantId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to delete' }, { status: res.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete assistant' }, { status: 500 });
  }
}