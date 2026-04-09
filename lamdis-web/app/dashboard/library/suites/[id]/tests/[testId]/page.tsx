export const dynamic = 'force-dynamic';
import { headers } from 'next/headers';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Button from '@/components/base/Button';
import DeleteTestButtonClient from './DeleteTestButtonClient';
import TestBuilderClient from '../../TestBuilderClient';
import TestRunHistory from '@/components/testing/TestRunHistory';

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

export default async function EditTestPage({ params }: { params: Promise<{ id: string; testId: string }> }) {
  const { id, testId } = await params;
  const suiteId = id;
  const test = await fetchLocal(`/api/orgs/suites/${suiteId}/tests`).then(r => (Array.isArray(r.data) ? r.data.find((t:any)=> String(t.id)===String(testId)) : null));
  // Extract scenario, objectives, and hooks from existing test
  let initial: any = null;
  if (test) {
    const script = String(test.script||'');
    const scenario = extractScenario(script) || '';
    const objectives = Array.isArray(test.assertions) ? test.assertions.map((a:any)=>{
      if (a.type==='semantic') return { kind:'semantic', text: a?.config?.rubric || '', threshold: a?.config?.threshold ?? 0.75, severity: a?.severity || 'error' };
      if (a.type==='includes') return { kind:'includes', includes: Array.isArray(a?.config?.includes) ? a.config.includes.join(', ') : '', scope: a?.config?.scope || 'last', severity: a?.severity || 'error' };
      return null;
    }).filter(Boolean) : [];
    const hooks = Array.isArray(test.requests) ? test.requests.map((r:any)=> ({ stage: r.stage||'after', requestId: r.requestId||'', input: r.input ? JSON.stringify(r.input, null, 2) : '' })) : [];
    const steps = Array.isArray((test as any).steps) ? (test as any).steps : [];
    const preSteps = Array.isArray((test as any).preSteps) ? (test as any).preSteps : [];
    const variables = Array.isArray((test as any).variables) ? (test as any).variables : [];
    initial = { name: test.name, scenario, objectives, hooks, steps, preSteps, variables, testId: String(test.id), personaId: test.personaId || '' };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Test</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/dashboard/library/suites/${suiteId}/tests`}><Button variant="outline">Back to Tests</Button></Link>
          {test && <DeleteTestButtonClient suiteId={suiteId} testId={testId} />}
        </div>
      </div>
      <Card className="p-4">
        <div className="font-medium mb-3">Builder</div>
        {!initial && <div className="text-slate-500">Test not found</div>}
        {initial && <EditWrapper initial={initial} suiteId={suiteId} />}
      </Card>
      {/* Test Run History */}
      {test && (
        <TestRunHistory
          testId={testId}
          testName={test.name}
          suiteId={suiteId}
        />
      )}
    </div>
  );
}

function extractScenario(script: string): string | undefined {
  try {
    const m = /messages:[\s\S]*?-\s*role:\s*user[\s\S]*?content:\s*"([\s\S]*?)"/m.exec(String(script));
    if (!m) return undefined;
    return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  } catch { return undefined; }
}

function EditWrapper({ initial, suiteId }: { initial: any; suiteId: string }) {
  return <TestBuilderClient suiteId={suiteId} initial={initial} />;
}
