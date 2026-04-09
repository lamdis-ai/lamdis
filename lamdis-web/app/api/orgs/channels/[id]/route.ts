import { proxyGet, proxyPut, proxyDelete } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/channels/${id}`);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPut(`/channels/${id}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/channels/${id}`);
}
