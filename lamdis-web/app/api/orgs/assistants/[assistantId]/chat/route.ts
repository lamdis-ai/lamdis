import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL || process.env.API_URL || 'http://localhost:3001';

export async function POST(req: NextRequest, { params }: { params: Promise<{ assistantId: string }> }) {
  const { assistantId } = await params;
  const orgId = req.headers.get('x-org-id');
  if (!orgId) return NextResponse.json({ error: 'org_required' }, { status: 400 });

  try {
    const body = await req.json();
    
    // Forward to the backend integrated assistant chat endpoint
    const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/assistants/${encodeURIComponent(assistantId)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to get response' }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to chat with assistant' }, { status: 500 });
  }
}