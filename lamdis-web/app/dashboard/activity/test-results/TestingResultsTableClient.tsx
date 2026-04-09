"use client";
import React from 'react';
import Table from '@/components/base/Table';
import Pagination from '@/components/base/Pagination';
import Badge from '@/components/base/Badge';
import Link from 'next/link';
import Button from '@/components/base/Button';

type Row = {
  suiteId: string;
  suiteName: string;
  lastRunAt?: string;
  lastStatus?: string;
  totalRuns: number;
  passCount: number;
  failCount: number;
};

export default function TestingResultsTableClient({ rows }: { rows: Row[] }) {
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const total = Array.isArray(rows) ? rows.length : 0;
  const start = (page - 1) * pageSize;
  const slice = Array.isArray(rows) ? rows.slice(start, start + pageSize) : [];

  function statusBadge(status?: string) {
    const s = String(status || '').toLowerCase();
    const variant = s === 'passed' ? 'success' : s === 'failed' ? 'danger' : s === 'running' ? 'info' : 'neutral';
    return <Badge variant={variant as any}>{status || '—'}</Badge>;
  }

  return (
    <div className="space-y-3">
      <Table
        columns={[
          { key: 'suite', header: 'Suite', className: 'w-80', render: (r: Row) => (
            <Link href={`/dashboard/library/suites/${encodeURIComponent(r.suiteId)}`} className="text-slate-200 hover:underline">
              <div className="truncate" title={r.suiteName}>{r.suiteName}</div>
            </Link>
          )},
          { key: 'last', header: 'Last run', className: 'w-64', render: (r: Row) => (
            <div>
              <div>{statusBadge(r.lastStatus)}</div>
              <div className="text-[11px] text-slate-500">{r.lastRunAt ? new Date(r.lastRunAt).toLocaleString() : '—'}</div>
            </div>
          )},
          { key: 'passrate', header: 'Pass rate (7d)', className: 'w-36', render: (r: Row) => {
            const total = r.totalRuns || 0; const pass = r.passCount || 0;
            const rate = total ? Math.round((pass / total) * 100) : 0;
            return <span className="text-slate-200">{rate}%</span>;
          }},
          { key: 'pass', header: 'Pass', className: 'w-20', render: (r: Row) => <span>{r.passCount}</span> },
          { key: 'fail', header: 'Fail', className: 'w-20', render: (r: Row) => <span className={r.failCount>0? 'text-rose-300':'text-slate-200'}>{r.failCount}</span> },
          { key: 'total', header: 'Runs (7d)', className: 'w-24', render: (r: Row) => <span>{r.totalRuns}</span> },
          { key: 'summary', header: 'Summary', render: (r: Row) => (
            r.failCount > 0
              ? <span className="text-rose-300">Failures present</span>
              : (r.totalRuns > 0 ? <span className="text-emerald-300">All passing</span> : <span className="text-slate-400">No runs</span>)
          )},
          { key: 'view', header: '', className: 'w-28 text-right', render: (r: Row) => (
            <Link href={`/dashboard/library/suites/${encodeURIComponent(r.suiteId)}`}>
              <Button variant="outline" className="h-7 text-[11px] px-3">View</Button>
            </Link>
          )},
        ]}
        data={slice as any}
        empty={<div className="text-slate-500">No suites yet.</div>}
      />
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
