import { proxyGet } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyGet(`/audit${qs ? `?${qs}` : ''}`, { logs: [], pagination: null });
}
