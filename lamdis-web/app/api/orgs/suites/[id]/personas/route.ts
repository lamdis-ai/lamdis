import { proxyGet, proxyPost } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(`/suites/${id}/personas`);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost(`/suites/${id}/personas`, req);
}
