import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET() {
  return proxyGet('/budgets');
}

export async function POST(req: Request) {
  return proxyPost('/budgets', req);
}
