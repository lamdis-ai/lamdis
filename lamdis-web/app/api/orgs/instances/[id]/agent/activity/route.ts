import { proxyGet } from '@/lib/apiProxy';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  return proxyGet(`/outcome-instances/${id}/agent/activity${url.search}`);
}
