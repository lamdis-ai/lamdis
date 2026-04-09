import { proxyGet, proxyPut, proxyDelete } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return proxyGet(`/test-folders/${folderId}`);
}

export async function PUT(req: Request, { params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return proxyPut(`/test-folders/${folderId}`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return proxyDelete(`/test-folders/${folderId}`);
}
