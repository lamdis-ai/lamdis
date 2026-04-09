import { getBearerSafe } from '@/lib/auth';
import { getOrgId } from '@/lib/apiProxy';

const API_URL = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getAuth() {
  const token = await getBearerSafe();
  if (!token) return null;
  const orgId = await getOrgId(token);
  return orgId ? { token, orgId } : null;
}

/** Proxy file download */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileName: string }> }) {
  const { id, fileName } = await params;
  const auth = await getAuth();
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const res = await fetch(`${API_URL()}/orgs/${auth.orgId}/outcome-instances/${id}/files/${encodeURIComponent(fileName)}`, {
    headers: { Authorization: auth.token },
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': res.headers.get('Content-Length') || '',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/** Proxy file delete */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fileName: string }> }) {
  const { id, fileName } = await params;
  const auth = await getAuth();
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const res = await fetch(`${API_URL()}/orgs/${auth.orgId}/outcome-instances/${id}/files/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
    headers: { Authorization: auth.token },
  });

  return new Response(null, { status: res.status });
}
