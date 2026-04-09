import { proxyGet, proxyPost } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/outcome-instances/${id}/comments`);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/outcome-instances/${id}/comments`, req);
}
