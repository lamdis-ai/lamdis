import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  return proxyPost(`/evidence-models/${modelId}/mock-submit`, req);
}
