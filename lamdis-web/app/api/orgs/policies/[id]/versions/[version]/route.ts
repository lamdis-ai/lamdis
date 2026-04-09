import { proxyGet } from '@/lib/apiProxy';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version } = await params;
  return proxyGet(`/policies/${id}/versions/${version}`);
}
