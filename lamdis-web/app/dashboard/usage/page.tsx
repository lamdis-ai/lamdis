"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiDollarSign, FiActivity, FiAlertCircle, FiTrendingUp, FiClipboard } from 'react-icons/fi';

interface UsageSummary {
  period: string;
  periodStart: string;
  total: {
    totalCostUsd: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  };
  byService: Array<{ serviceKey: string; totalCostUsd: number; totalTokens: number; callCount: number }>;
  byModel: Array<{ modelId: string; totalCostUsd: number; totalTokens: number; callCount: number }>;
  byOutcomeType: Array<{ outcomeTypeId: string; totalCostUsd: number; totalTokens: number; callCount: number }>;
  byOutcomeInstance: Array<{ outcomeInstanceId: string; totalCostUsd: number; totalTokens: number; callCount: number }>;
}

interface Forecast {
  usedUsd: number;
  projectedMonthEndUsd: number;
  elapsedDays: number;
  totalDays: number;
}

function fmtUsd(n: number): string {
  if (!n) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sumRes, fcRes] = await Promise.all([
          fetch('/api/orgs/usage/summary?period=monthly'),
          fetch('/api/orgs/usage/forecast'),
        ]);
        if (!sumRes.ok) throw new Error(`Failed to load summary (${sumRes.status})`);
        const sumJson = await sumRes.json();
        const fcJson = fcRes.ok ? await fcRes.json() : null;
        if (!cancelled) {
          setSummary(sumJson);
          setForecast(fcJson);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load usage');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="text-sm text-slate-400">Loading usage…</div>;
  }
  if (error) {
    return <div className="text-sm text-rose-400">{error}</div>;
  }
  if (!summary) {
    return <div className="text-sm text-slate-400">No usage data yet.</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">LLM Usage</h1>
          <p className="text-sm text-slate-400 mt-1">
            Token and cost telemetry for every Bedrock call this org makes.
          </p>
        </div>
        <Link
          href="/dashboard/usage/budgets"
          className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm"
        >
          Manage budgets
        </Link>
      </div>

      {/* Top stat row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat icon={<FiDollarSign />} label="This month" value={fmtUsd(summary.total.totalCostUsd)} sub={`${summary.total.callCount.toLocaleString()} calls`} />
        <Stat icon={<FiActivity />} label="Tokens used" value={fmtTokens(summary.total.totalTokens)} sub={`${fmtTokens(summary.total.totalInputTokens)} in / ${fmtTokens(summary.total.totalOutputTokens)} out`} />
        <Stat
          icon={<FiTrendingUp />}
          label="Projected month-end"
          value={fmtUsd(forecast?.projectedMonthEndUsd ?? 0)}
          sub={forecast ? `Day ${Math.floor(forecast.elapsedDays)} of ${Math.floor(forecast.totalDays)}` : ''}
        />
        <Link href="/dashboard/usage/events" className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-4 hover:border-fuchsia-500/40">
          <div className="flex items-center gap-2 text-fuchsia-300"><FiClipboard /> <span className="text-sm">Event log</span></div>
          <div className="text-xs text-slate-500 mt-2">View every individual LLM call with attribution.</div>
        </Link>
      </div>

      {/* Breakdown columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BreakdownCard
          title="By service"
          rows={summary.byService.map((s) => ({ key: s.serviceKey, cost: s.totalCostUsd, tokens: s.totalTokens, calls: s.callCount }))}
        />
        <BreakdownCard
          title="By model"
          rows={summary.byModel.map((m) => ({ key: m.modelId || '(unknown)', cost: m.totalCostUsd, tokens: m.totalTokens, calls: m.callCount }))}
        />
        <BreakdownCard
          title="Top outcome types"
          rows={summary.byOutcomeType.map((o) => ({ key: (o.outcomeTypeId || '').slice(0, 8), cost: o.totalCostUsd, tokens: o.totalTokens, calls: o.callCount }))}
        />
        <BreakdownCard
          title="Top outcome instances"
          rows={summary.byOutcomeInstance.map((o) => ({ key: (o.outcomeInstanceId || '').slice(0, 8), cost: o.totalCostUsd, tokens: o.totalTokens, calls: o.callCount }))}
        />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 text-fuchsia-300 text-sm">{icon} <span>{label}</span></div>
      <div className="text-2xl font-semibold text-slate-100 mt-2">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ key: string; cost: number; tokens: number; calls: number }> }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-4">
        <div className="text-sm font-medium text-slate-100">{title}</div>
        <div className="text-xs text-slate-500 mt-3">No data yet.</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-4">
      <div className="text-sm font-medium text-slate-100 mb-3">{title}</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between text-xs">
            <div className="text-slate-300 truncate mr-3">{r.key || '(unattributed)'}</div>
            <div className="text-slate-500 tabular-nums">{fmtUsd(r.cost)} · {fmtTokens(r.tokens)} · {r.calls}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
