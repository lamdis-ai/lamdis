import { proxyGet } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const qs = req.nextUrl.search;
  return proxyGet(`/workflows/${id}/export${qs}`);
}
