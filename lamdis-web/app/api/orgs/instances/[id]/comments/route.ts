import { proxyPost } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/instances/${id}/comments`, req);
}
