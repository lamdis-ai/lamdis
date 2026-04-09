import { getBearerSafe } from '@/lib/auth';
import { getOrgId } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

const API_URL = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getBearerSafe();
  if (!token) return new Response('Unauthorized', { status: 401 });
  const orgId = await getOrgId(token);
  if (!orgId) return new Response('No org', { status: 400 });

  const qs = req.nextUrl.search || '';
  const res = await fetch(`${API_URL()}/orgs/${orgId}/outcome-instances/${id}/evidence${qs}`, {
    headers: { Authorization: token },
  });
  const txt = await res.text();
  return new Response(txt, { status: res.status, headers: { 'content-type': 'application/json' } });
}
