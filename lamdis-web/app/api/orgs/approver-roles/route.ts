import { proxyGet, proxyPost } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  return proxyGet(`/approver-roles${url.search}`);
}

export async function POST(req: Request) {
  return proxyPost('/approver-roles', req);
}
