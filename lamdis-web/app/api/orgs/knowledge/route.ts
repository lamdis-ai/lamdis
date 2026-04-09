import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  let orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) {
    await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: bearer } });
    me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
    const meData2 = await me.json();
    orgId = meData2?.orgs?.[0]?.orgId;
  }
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/knowledge`, { headers: { Authorization: bearer } });
  const data = await res.json();
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return NextResponse.json({ articles });
}

export async function POST(req: NextRequest) {
  const a = await req.json();
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  const meData = await me.json();
  let orgId = meData?.orgs?.[0]?.orgId;
  if (!orgId) {
    await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: bearer } });
    me = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
    const meData2 = await me.json();
    orgId = meData2?.orgs?.[0]?.orgId;
  }
  if (!orgId) return NextResponse.json({ error: 'No organization found for user' }, { status: 400 });
  const res = await fetch(`${api}/orgs/${orgId}/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body: JSON.stringify(a) });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  // Auto-rebuild embeddings when saving a published article (or updating one).
  try {
    const id = a?.id || data?.article?.id;
    const status = a?.status || data?.article?.status || 'draft';
    if (id && status === 'published') {
      await fetch(`${api}/orgs/${orgId}/knowledge/${encodeURIComponent(id)}/embed`, {
        method: 'POST',
        headers: { Authorization: bearer },
      });
    }
  } catch {
    // Best-effort; embedding errors shouldn't block saving the article
  }
  return NextResponse.json(data);
}
