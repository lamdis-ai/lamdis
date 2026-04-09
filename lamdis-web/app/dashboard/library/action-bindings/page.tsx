"use client";
import { useEffect, useState } from 'react';
import Table from '@/components/base/Table';
import AlertModal from '@/components/base/AlertModal';
import Select from '@/components/base/Select';
import Input from '@/components/base/Input';

export const dynamic = 'force-dynamic';

type ActionBindingDoc = {
  _id: string;
  actionId: string;
  environmentId: string;
  connectionId?: string; // Reference to a connection
  auth?: {
    type: string;
    tokenVariableKey?: string;
    headerName?: string;
    tokenPrefix?: string;
  };
  baseUrl?: string;
  headers?: Record<string, string>;
  defaultInputs?: Record<string, any>;
  timeoutMs?: number;
  enabled?: boolean;
  notes?: string;
  // Enriched fields
  actionTitle?: string;
  environmentName?: string;
  environmentKey?: string;
  connectionName?: string;
};

type ActionDoc = { id: string; title?: string };
type EnvironmentDoc = { _id: string; key: string; name: string };
type ConnectionDoc = { _id: string; name: string; provider?: string; type?: string };

export default function ActionBindingsPage() {
  const [bindings, setBindings] = useState<ActionBindingDoc[] | null>(null);
  const [actions, setActions] = useState<ActionDoc[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentDoc[]>([]);
  const [connections, setConnections] = useState<ConnectionDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Partial<ActionBindingDoc> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ActionBindingDoc | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterEnv, setFilterEnv] = useState<string>('');

  useEffect(() => {
    loadActions();
    loadEnvironments();
    loadConnections();
  }, []);

  useEffect(() => {
    load();
  }, [filterAction, filterEnv]);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set('actionId', filterAction);
      if (filterEnv) params.set('environmentId', filterEnv);
      const r = await fetch(`/api/orgs/action-bindings?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) { setBindings([]); return; }
      const j = await r.json();
      setBindings(Array.isArray(j.bindings) ? j.bindings : []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
      setBindings([]);
    }
  }

  async function loadActions() {
    try {
      const r = await fetch('/api/orgs/actions', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setActions(Array.isArray(j.actions) ? j.actions : []);
      }
    } catch {}
  }

  async function loadEnvironments() {
    try {
      const r = await fetch('/api/orgs/environments', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setEnvironments(Array.isArray(j.environments) ? j.environments : []);
      }
    } catch {}
  }

  async function loadConnections() {
    try {
      const r = await fetch('/api/orgs/connections', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setConnections(Array.isArray(j.connections) ? j.connections : (Array.isArray(j) ? j : []));
      }
    } catch {}
  }

  async function save() {
    if (!editing?.actionId || !editing?.environmentId || !editing?.baseUrl) {
      setError('Action, Environment, and Base URL are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/orgs/action-bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }
      await load();
      setShowEditor(false);
      setEditing(null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(bindingId: string) {
    try {
      const res = await fetch(`/api/orgs/action-bindings/${encodeURIComponent(bindingId)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete');
      }
      await load();
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    }
  }

  const openNew = () => {
    setEditing({
      actionId: filterAction || '',
      environmentId: filterEnv || environments[0]?._id || '',
      baseUrl: '',
      connectionId: '',
      enabled: true,
    });
    setShowEditor(true);
  };

  const openEdit = (binding: ActionBindingDoc) => {
    setEditing({ ...binding });
    setShowEditor(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Action Bindings</h1>
        <p className="text-sm md:text-base text-slate-400 max-w-2xl">
          Action Bindings connect Actions to Environments with base URLs and auth.
          For example: "create-account" + "dev" → <code className="px-1 py-0.5 bg-slate-800 rounded text-xs">https://dev.accounts.api.com</code>
        </p>
      </header>

      {error && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Action:</label>
          <Select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="min-w-[200px]"
          >
            <option value="">All Actions</option>
            {actions.map((a) => <option key={a.id} value={a.id}>{a.title || a.id}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Environment:</label>
          <Select
            value={filterEnv}
            onChange={(e) => setFilterEnv(e.target.value)}
            className="min-w-[200px]"
          >
            <option value="">All Environments</option>
            {environments.map((env) => <option key={env._id} value={env._id}>{env.name} ({env.key})</option>)}
          </Select>
        </div>
        <button
          onClick={openNew}
          className="ml-auto px-4 py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white text-sm font-medium shadow hover:brightness-110 transition"
        >
          New Binding
        </button>
      </div>

      <section className="space-y-4">
        {bindings === null ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : (
          <Table
            data={bindings}
            empty={<span className="text-xs text-slate-500">No action bindings found.</span>}
            columns={[
              {
                key: 'action',
                header: 'Action',
                render: (b: ActionBindingDoc) => (
                  <div className="flex flex-col">
                    <span className="text-slate-200">{b.actionTitle || b.actionId}</span>
                    {b.actionTitle && (
                      <span className="text-[10px] text-slate-500 font-mono">{b.actionId}</span>
                    )}
                  </div>
                ),
              },
              {
                key: 'environment',
                header: 'Environment',
                render: (b: ActionBindingDoc) => (
                  <div className="flex flex-col">
                    <span className="text-slate-300">{b.environmentName || '—'}</span>
                    {b.environmentKey && (
                      <span className="text-[10px] text-slate-500 font-mono">{b.environmentKey}</span>
                    )}
                  </div>
                ),
              },
              {
                key: 'auth',
                header: 'Connection',
                render: (b: ActionBindingDoc) => {
                  const conn = connections.find(c => c._id === b.connectionId);
                  return conn ? (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">
                      {conn.name}
                    </span>
                  ) : (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                      None
                    </span>
                  );
                },
              },
              {
                key: 'baseUrl',
                header: 'Base URL',
                render: (b: ActionBindingDoc) => (
                  <span className="text-slate-400 text-xs font-mono truncate max-w-[200px] inline-block">
                    {b.baseUrl || '—'}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (b: ActionBindingDoc) => (
                  b.enabled === false ? (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-slate-700/30 text-slate-400 ring-1 ring-slate-700/30">Disabled</span>
                  ) : (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">Enabled</span>
                  )
                ),
              },
              {
                key: 'actions',
                header: '',
                render: (b: ActionBindingDoc) => (
                  <div className="flex items-center gap-3">
                    <button
                      className="text-[11px] underline decoration-dotted underline-offset-2 text-slate-400 hover:text-slate-200"
                      onClick={() => openEdit(b)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[11px] underline decoration-dotted underline-offset-2 text-rose-400 hover:text-rose-200"
                      onClick={() => setConfirmDelete(b)}
                    >
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      {/* Editor Modal */}
      {showEditor && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              <h2 className="text-xl font-semibold text-slate-100">
                {editing._id ? 'Edit Action Binding' : 'New Action Binding'}
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Action *</label>
                    <Select
                      value={editing.actionId || ''}
                      onChange={(e) => setEditing({ ...editing, actionId: e.target.value })}
                      disabled={!!editing._id}
                    >
                      <option value="">Select action...</option>
                      {actions.map((a) => <option key={a.id} value={a.id}>{a.title || a.id}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Environment *</label>
                    <Select
                      value={editing.environmentId || ''}
                      onChange={(e) => setEditing({ ...editing, environmentId: e.target.value })}
                      disabled={!!editing._id}
                    >
                      <option value="">Select environment...</option>
                      {environments.map((env) => <option key={env._id} value={env._id}>{env.name} ({env.key})</option>)}
                    </Select>
                  </div>
                </div>

                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                  <h3 className="text-sm font-medium text-slate-200">Authentication</h3>
                  
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Connection (Optional)</label>
                    <Select
                      value={editing.connectionId || ''}
                      onChange={(e) => setEditing({
                        ...editing,
                        connectionId: e.target.value || undefined
                      })}
                    >
                      <option value="">No authentication</option>
                      {connections.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}{c.provider ? ` (${c.provider})` : ''}
                        </option>
                      ))}
                    </Select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Select a connection to use its credentials for authentication.
                      Manage connections in the <a href="/dashboard/connections" className="underline text-sky-400">Connections</a> page.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Base URL *</label>
                  <Input
                    value={editing.baseUrl || ''}
                    onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                    placeholder="e.g., https://dev.accounts.api.com"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">The base URL for this action in this environment</p>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Timeout (ms)</label>
                  <Input
                    type="number"
                    value={editing.timeoutMs ?? ''}
                    onChange={(e) => setEditing({ ...editing, timeoutMs: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="Leave empty to use environment default"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Notes</label>
                  <textarea
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    value={editing.notes || ''}
                    onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                    placeholder="Optional notes about this binding..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={editing.enabled !== false}
                    onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                  />
                  <label htmlFor="enabled" className="text-sm text-slate-300">Enabled</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  onClick={() => { setShowEditor(false); setEditing(null); }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white text-sm font-medium shadow hover:brightness-110 transition disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Action Binding"
        message={`Are you sure you want to delete this binding? The action "${confirmDelete?.actionTitle || confirmDelete?.actionId}" will no longer have configuration for this environment.`}
        primaryLabel="Delete"
        onPrimary={() => confirmDelete && remove(confirmDelete._id)}
        variant="error"
      />
    </div>
  );
}
