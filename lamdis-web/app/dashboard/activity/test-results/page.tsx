"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

const statusVariants: Record<string, string> = {
  passed: 'success',
  failed: 'danger',
  running: 'warning',
  queued: 'neutral',
  partial: 'warning',
};

export default function TestResultsPage() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/orgs/testing/summary', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setSummary(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-slate-500 py-12">Loading test results...</div>;

  const totals = summary?.totals || {};
  const suites = summary?.suites || [];
  const recentRuns = summary?.runsRecent || [];
  const byAssistant = summary?.byAssistant || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Test Results</h1>
        <p className="text-sm text-slate-400 mt-1">Cross-suite testing overview and recent runs</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{totals.passed || 0}</div>
            <div className="text-xs text-slate-400 mt-1">Passed</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-rose-400">{totals.failed || 0}</div>
            <div className="text-xs text-slate-400 mt-1">Failed</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{totals.partial || 0}</div>
            <div className="text-xs text-slate-400 mt-1">Partial</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-cyan-400">{totals.running || 0}</div>
            <div className="text-xs text-slate-400 mt-1">Running</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-violet-400">
              {totals.passRate != null ? `${Math.round(totals.passRate * 100)}%` : '--'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Pass Rate</div>
          </div>
        </Card>
      </div>

      {/* By Assistant */}
      {byAssistant.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-100 mb-4">By Assistant</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {byAssistant.map((a: any) => (
              <Card key={a.assistantKey}>
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-100 truncate">{a.assistantKey}</span>
                    <span className="text-xs text-slate-400">{a.total} runs</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-400">{a.passed}P</span>
                    <span className="text-rose-400">{a.failed}F</span>
                    <span className="text-amber-400">{a.partial}pt</span>
                    <span className="text-slate-500 ml-auto">
                      {Math.round((a.passRate || 0) * 100)}% pass
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.round((a.passRate || 0) * 100)}%` }}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Suite Summaries */}
      {suites.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Suites</h2>
          <div className="space-y-3">
            {suites.map((s: any) => (
              <Link key={s.id} href={`/dashboard/library/suites/${s.id}`}>
                <Card className="hover:border-violet-500/30 transition-colors cursor-pointer">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-100">{s.name}</span>
                      <span className="text-xs text-slate-500">{s.testsCount} tests</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="text-emerald-400">{s.pass}P</span>
                      <span className="text-rose-400">{s.fail}F</span>
                      <span>{s.totalRuns} runs</span>
                      <span>{Math.round((s.passRate || 0) * 100)}%</span>
                      {s.lastRunAt && <span>{new Date(s.lastRunAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Runs */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Recent Runs</h2>
        {recentRuns.length === 0 ? (
          <Card><div className="p-6 text-center text-slate-500">No test runs yet</div></Card>
        ) : (
          <div className="space-y-2">
            {recentRuns.map((run: any, i: number) => (
              <Card key={run.id || i}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={(statusVariants[run.status] || 'neutral') as any}>
                      {run.status}
                    </Badge>
                    <span className="text-sm text-slate-300 font-mono">
                      {run.id?.slice(0, 8)}...
                    </span>
                    {run.connectionKey && (
                      <span className="text-xs text-slate-500">{run.connectionKey}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {run.suiteId && (
                      <Link href={`/dashboard/library/suites/${run.suiteId}`} className="text-violet-400 hover:text-violet-300">
                        View suite
                      </Link>
                    )}
                    {run.totals && (
                      <span>{run.totals.passed || 0}P / {run.totals.failed || 0}F</span>
                    )}
                    <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
