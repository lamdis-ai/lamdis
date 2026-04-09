import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/suites/${id}/run-now`, req);
}
