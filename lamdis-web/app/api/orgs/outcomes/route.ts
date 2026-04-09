import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET() {
  return proxyGet('/outcomes');
}

export async function POST(req: Request) {
  return proxyPost('/outcomes', req);
}
