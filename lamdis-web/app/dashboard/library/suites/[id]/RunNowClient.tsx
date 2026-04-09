"use client";
import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/base/Button';
import Badge from '@/components/base/Badge';
import { useRouter } from 'next/navigation';
import Card from '@/components/base/Card';
import Checkbox from '@/components/base/Checkbox';

type AssistantCard = { id: string; kind: 'assistant' | 'mock'; key?: string; name: string; connectionKey?: string; requestId?: string; version?: string; persona?: string };

type ScheduleCfg = { enabled?: boolean; periodMinutes?: number };

export default function RunNowClient({ suiteId, initialSelectedKeys = [], initialSchedule }: { suiteId: string; initialSelectedKeys?: string[]; initialSchedule?: ScheduleCfg }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [results, setResults] = useState<Array<{ target: string; runId?: string; status?: string; error?: string }>>([]);
  const router = useRouter();
  const [assistants, setAssistants] = useState<AssistantCard[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialSelectedKeys || []);
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(!!initialSchedule?.enabled);
  const [periodMinutes, setPeriodMinutes] = useState<number>(Number(initialSchedule?.periodMinutes || 0));
  const [saving, setSaving] = useState(false);

  // Load assistants (integrated + mock) and show in a unified set
  useEffect(()=>{ (async ()=>{
    try {
      const a = await fetch('/api/orgs/assistants', { cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
      const m = await fetch('/api/orgs/mock-assistants', { cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
      const cards: AssistantCard[] = [];
  if (Array.isArray(a)) cards.push(...a.map((x:any)=>({ id: x.id, kind: 'assistant' as const, key: x.key, name: x.name, connectionKey: x.connectionKey, requestId: x.requestId, version: x.version })));
  if (Array.isArray(m)) cards.push(...m.map((x:any)=>({ id: x.id, kind: 'mock' as const, name: x.name, persona: x.persona, key: `mock-${String(x.id).slice(-4)}`, connectionKey: `mock_${x.id}` })));
      setAssistants(cards);
    } catch { setAssistants([]); }
  })(); }, []);

  function toggleByConnKey(key?: string){ if (!key) return; setSelectedKeys(prev => prev.includes(key) ? prev.filter(x=>x!==key) : [...prev, key]); }
  const selectedCards = useMemo(()=> assistants.filter(a => a.connectionKey && selectedKeys.includes(a.connectionKey)), [assistants, selectedKeys]);

  async function saveSelection(showSuccess = true) {
    setSaving(true); setError(null);
    try {
      const body: any = { selectedConnKeys: selectedKeys, schedule: { enabled: scheduleEnabled, periodMinutes: Number(periodMinutes||0) } };
      const r = await fetch(`/api/orgs/suites/${encodeURIComponent(suiteId)}/schedule`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) {
        const j = await r.json().catch(()=>({}));
        throw new Error(j?.error || 'Failed to save');
      }
    } catch(e:any) { setError(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function runNowSaved() {
    setBusy(true); setError(null); setResults([]);
    try {
      // Save selection if changed before triggering manual run
      await saveSelection(false);
      const r = await fetch(`/api/orgs/suites/${encodeURIComponent(suiteId)}/run-now`, { method: 'POST' });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j.error || 'Failed to start run');
      if (j.batch && Array.isArray(j.runs)) {
        const rows = j.runs.map((x:any,i:number)=>({ target: x.target || `env-${i+1}`, runId: x.runId, status: x.status }));
        setResults(rows);
        // If batch has only one run, navigate directly for consistency
        if (rows.length === 1 && rows[0].runId) {
          router.push(`/dashboard/runs/${encodeURIComponent(String(rows[0].runId))}`);
        }
      } else if (j.runId) {
        // Navigate directly to the run details to provide live progress
        router.push(`/dashboard/runs/${encodeURIComponent(String(j.runId))}`);
      } else {
        throw new Error('Unexpected response');
      }
    } catch (e:any) {
      setError(e?.message || 'Run failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {/* Assistants + Schedule */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-200">Assistants & Schedule</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={()=>saveSelection(true)} disabled={saving}>{saving? 'Saving...':'Save selection'}</Button>
            <Button onClick={runNowSaved} disabled={busy}>{busy? 'Running...':'Run now'}</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            <div className="text-xs text-slate-400">Select assistants to target (saved with the suite)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {assistants.map(a => {
                const hasConnection = !!a.connectionKey;
                const isSelected = hasConnection && selectedKeys.includes(a.connectionKey!);
                return (
                  <div key={a.id} className={`rounded-lg border ${isSelected ? 'border-fuchsia-500 bg-fuchsia-500/10' : hasConnection ? 'border-slate-800 bg-slate-900/40' : 'border-amber-700/40 bg-amber-900/10'} p-3 flex flex-col gap-1`}>
                    <div className="flex items-center gap-2">
                      {hasConnection ? (
                        <Checkbox inline checked={isSelected} onChange={()=>toggleByConnKey(a.connectionKey)} label={a.name} />
                      ) : (
                        <span className="text-slate-400 text-sm">{a.name}</span>
                      )}
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-slate-700/60 text-slate-400">{a.kind==='mock' ? 'Mock' : (a.version || 'v1')}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{a.kind==='mock' ? (a.persona ? 'Prompt-based assistant' : 'Mock assistant') : (a.requestId || '-')}</div>
                    {hasConnection ? (
                      <div className="text-[11px] text-slate-500 truncate">Connection: {a.connectionKey}</div>
                    ) : (
                      <div className="text-[11px] text-amber-400">No connection - <a href="/dashboard/assistants" className="underline hover:text-amber-300">create one</a></div>
                    )}
                  </div>
                );
              })}
              {assistants.length===0 && <div className="text-xs text-slate-500">No assistants found. Create one under Integrations - Assistants.</div>}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Schedule</div>
            <Checkbox inline checked={scheduleEnabled} onChange={(e)=>setScheduleEnabled(e.currentTarget.checked)} label="Enable scheduled runs" />
            <label className="text-xs text-slate-400">Frequency (minutes)
              <input type="number" min={0} step={1} value={periodMinutes} onChange={e=>setPeriodMinutes(Number(e.target.value||0))} className="mt-1 w-full px-3 py-2 rounded-md bg-slate-950/60 border border-slate-800/70 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-600/70" placeholder="e.g. 60" />
            </label>
            <div className="text-[11px] text-slate-500">Runs will target the saved assistants. Frequency 0 disables the timer.</div>
          </div>
        </div>
      </div>
      {error && <div className="text-rose-400 text-sm">{error}</div>}
      {results.length>0 && (
        <div className="mt-2 space-y-1">
          {results.map((r,i)=> (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
              <span className="font-mono text-[11px] text-slate-500">{r.target}</span>
              {r.status && <Badge variant={r.status==='queued' ? 'neutral' : 'info'}>{r.status}</Badge>}
              {r.runId && <a className="text-[11px] px-2 py-0.5 rounded border border-slate-700 hover:border-fuchsia-500/40" href={`/dashboard/runs/${encodeURIComponent(r.runId)}`}>Open</a>}
              {r.error && <span className="text-rose-400 text-xs">{r.error}</span>}
            </div>
          ))}
          <div className="text-[11px] text-slate-500">Each environment is started as a separate run. Open details to monitor progress.</div>
        </div>
      )}
    </div>
  );
}
