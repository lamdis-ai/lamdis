import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET() {
  return proxyGet('/channels', []);
}

export async function POST(req: Request) {
  return proxyPost('/channels', req);
}
