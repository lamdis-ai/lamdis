"use client";
import Table from '@/components/base/Table';
import Link from 'next/link';
import Button from '@/components/base/Button';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type Persona = { id: string; name: string };

export default function SuiteTestsTableClient({ tests, suiteId, personas }: { tests: any[]; suiteId: string; personas?: Persona[] }) {
  const router = useRouter();
  const runState = useRef<Record<string, { busy:boolean; status?:string }>>({});
  const [, setTick] = useState<number>(0);
  const personaMap = (personas||[]).reduce<Record<string,string>>((acc, p)=>{ acc[p.id] = p.name; return acc; }, {});

  async function runOne(testId: string) {
    runState.current[testId] = { busy: true };
    setTick(x=>x+1);
    try {
      const r = await fetch('/api/ci/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suiteId, tests: [testId] }) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j.runId) throw new Error(j.error || 'Failed to start run');
      // Immediately route to run details for real-time UI
      const runId = String(j.runId);
      router.push(`/dashboard/runs/${encodeURIComponent(runId)}`);
      // Leave local state as busy until navigation
    } catch (e) {
      runState.current[testId] = { busy: false, status: 'error' };
      setTick(x=>x+1);
    }
  }

  async function handleDelete(id: string) {
    const ok = typeof window !== 'undefined' ? window.confirm('Delete this test? This cannot be undone.') : true;
    if (!ok) return;
    try {
      const res = await fetch(`/api/orgs/suites/${encodeURIComponent(suiteId)}/tests/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(()=>({}));
        throw new Error(j?.error || 'Failed to delete');
      }
      router.refresh();
    } catch (e) {
      // Optional: surface toast; minimal fallback
      console.error(e);
      if (typeof window !== 'undefined') alert('Failed to delete test');
    }
  }
  return (
    <Table
      columns={[
        { key: 'name', header: 'Name' },
        { key: 'persona', header: 'Persona', className: 'w-48', render: (t:any)=> t.personaId ? (personaMap[t.personaId] || '-') : '-' },
        { key: 'createdAt', header: 'Created', render: (t:any)=> new Date(t.createdAt).toLocaleString(), className: 'w-48' },
        { key: 'actions', header: 'Actions', className: 'w-64', render: (t:any)=> (
          <div className="flex gap-2">
            <Button variant="neutral" onClick={()=>runOne(String(t.id))}>
              {runState.current[String(t.id)]?.busy ? 'Running...' : 'Run'}
            </Button>
            {runState.current[String(t.id)]?.status && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${runState.current[String(t.id)]?.status==='passed' ? 'text-emerald-300 border-emerald-500/40' : 'text-rose-300 border-rose-500/40'}`}>
                {runState.current[String(t.id)]?.status}
              </span>
            )}
            <Link href={`/dashboard/library/suites/${encodeURIComponent(suiteId)}/tests/${encodeURIComponent(t.id)}`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Button variant="outline" className="text-red-400 border-red-500/50" onClick={()=>handleDelete(String(t.id))}>Delete</Button>
          </div>
        ) },
      ]}
      data={tests as any}
      empty={<div className='text-slate-500'>No tests yet.</div>}
    />
  );
}
