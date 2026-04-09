import { proxyGet } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search || '';
  return proxyGet(`/outcome-instances${qs}`);
}
