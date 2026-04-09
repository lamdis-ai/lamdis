"use client";
import Table from '@/components/base/Table';
import Button from '@/components/base/Button';
import Link from 'next/link';

type RunSummary = { id?: string; createdAt?: string; status?: string; totals?: { passed?: number; failed?: number; skipped?: number } };

type Suite = { id: string; name: string; description?: string; lastRun?: RunSummary | null };

export default function SuitesTableClient({ suites, runAction }: { suites: Suite[]; runAction: (formData: FormData) => Promise<void> }) {
  return (
    <Table
      columns={[
        { key: 'name', header: 'Name', render: (s: Suite) => (<a className="text-brand-500 hover:underline" href={`/dashboard/library/suites/${encodeURIComponent(String(s.id))}`}>{s.name}</a>) },
        { key: 'description', header: 'Description', render: (s: Suite) => <span className="text-slate-400">{s.description || '-'}</span> },
        { key: 'passed', header: 'Pass', className: 'w-20', render: (s: Suite) => s.lastRun?.totals?.passed ?? '-' },
        { key: 'failed', header: 'Fail', className: 'w-20', render: (s: Suite) => s.lastRun?.totals?.failed ?? '-' },
        { key: 'lastRunAt', header: 'Last run time', className: 'w-56', render: (s: Suite) => (
          s.lastRun?.createdAt ? (
            s.lastRun?.id ? (
              <a href={`/dashboard/runs/${encodeURIComponent(String(s.lastRun.id))}`} className="text-slate-300 hover:text-white underline">{new Date(s.lastRun.createdAt).toLocaleString()}</a>
            ) : (
              <span className="text-slate-400">{new Date(s.lastRun.createdAt).toLocaleString()}</span>
            )
          ) : <span className="text-slate-600">-</span>
        ) },
        { key: 'status', header: 'Status', className: 'w-28', render: (s: Suite) => (
          s.lastRun?.status ? (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${s.lastRun.status==='passed' ? 'text-emerald-300 border-emerald-500/40' : s.lastRun.status==='failed' ? 'text-rose-300 border-rose-500/40' : 'text-amber-300 border-amber-500/40'}`}>{s.lastRun.status}</span>
          ) : <span className="text-slate-600">-</span>
        ) },
        { key: 'actions', header: 'Actions', render: (s: Suite) => (
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/library/suites/${encodeURIComponent(String(s.id))}`} className="px-2 py-1 rounded border border-slate-700/60 text-slate-200 text-xs hover:border-slate-500/60">Edit</Link>
            <form action={runAction}>
              <input type="hidden" name="suiteId" value={String(s.id)} />
              <Button variant="outline" type="submit">Run now</Button>
            </form>
          </div>
        ) }
      ]}
      data={suites}
      empty={<span>No suites yet. Create one above.</span>}
    />
  );
}
