import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getBearerSafe();
  
  try {
    // Get orgId from /me endpoint
    const meRes = await fetch(`${API_BASE}/me`, { headers: { Authorization: token }, cache: 'no-store' });
    const me = await meRes.json().catch(() => ({}));
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });

    const body = await req.json();
    const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}/mock-assistants/${encodeURIComponent(id)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: String(token) },
      body: JSON.stringify(body),
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Forward the full error including message for debugging
      return NextResponse.json({ 
        error: data?.error || 'Failed to get response',
        message: data?.message || undefined,
      }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to chat with mock assistant' }, { status: 500 });
  }
}