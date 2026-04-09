"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const decisionTypeVariant: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  automated: 'info',
  human: 'neutral',
  escalated: 'warning',
  override: 'danger',
};

export default function DossiersPage() {
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ decisionType: '', actor: '', dateFrom: '', dateTo: '' });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.decisionType) params.set('decisionType', filters.decisionType);
    if (filters.actor) params.set('actor', filters.actor);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    params.set('limit', '50');

    fetch(`/api/orgs/dossiers?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setDossiers(Array.isArray(data) ? data : data?.dossiers || data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Decisions</h1>
        <p className="text-sm text-slate-400 mt-1">Immutable proof records for every automated and human decision</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.decisionType}
          onChange={e => setFilters(f => ({ ...f, decisionType: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All decision types</option>
          <option value="automated">Automated</option>
          <option value="human">Human</option>
          <option value="escalated">Escalated</option>
          <option value="override">Override</option>
        </select>
        <input
          type="text"
          placeholder="Filter by actor..."
          value={filters.actor}
          onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 w-48"
        />
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
          title="From date"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
          title="To date"
        />
      </div>

      {/* Dossier cards */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading dossiers...</div>
      ) : dossiers.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No decision dossiers found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dossiers.map((d: any) => (
            <Link key={d.id} href={`/dashboard/activity/proof/${d.id}`}>
              <Card className="hover:border-fuchsia-500/40 transition-colors cursor-pointer h-full">
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant={decisionTypeVariant[d.decisionType] || 'neutral'}>
                      {d.decisionType || 'unknown'}
                    </Badge>
                    {d.confidence != null && (
                      <span className="text-sm font-mono font-bold text-fuchsia-400">
                        {Math.round(d.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  {d.summary && (
                    <p className="text-sm text-slate-300 line-clamp-2">{d.summary}</p>
                  )}
                  {d.outcomeInstanceId && (
                    <div className="text-xs text-slate-500">
                      Instance: <span className="font-mono text-slate-400">{d.outcomeInstanceId.slice(0, 10)}...</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {d.evidenceCount != null && (
                      <span>{d.evidenceCount} evidence items</span>
                    )}
                    {d.actor && <span>by {d.actor}</span>}
                    <span>{new Date(d.createdAt).toLocaleString()}</span>
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
