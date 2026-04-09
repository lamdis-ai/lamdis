import { proxyDelete } from '@/lib/apiProxy';

export async function DELETE() {
  return proxyDelete('/demo/reset');
}
