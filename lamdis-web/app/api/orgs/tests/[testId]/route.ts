import { proxyGet, proxyPut, proxyDelete } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  return proxyGet(`/tests/${testId}`);
}

export async function PUT(req: Request, { params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  return proxyPut(`/tests/${testId}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  return proxyDelete(`/tests/${testId}`);
}
