import { proxyPatch } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPatch(`/outcome-instances/${id}/status`, req);
}
