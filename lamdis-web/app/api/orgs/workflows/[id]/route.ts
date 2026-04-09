import { proxyGet, proxyDelete, proxyPut } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/workflows/${id}`);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPut(`/workflows/${id}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete(`/workflows/${id}`);
}
