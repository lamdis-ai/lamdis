import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/outcomes/${id}/proof-expectations`);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/outcomes/${id}/proof-expectations`, req);
}
