import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return proxyPost(`/conversations/${sessionId}/messages`, req);
}
