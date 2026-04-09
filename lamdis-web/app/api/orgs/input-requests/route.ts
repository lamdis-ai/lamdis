import { proxyGet } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  return proxyGet(`/input-requests${url.search}`);
}
