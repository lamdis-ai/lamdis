import { proxyGet, proxyPut } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  return proxyGet(`/evidence-vault/${entryId}`);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  return proxyPut(`/evidence-vault/${entryId}`, req);
}
