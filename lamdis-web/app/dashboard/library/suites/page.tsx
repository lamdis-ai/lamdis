// Themed Suites list/create using Lamdis components
export const dynamic = 'force-dynamic';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Card from '@/components/base/Card';
import SuitesTableClient from './SuitesTableClient';
import CreateSuiteLauncher from '@/app/dashboard/library/suites/CreateSuiteLauncher';
import SuitesScheduleTableClient from '@/app/dashboard/library/suites/SuitesScheduleTableClient';

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

export default async function SuitesPage() {
  const suitesRes = await fetchLocal(`/api/orgs/suites`);
  const suites = Array.isArray(suitesRes.data) ? suitesRes.data : [];

  // Fetch latest run per suite to show quick status in the list
  const suitesWithLastRun = await Promise.all(
    suites.map(async (s: any) => {
      try {
        const runsRes = await fetchLocal(`/api/orgs/suites/${encodeURIComponent(String(s.id))}/runs`);
        const runs = Array.isArray(runsRes.data) ? runsRes.data : [];
        // pick most recent by createdAt desc if available
        const sorted = runs.slice().sort((a: any, b: any) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
        const lastRun = sorted[0] || null;
        // latest scheduled run if any
        const lastScheduled = sorted.find((r:any)=> String(r.trigger||'') === 'schedule') || null;
        return { ...s, lastRun, lastScheduledRun: lastScheduled };
      } catch {
        return { ...s };
      }
    })
  );

  // creation is now handled client-side via modal

  async function runNow(suiteId: string) {
    'use server';
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
    const base = host ? `${proto}://${host}` : '';
    const cookie = h.get('cookie') ?? '';
    const r = await fetch(`${base}/api/ci/run`, { method: 'POST', headers: { ...(cookie ? { cookie } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ suiteId }) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j.runId) {
      // stay on page if failed
      return;
    }
    redirect(`/dashboard/runs/${encodeURIComponent(String(j.runId))}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Test Suites</h1>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed">
        A test suite is a collection of tests that validate specific functionality and compliance for your AI agent. Suites can be
        configured to run against multiple assistants, versions, or environments so the same tests can compare how different versions
        or configurations handle the same scenarios.
      </p>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-400">Create a new suite to group tests and run them across assistants.</div>
          <CreateSuiteLauncher />
        </div>
      </Card>

      <Card className="p-0">
        <div className="p-3 border-b border-slate-800/70 text-sm text-slate-300">Your Suites</div>
        <div className="p-3">
          <SuitesTableClient
            suites={suitesWithLastRun as any}
            runAction={async (fd: FormData) => {
              'use server';
              const suiteId = String(fd.get('suiteId') || '');
              if (!suiteId) return;
              await runNow(suiteId);
            }}
          />
        </div>
      </Card>

      {/* Schedules overview */}
      <Card className="p-0">
        <div className="p-3 border-b border-slate-800/70 text-sm text-slate-300">Schedules</div>
        <div className="p-3">
          <SuitesScheduleTableClient suites={suitesWithLastRun as any} />
        </div>
      </Card>
    </div>
  );
}
