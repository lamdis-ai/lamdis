import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET() {
  return proxyGet('/test-folders');
}

export async function POST(req: Request) {
  return proxyPost('/test-folders', req);
}
