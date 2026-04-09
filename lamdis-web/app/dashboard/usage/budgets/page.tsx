"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiArrowLeft, FiTrash2 } from 'react-icons/fi';

interface Budget {
  id: string;
  scope: 'org' | 'outcome_type' | 'outcome_instance' | 'agent_task' | 'model';
  scopeRefId: string | null;
  periodType: 'monthly' | 'daily' | 'lifetime';
  limitUsd: number;
  warningThresholdPct: number;
  enforcementMode: 'block' | 'warn';
  enabled: boolean;
}

const SCOPES = [
  { value: 'org', label: 'Organization (all LLM spend)' },
  { value: 'outcome_type', label: 'Outcome type' },
  { value: 'outcome_instance', label: 'Outcome instance (single run)' },
  { value: 'agent_task', label: 'Agent task' },
  { value: 'model', label: 'Specific model' },
] as const;

export default function BudgetsPage() {
  const [items, setItems] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    scope: 'org' as Budget['scope'],
    scopeRefId: '',
    periodType: 'monthly' as Budget['periodType'],
    limitUsd: '100',
    warningThresholdPct: '80',
    enforcementMode: 'block' as Budget['enforcementMode'],
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/orgs/budgets');
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      setItems(json.items || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createBudget(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const body = {
        scope: form.scope,
        scopeRefId: form.scope === 'org' ? null : form.scopeRefId,
        periodType: form.periodType,
        limitUsd: Number(form.limitUsd),
        warningThresholdPct: Number(form.warningThresholdPct),
        enforcementMode: form.enforcementMode,
      };
      const res = await fetch('/api/orgs/budgets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || j.error || `Failed (${res.status})`);
      }
      await load();
      setForm({ ...form, scopeRefId: '', limitUsd: '100' });
    } catch (e: any) {
      setError(e?.message || 'failed');
    } finally {
      setCreating(false);
    }
  }

  async function deleteBudget(id: string) {
    if (!confirm('Delete this budget?')) return;
    await fetch(`/api/orgs/budgets/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/dashboard/usage" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Usage
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-slate-100">LLM Budgets</h1>
        <p className="text-sm text-slate-400 mt-1">
          Hard caps on LLM spend. When a call would exceed an active budget,
          the platform returns 429 and the agent stops until the period rolls
          over or the limit is raised.
        </p>
      </div>

      {error && <div className="text-sm text-rose-400">{error}</div>}

      <form onSubmit={createBudget} className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-4 space-y-3">
        <div className="text-sm font-medium text-slate-100">Create budget</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Scope">
            <select
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-100"
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value as Budget['scope'] })}
            >
              {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          {form.scope !== 'org' && (
            <Field label={form.scope === 'model' ? 'Model id' : 'ID'}>
              <input
                type="text"
                value={form.scopeRefId}
                onChange={(e) => setForm({ ...form, scopeRefId: e.target.value })}
                placeholder={form.scope === 'model' ? 'us.anthropic.claude-sonnet-4-6' : 'uuid…'}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-100"
                required
              />
            </Field>
          )}
          <Field label="Period">
            <select
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-100"
              value={form.periodType}
              onChange={(e) => setForm({ ...form, periodType: e.target.value as Budget['periodType'] })}
            >
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </Field>
          <Field label="Limit (USD)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.limitUsd}
              onChange={(e) => setForm({ ...form, limitUsd: e.target.value })}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-100"
              required
            />
          </Field>
          <Field label="Warning threshold (%)">
            <input
              type="number"
              min="1"
              max="100"
              value={form.warningThresholdPct}
              onChange={(e) => setForm({ ...form, warningThresholdPct: e.target.value })}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-100"
            />
          </Field>
          <Field label="Enforcement">
            <select
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-100"
              value={form.enforcementMode}
              onChange={(e) => setForm({ ...form, enforcementMode: e.target.value as Budget['enforcementMode'] })}
            >
              <option value="block">Block at 100%</option>
              <option value="warn">Warn only (no block)</option>
            </select>
          </Field>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm"
        >
          {creating ? 'Creating…' : 'Create budget'}
        </button>
      </form>

      <div className="rounded-xl border border-slate-800/70 bg-slate-900/40">
        <div className="px-4 py-3 border-b border-slate-800/70 text-sm font-medium text-slate-100">
          Active budgets
        </div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">No budgets configured.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 text-left text-slate-400">
              <tr>
                <th className="px-3 py-2">Scope</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2 text-right">Limit</th>
                <th className="px-3 py-2 text-right">Warn at</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-t border-slate-800/40 text-slate-300">
                  <td className="px-3 py-2">{b.scope}</td>
                  <td className="px-3 py-2 text-slate-500">{b.scopeRefId || '—'}</td>
                  <td className="px-3 py-2">{b.periodType}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${Number(b.limitUsd).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.warningThresholdPct}%</td>
                  <td className="px-3 py-2">
                    <span className={b.enforcementMode === 'block' ? 'text-amber-400' : 'text-slate-400'}>
                      {b.enforcementMode}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => deleteBudget(b.id)}
                      className="text-slate-500 hover:text-rose-400"
                      title="Delete"
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  );
}
