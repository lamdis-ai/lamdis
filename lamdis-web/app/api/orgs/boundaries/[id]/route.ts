import { proxyGet, proxyPut, proxyDelete } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/boundaries/${id}`);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPut(`/boundaries/${id}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/boundaries/${id}`);
}
