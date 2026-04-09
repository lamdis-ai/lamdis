import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request, { params }: { params: Promise<{ outcomeTypeId: string }> }) {
  const { outcomeTypeId } = await params;
  return proxyPost(`/demo/simulate/${outcomeTypeId}`, req);
}
