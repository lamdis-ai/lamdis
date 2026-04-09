import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET() {
  return proxyGet('/evidence-models', []);
}

export async function POST(req: Request) {
  return proxyPost('/evidence-models', req);
}
