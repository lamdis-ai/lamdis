"use client";
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

const statusVariant: Record<string, string> = {
  completed: 'success',
  running: 'info',
  queued: 'neutral',
  failed: 'danger',
  stopped: 'warning',
};

export default function WorkflowRunsPage() {
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams?.get('status') || '');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', '50');

    fetch(`/api/orgs/workflow-runs?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setRuns(data?.runs || []);
        setTotal(data?.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Workflow Runs</h1>
          <p className="text-sm text-slate-400 mt-1">Batch test executions across workflows</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="stopped">Stopped</option>
        </select>
        <span className="text-sm text-slate-500 self-center">{total} runs</span>
      </div>

      {/* Runs list */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          No runs found. Trigger a run from a workflow detail page.
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run: any) => (
            <Link key={run.id} href={`/dashboard/activity/runs/${run.id}`}>
              <Card className="hover:border-violet-500/30 transition-colors cursor-pointer">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={(statusVariant[run.status] || 'neutral') as any}>
                      {run.status}
                    </Badge>
                    <span className="text-sm text-slate-300 font-mono">{run.id?.slice(0, 12)}...</span>
                    <span className="text-xs text-slate-500">{run.trigger || 'manual'}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {run.totals && (
                      <span className="text-slate-400">
                        <span className="text-emerald-400">{run.totals.passed || 0}</span>
                        {' / '}
                        <span className="text-rose-400">{run.totals.failed || 0}</span>
                        {' / '}
                        <span className="text-amber-400">{run.totals.error || 0}</span>
                      </span>
                    )}
                    {run.instanceCount != null && (
                      <span>{run.instanceCount} instances</span>
                    )}
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
