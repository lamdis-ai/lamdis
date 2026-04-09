import { proxyGet, proxyPut } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/suites/${id}/schedule`);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPut(`/suites/${id}/schedule`, req);
}
