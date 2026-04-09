export const dynamic = 'force-dynamic';
import { headers } from 'next/headers';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Button from '@/components/base/Button';
import SuiteTestsTableClient from './SuiteTestsTableClient';
import TestBuilderClient from '../TestBuilderClient';

async function fetchLocal(url: string, init?: RequestInit) {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const base = host ? `${proto}://${host}` : '';
  const cookie = h.get('cookie') ?? '';
  const res = await fetch(`${base}${url}`, { ...(init||{}), headers: { ...(init?.headers||{}), ...(cookie ? { cookie } : {}) }, cache: 'no-store' });
  const txt = await res.text();
  try { return { ok: res.ok, data: JSON.parse(txt) }; } catch { return { ok: res.ok, data: { error: txt } }; }
}

export default async function SuiteTestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suiteId = id;
  const [tests, personas] = await Promise.all([
    fetchLocal(`/api/orgs/suites/${suiteId}/tests`).then(r=>Array.isArray(r.data)? r.data : []),
    fetchLocal(`/api/orgs/personas`).then(r=>Array.isArray(r.data)? r.data : []),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Suite Tests</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/dashboard/library/suites/${suiteId}`}><Button variant="outline">Back to Suite</Button></Link>
        </div>
      </div>

      <Card className="p-4">
        <div className="font-medium mb-3">New Test (Builder)</div>
        <div className="text-xs text-slate-400 mb-3">Compose a test script and optionally orchestrate before/during/after calls using Requests. Targets (environments, SDKs, or endpoints) will be selectable per run.</div>
        <TestBuilderClient suiteId={suiteId} />
      </Card>

      <Card className="p-4">
        <div className="font-medium mb-3">Tests in this Suite</div>
        <SuiteTestsTableClient tests={tests as any} suiteId={suiteId} personas={(personas as any).map((p:any)=>({id:p.id, name:p.name}))} />
      </Card>
    </div>
  );
}
