"use client";
import React from 'react';
import { formatDurationBetween } from '@/lib/format';
import Pagination from '@/components/base/Pagination';
import Badge from '@/components/base/Badge';
import Table from '@/components/base/Table';
import Link from 'next/link';
import Button from '@/components/base/Button';
import { useToast } from '@/components/base/Toast';
import { useRouter } from 'next/navigation';

export default function RecentRunsClient({ runs, assistants }: { runs: any[]; assistants?: any[] }) {
  const toast = useToast?.();
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const total = Array.isArray(runs) ? runs.length : 0;
  const start = (page - 1) * pageSize;
  const slice = Array.isArray(runs) ? runs.slice(start, start + pageSize) : [];
  const fmt = (d?: string) => d ? new Date(d).toLocaleString() : '-';
  const dur = (r: any) => formatDurationBetween(r?.startedAt || r?.createdAt, r?.finishedAt);

  // Build a connectionKey -> assistant label map
  const assistantLabel = React.useMemo(()=>{
    const map = new Map<string, string>();
    const arr = Array.isArray(assistants) ? assistants : [];
    for (const a of arr) {
      const key = a?.connectionKey || a?.key;
      if (key) {
        const label = a?.name || a?.key || String(key);
        map.set(String(key), String(label));
      }
    }
    return (connKey?: string) => {
      if (!connKey) return '';
      return map.get(String(connKey)) || String(connKey);
    };
  }, [assistants]);

  return (
    <div className="mt-3 space-y-2">
      <div className="font-medium text-sm">Recent runs</div>
      <Table
        data={slice}
        empty={<span className="text-xs text-slate-500">No runs yet.</span>}
        columns={[
          {
            key: 'run',
            header: 'Run',
            render: (r: any) => {
              const rid = String(r.id || '');
              const tail = rid ? rid.slice(-6) : '';
              return (
                <Link href={`/dashboard/runs/${encodeURIComponent(String(r.id))}`} className="text-slate-300 hover:text-white">
                  <div className="font-mono text-slate-200">Run {tail || rid}</div>
                  <div className="text-[11px] text-slate-500">{fmt(r.startedAt || r.createdAt)}</div>
                </Link>
              );
            },
          },
          {
            key: 'assistant',
            header: 'Assistant',
            render: (r: any) => {
              const label = assistantLabel(r?.connectionKey);
              return <span className="text-slate-300">{label || '-'}</span>;
            },
          },
          {
            key: 'status',
            header: 'Status',
            render: (r: any) => {
              const status = String(r.status || '').toLowerCase();
              const variant = status==='passed' ? 'success' : status==='failed' ? 'danger' : status==='running' ? 'info' : 'neutral';
              return <Badge variant={variant as any}>{status || '-'}</Badge>;
            },
          },
          {
            key: 'started',
            header: 'Started',
            render: (r: any) => <span className="text-slate-400">{fmt(r.startedAt || r.createdAt)}</span>,
          },
          {
            key: 'ended',
            header: 'Ended',
            render: (r: any) => <span className="text-slate-400">{fmt(r.finishedAt)}</span>,
          },
          {
            key: 'duration',
            header: 'Duration',
            render: (r: any) => <span className="text-slate-300">{dur(r)}</span>,
          },
          {
            key: 'kind',
            header: 'Type',
            render: (r: any) => {
              const isSingle = Array.isArray(r.items) ? r.items.length === 1 : false;
              return <span className="text-slate-400">{isSingle ? 'Single test' : 'Suite run'}</span>;
            },
          },
          {
            key: 'pass',
            header: 'Pass',
            className: 'w-20',
            render: (r: any) => <span>{Number(r?.totals?.passed ?? 0)}</span>,
          },
          {
            key: 'fail',
            header: 'Fail',
            className: 'w-20',
            render: (r: any) => <span>{Number(r?.totals?.failed ?? 0)}</span>,
          },
          {
            key: 'skipped',
            header: 'Skipped',
            className: 'w-20',
            render: (r: any) => <span>{Number(r?.totals?.skipped ?? 0)}</span>,
          },
          {
            key: 'actions',
            header: 'Actions',
            className: 'w-28',
            render: (r: any) => {
              const status = String(r.status || '').toLowerCase();
              const canStop = status === 'running' || status === 'queued';
              const stop = async () => {
                try {
                  const resp = await fetch(`/api/ci/stop/${encodeURIComponent(String(r.id))}`, { method: 'POST' });
                  if (resp.ok) { toast?.success?.('Run stop requested'); router.refresh(); } else { const t = await resp.text(); toast?.error?.(`Stop failed: ${t||resp.status}`); }
                } catch (e:any) { toast?.error?.(e?.message || 'Stop failed'); }
              };
              return canStop ? <Button variant='danger' className='h-7 text-[11px] px-3' onClick={stop}>Stop</Button> : <span className='text-slate-600 text-[11px]'>-</span>;
            }
          },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
