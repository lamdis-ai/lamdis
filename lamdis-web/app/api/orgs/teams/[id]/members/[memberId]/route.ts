import { proxyDelete, proxyPatch } from '@/lib/apiProxy';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  return proxyDelete(`/teams/${id}/members/${memberId}`);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  return proxyPatch(`/teams/${id}/members/${memberId}`, req);
}
