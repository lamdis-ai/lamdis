import { proxyPatch, proxyDelete } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  return proxyPatch(`/instances/${id}/comments/${commentId}`, req);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  return proxyDelete(`/instances/${id}/comments/${commentId}`);
}
