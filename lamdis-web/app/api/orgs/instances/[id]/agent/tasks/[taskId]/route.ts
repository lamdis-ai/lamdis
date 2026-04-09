import { getBearerSafe } from '@/lib/auth';
import { getOrgId } from '@/lib/apiProxy';

const API_URL = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getAuth() {
  const token = await getBearerSafe();
  if (!token) return null;
  const orgId = await getOrgId(token);
  return orgId ? { token, orgId } : null;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const auth = await getAuth();
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const res = await fetch(`${API_URL()}/orgs/${auth.orgId}/outcome-instances/${id}/agent/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: auth.token },
  });
  return new Response(null, { status: res.status });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const auth = await getAuth();
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const body = await req.text();
  const res = await fetch(`${API_URL()}/orgs/${auth.orgId}/outcome-instances/${id}/agent/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
    body,
  });
  const txt = await res.text();
  return new Response(txt, { status: res.status, headers: { 'content-type': 'application/json' } });
}
