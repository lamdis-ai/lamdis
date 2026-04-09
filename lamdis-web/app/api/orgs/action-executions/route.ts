import { proxyGet } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const queryString = url.search;
  return proxyGet(`/action-executions${queryString}`);
}
