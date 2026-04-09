import { proxyGet, proxyPost } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search || '';
  return proxyGet(`/workspaces${qs}`);
}

export async function POST(req: Request) {
  return proxyPost('/workspaces', req);
}
