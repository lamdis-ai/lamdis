import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request) {
  return proxyPost('/workflows/generate-events', req);
}
