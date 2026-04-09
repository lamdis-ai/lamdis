import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET() {
  return proxyGet('/tests');
}

export async function POST(req: Request) {
  return proxyPost('/tests', req);
}
