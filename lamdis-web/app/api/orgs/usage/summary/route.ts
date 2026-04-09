import { proxyGet } from '@/lib/apiProxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || 'monthly';
  return proxyGet(`/usage/summary?period=${encodeURIComponent(period)}`);
}
