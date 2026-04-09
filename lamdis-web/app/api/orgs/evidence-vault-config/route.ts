import { proxyGet, proxyPut } from '@/lib/apiProxy';
import { NextRequest } from 'next/server';

export async function GET() {
  return proxyGet('/evidence-vault-config');
}

export async function PUT(req: NextRequest) {
  return proxyPut('/evidence-vault-config', req);
}
