"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';

interface UsageEvent {
  id: string;
  createdAt: string;
  serviceKey: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number | null;
  status: string;
  outcomeInstanceId: string | null;
  outcomeTypeId: string | null;
  agentTaskId: string | null;
  errorMessage: string | null;
}

function fmtUsd(n: number): string {
  if (!n) return '$0.0000';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

export default function UsageEventsPage() {
  const [items, setItems] = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ limit: '100' });
        if (serviceFilter) qs.set('serviceKey', serviceFilter);
        const res = await fetch(`/api/orgs/usage/events?${qs}`);
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const json = await res.json();
        if (!cancelled) setItems(json.items || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [serviceFilter]);

  return (
    <div className="max-w-6xl space-y-4">
      <Link href="/dashboard/usage" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Usage
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">LLM Event Log</h1>
        <p className="text-sm text-slate-400 mt-1">Every Bedrock call this org has made.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Filter by service key (e.g. agentPlanner)"
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 w-80"
        />
      </div>

      {error && <div className="text-sm text-rose-400">{error}</div>}
      {loading && <div className="text-sm text-slate-400">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="text-sm text-slate-500">No events match your filter.</div>
      )}

      {!loading && items.length > 0 && (
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80">
              <tr className="text-left text-slate-400">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2 text-right">In</th>
                <th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Latency</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Instance</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t border-slate-800/40 text-slate-300">
                  <td className="px-3 py-2 text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{e.serviceKey}</td>
                  <td className="px-3 py-2 text-slate-500">{(e.modelId || '').replace('us.anthropic.', '').slice(0, 30)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.inputTokens}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.outputTokens}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(Number(e.costUsd))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{e.durationMs != null ? `${e.durationMs}ms` : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={
                      e.status === 'success' ? 'text-emerald-400' :
                      e.status === 'blocked' ? 'text-amber-400' : 'text-rose-400'
                    }>{e.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{e.outcomeInstanceId ? e.outcomeInstanceId.slice(0, 8) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
