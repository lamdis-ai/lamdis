"use client";
import { useEffect, useState } from 'react';
import Table from '@/components/base/Table';
import AlertModal from '@/components/base/AlertModal';
import Modal from '@/components/base/Modal';
import Input from '@/components/base/Input';
import Button from '@/components/base/Button';
import Badge from '@/components/base/Badge';
import { FiSettings } from 'react-icons/fi';

export const dynamic = 'force-dynamic';

type EnvironmentDoc = {
  _id: string;
  key: string;
  name: string;
  description?: string;
  enabled?: boolean;
  bindingsCount?: number;
  setupsCount?: number;
};

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<EnvironmentDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Partial<EnvironmentDoc> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EnvironmentDoc | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const r = await fetch('/api/orgs/environments', { cache: 'no-store' });
      if (!r.ok) { setEnvironments([]); return; }
      const j = await r.json();
      setEnvironments(Array.isArray(j.environments) ? j.environments : []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
      setEnvironments([]);
    }
  }

  async function save() {
    if (!editing?.key || !editing?.name) {
      setError('Key and Name are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/orgs/environments', {
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

  async function remove(envId: string) {
    try {
      const res = await fetch(`/api/orgs/environments/${encodeURIComponent(envId)}`, { method: 'DELETE' });
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
    setEditing({ key: '', name: '', enabled: true });
    setShowEditor(true);
  };

  const openEdit = (env: EnvironmentDoc) => {
    setEditing({ ...env });
    setShowEditor(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Environments</h1>
        <p className="text-sm md:text-base text-slate-400 max-w-2xl">
          Environments are deployment stages like dev, staging, and prod. 
          Create ActionBindings to connect Actions to Environments with specific base URLs and auth.
        </p>
      </header>

      {error && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-[15px] font-medium text-slate-200 tracking-wide">
            Org-Wide Environments
          </div>
          <button
            onClick={openNew}
            className="ml-auto px-4 py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white text-sm font-medium shadow hover:brightness-110 transition"
          >
            New Environment
          </button>
        </div>

        {environments === null ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : (
          <Table
            data={environments}
            empty={<span className="text-xs text-slate-500">No environments configured.</span>}
            columns={[
              {
                key: 'key',
                header: 'Key',
                render: (e: EnvironmentDoc) => <span className="font-mono text-slate-200">{e.key}</span>,
              },
              {
                key: 'name',
                header: 'Name',
                render: (e: EnvironmentDoc) => <span className="text-slate-300">{e.name}</span>,
              },
              {
                key: 'description',
                header: 'Description',
                render: (e: EnvironmentDoc) => (
                  <span className="text-slate-400 text-xs truncate max-w-[200px] inline-block">
                    {e.description || '—'}
                  </span>
                ),
              },
              {
                key: 'bindings',
                header: 'Bindings',
                render: (e: EnvironmentDoc) => (
                  <span className="text-slate-400">{e.bindingsCount ?? 0}</span>
                ),
              },
              {
                key: 'setups',
                header: 'Setups',
                render: (e: EnvironmentDoc) => (
                  <span className="text-slate-400">{e.setupsCount ?? 0}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (e: EnvironmentDoc) => (
                  e.enabled === false ? (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-slate-700/30 text-slate-400 ring-1 ring-slate-700/30">Disabled</span>
                  ) : (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">Enabled</span>
                  )
                ),
              },
              {
                key: 'actions',
                header: '',
                render: (e: EnvironmentDoc) => (
                  <div className="flex items-center gap-3">
                    <button
                      className="text-[11px] underline decoration-dotted underline-offset-2 text-slate-400 hover:text-slate-200"
                      onClick={() => openEdit(e)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[11px] underline decoration-dotted underline-offset-2 text-rose-400 hover:text-rose-200"
                      onClick={() => setConfirmDelete(e)}
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
      <Modal
        open={!!(showEditor && editing)}
        onClose={() => { setShowEditor(false); setEditing(null); }}
        title={editing?._id ? 'Edit Environment' : 'New Environment'}
        titleIcon={<FiSettings className="text-fuchsia-400" />}
        size="md"
        footer={
          <>
            <button
              onClick={() => { setShowEditor(false); setEditing(null); }}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-sm"
            >
              Cancel
            </button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Key *</label>
              <Input
                value={editing.key || ''}
                onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                placeholder="e.g., dev, staging, prod"
                disabled={!!editing._id}
              />
              <p className="text-xs text-slate-500 mt-1">Unique identifier (cannot be changed after creation)</p>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Name *</label>
              <Input
                value={editing.name || ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g., Development, Staging, Production"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Description</label>
              <textarea
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Describe this environment..."
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                className="rounded border-slate-600 bg-slate-800 text-fuchsia-500 focus:ring-fuchsia-500"
              />
              <label htmlFor="enabled" className="text-sm text-slate-300">Enabled</label>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <AlertModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Environment"
        message={`Are you sure you want to delete "${confirmDelete?.name}"? This cannot be undone.`}
        primaryLabel="Delete"
        onPrimary={() => confirmDelete && remove(confirmDelete._id)}
        variant="error"
      />
    </div>
  );
}
