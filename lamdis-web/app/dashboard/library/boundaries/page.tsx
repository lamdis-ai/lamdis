"use client";
import { useEffect, useState } from 'react';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const riskVariant: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

const typeVariant: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  guardrail: 'info',
  approval_gate: 'warning',
  hard_block: 'danger',
  notification: 'neutral',
};

interface BoundaryForm {
  name: string;
  description: string;
  boundaryType: string;
  riskLevel: string;
  autoExecute: boolean;
  requiresHumanApproval: boolean;
  escalationPolicy: string;
}

const emptyForm: BoundaryForm = {
  name: '',
  description: '',
  boundaryType: 'guardrail',
  riskLevel: 'low',
  autoExecute: false,
  requiresHumanApproval: false,
  escalationPolicy: '',
};

export default function BoundariesPage() {
  const [boundaries, setBoundaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BoundaryForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const loadBoundaries = () => {
    setLoading(true);
    fetch('/api/orgs/boundaries', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setBoundaries(Array.isArray(data) ? data : data?.boundaries || data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBoundaries(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (b: any) => {
    setEditId(b.id);
    setForm({
      name: b.name || '',
      description: b.description || '',
      boundaryType: b.boundaryType || 'guardrail',
      riskLevel: b.riskLevel || 'low',
      autoExecute: !!b.autoExecute,
      requiresHumanApproval: !!b.requiresHumanApproval,
      escalationPolicy: b.escalationPolicy || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editId ? `/api/orgs/boundaries/${editId}` : '/api/orgs/boundaries';
      const method = editId ? 'PUT' : 'POST';
      await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setEditId(null);
      loadBoundaries();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this boundary definition?')) return;
    try {
      await fetch(`/api/orgs/boundaries/${id}`, { method: 'DELETE' });
      loadBoundaries();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Decision Boundaries</h1>
          <p className="text-sm text-slate-400 mt-1">Define where autonomous execution ends and human approval begins</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors"
        >
          + New boundary
        </button>
      </div>

      {/* Form panel */}
      {showForm && (
        <Card>
          <div className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">
              {editId ? 'Edit Boundary' : 'Create Boundary'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
                  placeholder="e.g. Payment approval gate"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Boundary Type</label>
                <select
                  value={form.boundaryType}
                  onChange={e => setForm(f => ({ ...f, boundaryType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="guardrail">Guardrail</option>
                  <option value="approval_gate">Approval Gate</option>
                  <option value="hard_block">Hard Block</option>
                  <option value="notification">Notification</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Risk Level</label>
                <select
                  value={form.riskLevel}
                  onChange={e => setForm(f => ({ ...f, riskLevel: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Escalation Policy</label>
                <input
                  type="text"
                  value={form.escalationPolicy}
                  onChange={e => setForm(f => ({ ...f, escalationPolicy: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
                  placeholder="e.g. notify-ops-lead"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200"
                  placeholder="Describe when this boundary should apply..."
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoExecute}
                    onChange={e => setForm(f => ({ ...f, autoExecute: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  Auto-execute
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requiresHumanApproval}
                    onChange={e => setForm(f => ({ ...f, requiresHumanApproval: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  Requires human approval
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditId(null); }}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 text-sm font-medium hover:border-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Boundaries list */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading boundaries...</div>
      ) : boundaries.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No boundaries defined yet</div>
      ) : (
        <div className="space-y-2">
          {boundaries.map((b: any) => (
            <Card key={b.id} className="hover:border-fuchsia-500/30 transition-colors">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge variant={typeVariant[b.boundaryType] || 'neutral'}>
                    {b.boundaryType || 'guardrail'}
                  </Badge>
                  <Badge variant={riskVariant[b.riskLevel] || 'neutral'}>
                    {b.riskLevel || 'low'}
                  </Badge>
                  <span className="text-sm text-slate-200 font-medium truncate">
                    {b.name}
                  </span>
                  {b.description && (
                    <span className="text-xs text-slate-500 truncate hidden lg:inline">{b.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  {b.autoExecute && (
                    <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-400">auto</span>
                  )}
                  {b.requiresHumanApproval && (
                    <span className="px-2 py-0.5 rounded bg-amber-950/50 text-amber-400">human</span>
                  )}
                  {b.escalationPolicy && (
                    <span className="text-slate-500">{b.escalationPolicy}</span>
                  )}
                  <button
                    onClick={() => openEdit(b)}
                    className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="px-2 py-1 rounded text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
