import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/input-requests/${id}/cancel`, req);
}
