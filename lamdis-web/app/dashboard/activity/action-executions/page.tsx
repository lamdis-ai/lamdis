"use client";
import { useEffect, useState } from 'react';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const statusVariant: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  proposed: 'info',
  executing: 'warning',
  completed: 'success',
  blocked: 'danger',
  failed: 'danger',
};

const riskColors: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export default function ActionExecutionsPage() {
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', riskClass: '' });
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.riskClass) params.set('riskClass', filters.riskClass);
    params.set('limit', '50');

    fetch(`/api/orgs/action-executions?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setExecutions(Array.isArray(data) ? data : data?.actionExecutions || data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters]);

  const handleApprove = async (id: string, decision: 'approve' | 'block') => {
    setActing(id);
    try {
      await fetch(`/api/orgs/action-executions/${id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      setExecutions(prev =>
        prev.map(ex =>
          ex.id === id
            ? { ...ex, status: decision === 'approve' ? 'executing' : 'blocked' }
            : ex
        )
      );
    } catch {
      // ignore
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Action Executions</h1>
        <p className="text-sm text-slate-400 mt-1">Track autonomous actions proposed and executed by the system</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All statuses</option>
          <option value="proposed">Proposed</option>
          <option value="executing">Executing</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={filters.riskClass}
          onChange={e => setFilters(f => ({ ...f, riskClass: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All risk classes</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading action executions...</div>
      ) : executions.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No action executions found</div>
      ) : (
        <div className="space-y-2">
          {executions.map((ex: any) => (
            <div key={ex.id}>
              <Card
                className="hover:border-fuchsia-500/30 transition-colors cursor-pointer"
                onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Badge variant={statusVariant[ex.status] || 'neutral'}>
                      {ex.status}
                    </Badge>
                    <span className="text-sm text-slate-200 font-medium truncate">
                      {ex.actionName || ex.name || 'Unnamed action'}
                    </span>
                    {ex.outcomeInstanceId && (
                      <span className="text-xs text-slate-500 font-mono">
                        instance: {ex.outcomeInstanceId?.slice(0, 10)}...
                      </span>
                    )}
                    {ex.proposedBy && (
                      <span className="text-xs text-slate-500">by {ex.proposedBy}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    {ex.riskClass && (
                      <Badge variant={riskColors[ex.riskClass] || 'neutral'}>
                        {ex.riskClass}
                      </Badge>
                    )}
                    {ex.confidence != null && (
                      <span className="text-slate-400">{Math.round(ex.confidence * 100)}%</span>
                    )}
                    <span className="text-slate-500">
                      {new Date(ex.createdAt).toLocaleString()}
                    </span>
                    {ex.status === 'proposed' && (
                      <div className="flex gap-1 ml-2">
                        <button
                          disabled={acting === ex.id}
                          onClick={e => { e.stopPropagation(); handleApprove(ex.id, 'approve'); }}
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={acting === ex.id}
                          onClick={e => { e.stopPropagation(); handleApprove(ex.id, 'block'); }}
                          className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          Block
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Expanded detail */}
              {expandedId === ex.id && (
                <div className="ml-4 mt-1 mb-3 p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 space-y-3">
                  {ex.reasoning && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reasoning</h4>
                      <p className="text-sm text-slate-300">{ex.reasoning}</p>
                    </div>
                  )}
                  {ex.evidenceSnapshot && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Evidence Snapshot</h4>
                      <pre className="text-xs text-slate-300 bg-slate-900/50 rounded p-3 overflow-x-auto">
                        {typeof ex.evidenceSnapshot === 'string'
                          ? ex.evidenceSnapshot
                          : JSON.stringify(ex.evidenceSnapshot, null, 2)}
                      </pre>
                    </div>
                  )}
                  {!ex.reasoning && !ex.evidenceSnapshot && (
                    <p className="text-xs text-slate-500">No additional details available</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
