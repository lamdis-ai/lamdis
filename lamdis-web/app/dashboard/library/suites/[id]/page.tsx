export const dynamic = 'force-dynamic';
import { headers } from 'next/headers';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Button from '@/components/base/Button';
import RunNowClient from './RunNowClient';
import React from 'react';
import RecentRunsClient from './RecentRunsClient';
import SuiteStopperClient from './SuiteStopperClient';
import SuiteTestsPaginatedClient from './tests/SuiteTestsPaginatedClient';

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

export default async function SuiteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suiteId = id;
  // parallel fetches
  const [personas, tests, runs, suiteResp, assistantsResp] = await Promise.all([
    fetchLocal(`/api/orgs/personas`).then(r=>Array.isArray(r.data)? r.data : []),
    fetchLocal(`/api/orgs/suites/${suiteId}/tests`).then(r=>Array.isArray(r.data)? r.data : []),
    fetchLocal(`/api/orgs/suites/${suiteId}/runs`).then(r=>Array.isArray(r.data)? r.data : []),
    fetchLocal(`/api/orgs/suites/${suiteId}`),
    fetchLocal(`/api/orgs/assistants/combined`).then(r=>Array.isArray(r.data)? r.data : []),
  ]);
  const suite: any = (suiteResp && suiteResp.ok) ? suiteResp.data : {};
  const assistants: any[] = Array.isArray(assistantsResp) ? assistantsResp : [];

  // Personas are now org-scoped; manage them in the Personas dashboard page.

  // Environments are now managed via Connections page; remove inline create/edit here.

  // Run Now handled client-side with progress polling

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Suite</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/dashboard/library/suites/${suiteId}/tests`}><Button variant="outline">Tests</Button></Link>
          <Link href="/dashboard/connections"><Button variant="outline">Connections</Button></Link>
          <Link href="/dashboard/library/suites"><Button variant="outline">Back</Button></Link>
        </div>
      </div>
      <p className="text-sm text-slate-400 leading-relaxed">
        A test suite groups tests that check behavior and compliance of your AI agent. You can run a suite against multiple assistants,
        versions, or environments to compare how different configurations handle the same scenarios.
      </p>
      {/* Personas are org-scoped and applied per test. Manage them at /dashboard/personas and select one on each test. */}

      {/* Environments and default target selection removed per updated flow */}

      {/* Inline tests listing with pagination (moved to top) */}
      <Card className="p-4">
        <div className="font-medium mb-3">Tests in this Suite</div>
        {/* Simple server-side pagination: first page 10 items; client control can be added later */}
        {Array.isArray(tests) && tests.length > 0 ? (
          <SuiteTestsPaginatedClient tests={tests as any} suiteId={suiteId} personas={(personas as any).map((p:any)=>({id:p.id, name:p.name}))} />
        ) : (
          <div className="text-slate-500 text-sm">No tests yet.</div>
        )}
        <div className="mt-3 text-xs text-slate-500">Open the Tests tab for full-screen editing and management.</div>
      </Card>

      {/* Run section */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">Run</div>
          {/* Show stop when a run is active */}
          <SuiteStopperClient runs={runs as any} />
        </div>
        <div className="mt-2">
          <RunNowClient
            suiteId={suiteId}
            initialSelectedKeys={Array.isArray((suite as any).selectedConnKeys) ? (suite as any).selectedConnKeys : []}
            initialSchedule={{ enabled: !!(suite as any)?.schedule?.enabled, periodMinutes: Number((suite as any)?.schedule?.periodMinutes || 0) }}
          />
        </div>

        <RecentRunsClient runs={runs as any} assistants={assistants as any} />
      </Card>
    </div>
  );
}
