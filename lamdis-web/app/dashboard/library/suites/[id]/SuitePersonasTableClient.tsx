"use client";
import Table from '@/components/base/Table';
import Button from '@/components/base/Button';
import Textarea from '@/components/base/Textarea';
import Input from '@/components/base/Input';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Persona = { id: string; name: string; yaml?: string; updatedAt?: string };

export default function SuitePersonasTableClient({ suiteId, personas }: { suiteId: string; personas: Persona[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; yaml: string }>({ name: '', yaml: '' });
  const [saving, setSaving] = useState(false);

  function beginEdit(p: Persona) {
    setEditingId(p.id);
    setForm({ name: p.name || '', yaml: p.yaml || '' });
  }
  function cancelEdit() {
    setEditingId(null);
    setForm({ name: '', yaml: '' });
  }
  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/personas/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error('Failed to save persona');
      setEditingId(null);
      router.refresh();
    } catch (e) {
      console.error(e);
      if (typeof window !== 'undefined') alert('Failed to save persona');
    } finally { setSaving(false); }
  }
  async function handleDelete(id: string) {
    const ok = typeof window !== 'undefined' ? window.confirm('Delete this persona? This cannot be undone.') : true;
    if (!ok) return;
    try {
      const res = await fetch(`/api/orgs/personas/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete persona');
      router.refresh();
    } catch (e) {
      console.error(e);
      if (typeof window !== 'undefined') alert('Failed to delete persona');
    }
  }

  return (
    <div className="space-y-3">
      <Table
        columns={[
          { key: 'name', header: 'Name', render: (p: Persona) => (
            editingId === p.id ? (
              <Input value={form.name} onChange={(e:any)=>setForm(f=>({ ...f, name: e.target.value }))} />
            ) : p.name
          ) },
          { key: 'updatedAt', header: 'Updated', className: 'w-48', render: (p: Persona) => p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '' },
          { key: 'actions', header: 'Actions', className: 'w-56', render: (p: Persona) => (
            editingId === p.id ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={()=>saveEdit(p.id)} disabled={saving}>{saving? 'Saving...' : 'Save'}</Button>
                <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={()=>beginEdit(p)}>Edit</Button>
                <Button variant="outline" className="text-red-400 border-red-500/50" onClick={()=>handleDelete(p.id)}>Delete</Button>
              </div>
            )
          ) }
        ]}
        data={personas as any}
        empty={<div className='text-slate-500'>No personas yet.</div>}
      />

      {editingId && (
        <div className="rounded border border-slate-700/60 p-3">
          <div className="text-xs text-slate-400 mb-1">Persona (plain text)</div>
          <Textarea rows={6} value={form.yaml} onChange={(e:any)=>setForm(f=>({ ...f, yaml: e.target.value }))} />
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={()=>saveEdit(editingId)} disabled={saving}>{saving? 'Saving...' : 'Save changes'}</Button>
            <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
