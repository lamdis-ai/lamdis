import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request) {
  return proxyPost('/code-analysis/analyze', req);
}
