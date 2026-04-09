"use client";
import { useState } from 'react';
import Modal from '@/components/base/Modal';
import Input from '@/components/base/Input';
import Textarea from '@/components/base/Textarea';
import Button from '@/components/base/Button';
import { useRouter } from 'next/navigation';

export default function CreateSuiteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setName(''); setDescription(''); setError(null); };

  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/orgs/suites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: description.trim() }) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j?._id) throw new Error(j?.error || 'Failed to create suite');
      onClose();
      reset();
      router.push(`/dashboard/library/suites/${encodeURIComponent(String(j._id))}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to create suite');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={()=>{ onClose(); setTimeout(reset, 200); }} title="Create Test Suite" size="lg">
      <div className="space-y-4">
        <div>
          <div className="text-xs text-slate-400">Name</div>
          <Input value={name} onChange={e=>setName(e.target.value)} placeholder="My First Suite" autoFocus />
        </div>
        <div>
          <div className="text-xs text-slate-400">Description (optional)</div>
          <Textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short description" rows={3} />
        </div>
        {error && <div className="text-xs text-rose-400">{error}</div>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={()=>{ onClose(); reset(); }} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create suite'}</Button>
        </div>
      </div>
    </Modal>
  );
}
