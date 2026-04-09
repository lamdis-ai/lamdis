"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const riskClassColors: Record<string, string> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
  minimal: 'neutral',
};

export default function OutcomesPage() {
  const [outcomes, setOutcomes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/orgs/outcomes', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setOutcomes(Array.isArray(data) ? data : data?.outcomes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Objectives</h1>
          <p className="text-sm text-slate-400 mt-1">Define and monitor the business objectives your systems must achieve</p>
        </div>
        <Link
          href="/dashboard/library/objectives/new"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors"
        >
          + New objective
        </Link>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading objectives...</div>
      ) : outcomes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400">No objectives defined yet. Create one to start tracking business results.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {outcomes.map((outcome: any) => (
            <Link key={outcome.id} href={`/dashboard/library/objectives/${outcome.id}`}>
              <Card className="hover:border-fuchsia-500/40 transition-colors cursor-pointer h-full">
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">{outcome.name}</h3>
                    <Badge variant={(riskClassColors[outcome.riskClass] || 'neutral') as any}>
                      {outcome.riskClass || 'unclassified'}
                    </Badge>
                  </div>
                  {outcome.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">{outcome.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{outcome.connectedSystems?.length || outcome.connectedSystemsCount || 0} systems</span>
                    <span>{outcome.successCriteria?.length || outcome.successCriteriaCount || 0} criteria</span>
                    {outcome.disabled && <Badge variant="warning">Disabled</Badge>}
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
