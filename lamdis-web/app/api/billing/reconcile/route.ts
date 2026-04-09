import { NextRequest } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const bearer = await getBearerSafe();
  if (!bearer) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { orgId } = body || {};
  if (!orgId) return new Response(JSON.stringify({ error: 'Missing orgId' }), { status: 400 });
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const res = await fetch(`${api}/billing/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer },
    body: JSON.stringify({ orgId })
  });
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify(data), { status: res.status });
}
