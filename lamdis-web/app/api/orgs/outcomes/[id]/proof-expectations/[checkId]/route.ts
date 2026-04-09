import { proxyPut, proxyDelete } from '@/lib/apiProxy';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = await params;
  return proxyPut(`/outcomes/${id}/proof-expectations/${checkId}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = await params;
  return proxyDelete(`/outcomes/${id}/proof-expectations/${checkId}`);
}
