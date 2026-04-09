import { proxyGet, proxyPut, proxyDelete } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; testId: string }> }) {
  const { id, testId } = await params;
  return proxyGet(`/suites/${id}/tests/${testId}`);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; testId: string }> }) {
  const { id, testId } = await params;
  return proxyPut(`/suites/${id}/tests/${testId}`, req);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; testId: string }> }) {
  const { id, testId } = await params;
  return proxyDelete(`/suites/${id}/tests/${testId}`);
}
