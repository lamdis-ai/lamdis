import { proxyPost } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  return proxyPost('/evidence-vault/jit-url', req);
}
