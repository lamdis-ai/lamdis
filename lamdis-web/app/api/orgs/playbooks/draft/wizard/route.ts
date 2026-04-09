import { proxyPost } from '@/lib/apiProxy';

export async function POST(req: Request) {
  return proxyPost(`/playbooks/draft/wizard`, req);
}
