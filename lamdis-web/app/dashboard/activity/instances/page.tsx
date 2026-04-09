"use client";
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const proofStatusVariant: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  proven: 'success',
  partial: 'warning',
  unproven: 'neutral',
  disproven: 'danger',
  pending: 'info',
};

const automationModeVariant: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  autonomous: 'info',
  supervised: 'warning',
  manual: 'neutral',
};

export default function OutcomeInstancesPage() {
  const searchParams = useSearchParams();
  const [instances, setInstances] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    proofStatus: searchParams?.get('proofStatus') || '',
    automationMode: searchParams?.get('automationMode') || '',
    environment: searchParams?.get('environment') || '',
    stalledOnly: searchParams?.get('stalledOnly') || '',
    outcomeId: searchParams?.get('outcomeId') || '',
  });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.proofStatus) params.set('proofStatus', filters.proofStatus);
    if (filters.automationMode) params.set('automationMode', filters.automationMode);
    if (filters.environment) params.set('environment', filters.environment);
    if (filters.stalledOnly) params.set('stalledOnly', filters.stalledOnly);
    if (filters.outcomeId) params.set('outcomeId', filters.outcomeId);
    params.set('limit', '50');

    fetch(`/api/orgs/outcome-instances?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setInstances(data?.instances || []);
        setTotal(data?.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters]);

  const toggleStalled = () => {
    setFilters(f => ({
      ...f,
      stalledOnly: f.stalledOnly ? '' : 'true',
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Objective Instances</h1>
        <p className="text-sm text-slate-400 mt-1">Active and historical objective executions across all environments</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.proofStatus}
          onChange={e => setFilters(f => ({ ...f, proofStatus: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All proof statuses</option>
          <option value="proven">Proven</option>
          <option value="partial">Partial</option>
          <option value="unproven">Unproven</option>
          <option value="disproven">Disproven</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={filters.automationMode}
          onChange={e => setFilters(f => ({ ...f, automationMode: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All automation modes</option>
          <option value="autonomous">Autonomous</option>
          <option value="supervised">Supervised</option>
          <option value="manual">Manual</option>
        </select>
        <select
          value={filters.environment}
          onChange={e => setFilters(f => ({ ...f, environment: e.target.value }))}
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All environments</option>
          <option value="ci">CI</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
          <option value="synthetic">Synthetic</option>
        </select>
        <button
          onClick={toggleStalled}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            filters.stalledOnly
              ? 'bg-amber-600 text-white'
              : 'border border-slate-700 bg-slate-800/50 text-slate-300 hover:border-amber-600/50'
          }`}
        >
          Stalled Only
        </button>
        <span className="text-sm text-slate-500 self-center">{total} instances</span>
      </div>

      {/* Instances table */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : instances.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No objective instances found</div>
      ) : (
        <div className="space-y-2">
          {instances.map((inst: any) => (
            <Link key={inst.id} href={`/dashboard/activity/instances/${inst.id}`}>
              <Card className="hover:border-fuchsia-500/30 transition-colors cursor-pointer">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={
                      inst.status === 'passed' ? 'success' :
                      inst.status === 'failed' ? 'danger' :
                      inst.status === 'open' ? 'neutral' : 'warning'
                    }>
                      {inst.status}
                    </Badge>
                    <Badge variant={proofStatusVariant[inst.proofStatus] || 'neutral'}>
                      {inst.proofStatus || 'pending'}
                    </Badge>
                    <span className="text-sm text-slate-300 font-mono">{inst.id?.slice(0, 12)}...</span>
                    <span className="text-xs text-slate-400 truncate max-w-48">{inst.outcomeName || inst.outcome?.name || ''}</span>
                    <Badge variant="neutral">{inst.environment}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {inst.confidence != null && (
                      <span className="text-fuchsia-400 font-mono font-bold">
                        {(inst.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    <Badge variant={automationModeVariant[inst.automationMode] || 'neutral'}>
                      {inst.automationMode || 'unknown'}
                    </Badge>
                    <span className="text-slate-500">{new Date(inst.createdAt).toLocaleString()}</span>
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
