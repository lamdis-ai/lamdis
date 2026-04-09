import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request) {
  return proxyPost('/evidence-vault-config/test-connection', req);
}
