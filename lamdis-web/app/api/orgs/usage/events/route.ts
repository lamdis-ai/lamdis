import { proxyGet } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.search ? url.search : '';
  return proxyGet(`/usage/events${qs}`);
}
