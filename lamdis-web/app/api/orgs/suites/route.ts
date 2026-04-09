import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET() {
  return proxyGet('/suites', []);
}

export async function POST(req: Request) {
  return proxyPost('/suites', req);
}
