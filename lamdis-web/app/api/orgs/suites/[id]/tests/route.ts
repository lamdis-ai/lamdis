import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/suites/${id}/tests`, []);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/suites/${id}/tests`, req);
}
