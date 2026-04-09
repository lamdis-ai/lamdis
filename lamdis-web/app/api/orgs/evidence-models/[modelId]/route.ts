import { proxyGet, proxyPut, proxyDelete } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  return proxyGet(`/evidence-models/${modelId}`);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  return proxyPut(`/evidence-models/${modelId}`, req);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  return proxyDelete(`/evidence-models/${modelId}`);
}
