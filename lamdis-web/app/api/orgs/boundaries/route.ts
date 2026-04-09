import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const queryString = url.search;
  return proxyGet(`/boundaries${queryString}`);
}

export async function POST(req: Request) {
  return proxyPost('/boundaries', req);
}
