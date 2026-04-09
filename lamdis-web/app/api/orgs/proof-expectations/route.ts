import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  return proxyGet(`/proof-expectations${url.search || ''}`);
}

export async function POST(req: Request) {
  return proxyPost('/proof-expectations', req);
}
