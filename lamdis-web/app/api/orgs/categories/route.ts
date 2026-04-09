import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const queryString = url.search;
  return proxyGet(`/categories${queryString}`);
}

export async function POST(req: Request) {
  return proxyPost('/categories', req);
}
