"use client";
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

const statusVariant: Record<string, string> = {
  completed: 'success',
  running: 'info',
  queued: 'neutral',
  failed: 'danger',
  stopped: 'warning',
  passed: 'success',
  open: 'neutral',
  partial: 'warning',
  error: 'danger',
};

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params?.runId as string;
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!runId) return;
    fetch(`/api/orgs/workflow-runs/${runId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setRun(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await fetch(`/api/orgs/workflow-runs/${runId}/stop`, { method: 'POST' });
      // Refetch
      const resp = await fetch(`/api/orgs/workflow-runs/${runId}`, { cache: 'no-store' });
      const data = await resp.json();
      setRun(data);
    } catch {}
    setStopping(false);
  };

  if (loading) return <div className="text-center text-slate-500 py-12">Loading...</div>;
  if (!run || run.error) return <div className="text-center text-slate-500 py-12">Run not found</div>;

  const instances = run.instances || [];
  const isActive = run.status === 'running' || run.status === 'queued';

  // Compute totals from run or from instances
  const totals = run.totals || {
    passed: instances.filter((i: any) => i.status === 'passed').length,
    failed: instances.filter((i: any) => i.status === 'failed').length,
    error: instances.filter((i: any) => i.status === 'error').length,
  };

  const progress = instances.length > 0
    ? Math.round(((totals.passed + totals.failed + totals.error) / instances.length) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Link href="/dashboard/activity/runs" className="hover:text-slate-200">Runs</Link>
          <span>/</span>
          <span className="font-mono text-slate-300">{runId?.slice(0, 12)}...</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-slate-100">Run Detail</h1>
            <Badge variant={(statusVariant[run.status] || 'neutral') as any}>
              {run.status}
            </Badge>
            <span className="text-xs text-slate-500">{run.trigger || 'manual'}</span>
          </div>
          {isActive && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="px-4 py-2 rounded-lg border border-rose-500/50 text-rose-400 hover:bg-rose-950/30 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {stopping ? 'Stopping...' : 'Stop Run'}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-slate-100">{instances.length}</div>
            <div className="text-xs text-slate-400">Instances</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-emerald-400">{totals.passed}</div>
            <div className="text-xs text-slate-400">Passed</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-rose-400">{totals.failed}</div>
            <div className="text-xs text-slate-400">Failed</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-amber-400">{totals.error}</div>
            <div className="text-xs text-slate-400">Errors</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-violet-400">{progress}%</div>
            <div className="text-xs text-slate-400">Complete</div>
          </div>
        </Card>
      </div>

      {/* Progress bar */}
      {isActive && instances.length > 0 && (
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div
            className="bg-violet-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Git context */}
      {run.gitContext && (
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">Git Context</h3>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
              {run.gitContext.branch && <span>Branch: <span className="text-slate-300 font-mono">{run.gitContext.branch}</span></span>}
              {run.gitContext.commit && <span>Commit: <span className="text-slate-300 font-mono">{run.gitContext.commit?.slice(0, 8)}</span></span>}
              {run.gitContext.message && <span className="text-slate-300">{run.gitContext.message}</span>}
            </div>
          </div>
        </Card>
      )}

      {/* Run metadata */}
      <div className="flex gap-4 text-xs text-slate-500">
        <span>Created: {new Date(run.createdAt).toLocaleString()}</span>
        {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
        {run.suiteId && <span>Suite: <span className="font-mono">{run.suiteId.slice(0, 8)}...</span></span>}
      </div>

      {/* Instances list */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Instances</h2>
        {instances.length === 0 ? (
          <Card><div className="p-6 text-center text-slate-500">No instances created yet</div></Card>
        ) : (
          <div className="space-y-2">
            {instances.map((inst: any) => (
              <Link key={inst.id} href={`/dashboard/instances/${inst.id}`}>
                <Card className="hover:border-violet-500/30 transition-colors cursor-pointer">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={(statusVariant[inst.status] || 'neutral') as any}>
                        {inst.status}
                      </Badge>
                      <span className="text-sm text-slate-300 font-mono">{inst.id?.slice(0, 12)}...</span>
                      {inst.environment && <Badge variant="neutral">{inst.environment}</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {inst.highestConfirmationLevel && (
                        <span className="text-cyan-400 font-mono font-bold">
                          {inst.highestConfirmationLevel}
                        </span>
                      )}
                      <span>{inst.eventCount || 0} events</span>
                      <span>{new Date(inst.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
