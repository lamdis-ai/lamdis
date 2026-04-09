"use client";
import { useEffect, useState } from 'react';
import Input from '@/components/base/Input';
import { FiEye, FiTrash2, FiPlus, FiRefreshCcw, FiClipboard, FiActivity } from 'react-icons/fi';
import Button from '@/components/base/Button';

interface VariableMeta { id: string; key: string; createdAt: string; updatedAt: string; revealCount?: number; revealedAt?: string; }
interface AuditEvent { id: string; action: string; key?: string; actor?: string; createdAt: string; }

export default function VariablesPage() {
  const [vars, setVars] = useState<VariableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [revealId, setRevealId] = useState<string | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string,string>>({});
  const [error, setError] = useState<string>('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/orgs/variables');
      const d = await r.json();
      if (r.ok) setVars(d.variables || []); else setError(d.error || 'Load failed');
    } catch(e:any){ setError(String(e)); }
    setLoading(false);
  }
  useEffect(() => { load(); if (showAudit) loadAudit(); }, [refreshTick]);

  async function loadAudit() {
    try {
      const r = await fetch('/api/orgs/variables/audit');
      const d = await r.json();
      if (r.ok) setAudit(d.audit || []);
    } catch {}
  }

  async function createVar() {
    setError('');
    if (!newKey || !newValue) { setError('Key and value required'); return; }
    setCreating(true);
    try {
      const r = await fetch('/api/orgs/variables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: newKey.trim(), value: newValue }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Create failed'); } else {
        setNewKey('');
        setNewValue('');
        setRefreshTick(t=>t+1);
        // If audit panel is open, refresh it so the upsert event appears immediately
        if (showAudit) loadAudit();
      }
    } catch(e:any){ setError(String(e)); }
    setCreating(false);
  }

  async function reveal(id: string) {
    setRevealId(id);
    try {
      const r = await fetch(`/api/orgs/variables/${id}/reveal`, { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        setRevealedValues(v => ({ ...v, [id]: (d.variable?.value || '') }));
        // Auto refresh audit log so reveal action shows without manual reload
        if (showAudit) loadAudit();
      } else setError(d.error || 'Reveal failed');
    } catch(e:any){ setError(String(e)); }
    setRevealId(null);
  }

  async function del(id: string, key: string) {
    if (!confirm(`Delete variable ${key}?`)) return;
    try {
      const r = await fetch(`/api/orgs/variables/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) setError(d.error || 'Delete failed'); else {
        setVars(v => v.filter(x => x.id !== id));
        if (showAudit) loadAudit(); // refresh audit so delete event shows
      }
    } catch(e:any){ setError(String(e)); }
  }

  function beginEdit(v: VariableMeta) {
    setNewKey(v.key);
    setNewValue('');
    setEditingId(v.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setNewKey('');
    setNewValue('');
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold flex items-center gap-2">Variables <Button variant="outline" className="h-7 px-2 text-[11px]" onClick={()=>{ setShowAudit(s=>!s); if(!showAudit) loadAudit();}}><FiActivity className="opacity-70"/>Audit</Button></h1>
        <Button variant="ghost" onClick={() => setRefreshTick(t=>t+1)} className="flex items-center gap-1 h-8 text-xs"><FiRefreshCcw/>Refresh</Button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Encrypted organization variables (secrets). Values are stored encrypted at rest. Viewing a value is fully audited. Keys must be UPPER_SNAKE_CASE. Rotating a value overwrites the previous ciphertext.</p>

      <div className="border border-slate-800/70 rounded-card p-4 space-y-4 bg-slate-900/40">
  <h2 className="text-lg font-medium flex items-center gap-2"><FiPlus/>{editingId ? 'Update Variable Value' : 'Create / Update Variable'}</h2>
        {error && <div className="text-sm text-rose-400">{error}</div>}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-slate-400 flex justify-between"><span>Key</span>{editingId && <span className="text-[10px] text-slate-500">Editing</span>}</label>
            <Input value={newKey} mono disabled={!!editingId} onChange={e=>setNewKey(e.target.value.toUpperCase())} placeholder="KEY_NAME" sizeVariant="sm" />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-slate-400">Value</label>
            <Input value={newValue} onChange={e=>setNewValue(e.target.value)} placeholder="secret value" sizeVariant="sm" />
          </div>
          <div className="flex items-end gap-2">
            <Button disabled={creating} onClick={createVar} className="min-w-[120px] h-10 mt-5 md:mt-auto">{creating ? 'Saving…' : (editingId ? 'Update' : 'Save')}</Button>
            {editingId && <Button variant='ghost' type='button' onClick={cancelEdit} className='h-10 mt-5 md:mt-auto'>Cancel</Button>}
          </div>
        </div>
        <p className="text-[11px] text-slate-500">{editingId ? 'Updating will overwrite old encrypted value; reveal history remains.' : 'Keys are immutable once created. Re-saving an existing key overwrites the value.'}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium">Stored Variables ({vars.length})</h2>
        {loading ? <div className="text-slate-500">Loading…</div> : (
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-1 px-2">Key</th>
                <th className="py-1 px-2">Created</th>
                <th className="py-1 px-2">Updated</th>
                <th className="py-1 px-2">Reveals</th>
                <th className="py-1 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vars.map(v => (
                <tr key={v.id} className="bg-slate-800/40 hover:bg-slate-800/60">
                  <td className="py-2 px-2 font-mono text-[13px]">{v.key}</td>
                  <td className="py-2 px-2 text-slate-400">{new Date(v.createdAt).toLocaleString()}</td>
                  <td className="py-2 px-2 text-slate-400">{new Date(v.updatedAt).toLocaleString()}</td>
                  <td className="py-2 px-2 text-slate-400">{v.revealCount || 0}</td>
                  <td className="py-2 px-2 flex gap-2">
                    <Button
                      variant='outline'
                      onClick={()=>reveal(v.id)}
                      disabled={revealId===v.id}
                      className="h-8 px-2 text-[11px] flex items-center gap-1 border-slate-600/60 hover:border-slate-500/70 hover:bg-slate-800/70 text-slate-200"
                    >
                      <FiEye/>{revealedValues[v.id] ? 'Revealed' : 'Reveal'}
                    </Button>
                    <Button variant='outline' onClick={()=>beginEdit(v)} className='h-8 px-2 text-[11px] flex items-center gap-1'><FiClipboard/>Edit</Button>
                    <Button variant='danger' onClick={()=>del(v.id,v.key)} className='h-8 px-2 text-[11px] flex items-center gap-1'><FiTrash2/>Del</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!!Object.keys(revealedValues).length && (
          <div className="mt-6 border border-amber-500/30 rounded-md p-4 bg-amber-500/5">
            <h3 className="font-medium mb-2 text-amber-400">Revealed Values (Sensitive)</h3>
            <ul className="space-y-1">
              {Object.entries(revealedValues).map(([id,val]) => {
                const k = vars.find(v=>v.id===id)?.key || id;
                return <li key={id} className="flex items-center gap-3"><code className="inline px-2 py-1 rounded bg-slate-900/60">{k}</code><span className="font-mono break-all">{val}</span></li>;
              })}
            </ul>
          </div>
        )}
      </div>

      {showAudit && (
        <div className='mt-10 border border-slate-800/70 rounded-card p-4 bg-slate-900/40'>
          <div className='flex items-center gap-2 mb-3'>
            <h2 className='text-lg font-medium flex items-center gap-2'><FiActivity/>Variable Audit Log</h2>
            <Button variant='ghost' className='h-7 px-2 text-[11px]' onClick={()=>{ loadAudit(); }}>Reload</Button>
          </div>
          {audit.length === 0 ? <div className='text-slate-500 text-sm'>No recent variable events.</div> : (
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-slate-400'>
                  <th className='py-1 px-2'>Time</th>
                  <th className='py-1 px-2'>Action</th>
                  <th className='py-1 px-2'>Key</th>
                  <th className='py-1 px-2'>Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id} className='border-t border-slate-800/60'>
                    <td className='py-1 px-2 text-slate-400'>{new Date(a.createdAt).toLocaleString()}</td>
                    <td className='py-1 px-2'>{a.action.replace('variable.','')}</td>
                    <td className='py-1 px-2 font-mono'>{a.key || '—'}</td>
                    <td className='py-1 px-2 text-slate-400'>{a.actor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
