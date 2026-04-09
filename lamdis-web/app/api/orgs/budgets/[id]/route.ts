import { proxyDelete, proxyPatch } from '@/lib/apiProxy';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPatch(`/budgets/${id}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/budgets/${id}`);
}
