"use client";
import { useState } from 'react';
import Button from '../base/Button';
import Modal from '../base/Modal';
import { FiCpu } from 'react-icons/fi';

export default function MockAssistantCreate({ onCreated }: { onCreated?: () => void | Promise<void> }){
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Lamdis Helper');
  const [persona, setPersona] = useState('You are a helpful assistant for testing.');
  const [responseFieldPath, setResponseFieldPath] = useState('reply');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleCreate(){
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/orgs/mock-assistants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, persona, responseFieldPath: responseFieldPath || 'reply' }) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j?._id) throw new Error(j?.error || 'Failed to create mock assistant');
      const suffix = String(j._id || '').slice(-4);
      const suggestedKey = `mock-${(name||'assistant').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)+/g,'').slice(0,48)}${suffix ? `-${suffix}`:''}`;
      const suggestedLabel = `${name || 'Assistant'} (Mock)`;
      const r2 = await fetch(`/api/orgs/mock-assistants/${encodeURIComponent(String(j._id))}/connection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: suggestedKey, label: suggestedLabel }) });
      const j2 = await r2.json().catch(()=>({}));
      if (!r2.ok) throw new Error(j2?.error || 'Failed to create connection');
      setOpen(false);
      if (onCreated) await onCreated();
    } catch(e:any){ setMsg(e?.message || 'Failed'); } finally { setSaving(false); }
  }

  return (
    <>
      <Button variant="neutral" onClick={()=> setOpen(true)}>New Mock Assistant</Button>
      <Modal 
        open={open} 
        onClose={()=> setOpen(false)} 
        title="New Mock Assistant"
        titleIcon={<FiCpu className="text-fuchsia-400" />}
        size="lg"
        footer={
          <>
            <button onClick={()=> setOpen(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-sm">
              Cancel
            </button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create mock & connection'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <input 
              value={name} 
              onChange={e=>setName(e.target.value)} 
              placeholder="Lamdis Helper" 
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500" 
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Persona (prompt)</label>
            <textarea 
              value={persona} 
              onChange={e=>setPersona(e.target.value)} 
              placeholder="You are a helpful assistant…" 
              rows={5} 
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500" 
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Response Field Path</label>
            <input 
              value={responseFieldPath} 
              onChange={e=>setResponseFieldPath(e.target.value)} 
              placeholder="reply" 
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500" 
            />
            <p className="mt-1 text-xs text-slate-500">
              The field path in the response to extract the reply. Used for test results and chat rendering. Default: "reply"
            </p>
          </div>
          {msg && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-2">{msg}</div>}
        </div>
      </Modal>
    </>
  );
}
