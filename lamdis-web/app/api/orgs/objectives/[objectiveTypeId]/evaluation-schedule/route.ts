import { proxyGet, proxyPost, proxyDelete } from '@/lib/apiProxy';

export async function GET(_req: Request, { params }: { params: Promise<{ objectiveTypeId: string }> }) {
  const { objectiveTypeId } = await params;
  return proxyGet(`/objectives/${objectiveTypeId}/evaluation-schedule`);
}

export async function POST(req: Request, { params }: { params: Promise<{ objectiveTypeId: string }> }) {
  const { objectiveTypeId } = await params;
  return proxyPost(`/objectives/${objectiveTypeId}/evaluation-schedule`, req);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ objectiveTypeId: string }> }) {
  const { objectiveTypeId } = await params;
  return proxyDelete(`/objectives/${objectiveTypeId}/evaluation-schedule`);
}
