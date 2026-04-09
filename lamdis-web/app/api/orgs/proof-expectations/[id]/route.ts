import { proxyDelete, proxyPut } from '@/lib/apiProxy';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPut(`/proof-expectations/${id}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/proof-expectations/${id}`);
}
