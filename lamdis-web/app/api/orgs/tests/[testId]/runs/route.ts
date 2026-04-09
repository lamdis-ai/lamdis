import { proxyGet } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  return proxyGet(`/tests/${testId}/runs`);
}
