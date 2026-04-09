"use client";
import { useEffect, useState, useMemo } from 'react';
import Modal from '../base/Modal';
import Textarea from '../base/Textarea';
import Input from '../base/Input';
import Button from '../base/Button';

interface ActionRef { key: string; title?: string; description?: string; prompt?: string; }
interface ActionPack { key: string; title: string; description?: string; category?: string; industry?: string|null; tags?: string[]; version?: string; status: string; visibility: string; actions: ActionRef[]; }

interface WizardProps { open: boolean; onClose: () => void; onApplied?: (packKey: string) => void; initialPackKey?: string | null; }

/**
 * ActionPackWizard
 * Steps:
 * 1. Select Pack (list + search)
 * 2. Provide Context (per action optional prompts -> user responses)
 * 3. Review & Apply (calls apply route and navigates /dashboard/manifest)
 */
export default function ActionPackWizard({ open, onClose, onApplied, initialPackKey }: WizardProps) {
  const [packs, setPacks] = useState<ActionPack[]|null>(null);
  const [selected, setSelected] = useState<ActionPack|null>(null);
  const [step, setStep] = useState(1); // 1=select pack, 2=per-action context, 3=review
  const [search, setSearch] = useState('');
  const [answers, setAnswers] = useState<Record<string,string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string| null>(null);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesMap, setTemplatesMap] = useState<Record<string,{title?:string;description?:string}>>({});

  useEffect(()=>{ if (open) { (async()=>{ try { setLoadingPacks(true); const r = await fetch('/api/action-packs'); const j = await r.json(); const list: ActionPack[] = Array.isArray(j.packs)? (j.packs as ActionPack[]).filter((p: ActionPack)=>p.status==='active' && p.visibility==='public'): []; setPacks(list); if (initialPackKey) { const found = list.find((p: ActionPack)=>p.key===initialPackKey); if (found) { setSelected(found); setStep(2); setCurrentIdx(0); } } } catch { setPacks([]); } finally { setLoadingPacks(false); } })(); } }, [open, initialPackKey]);
  useEffect(()=>{ if(!open){ setStep(1); setSelected(null); setSearch(''); setAnswers({}); setError(null); setSkipped(new Set()); setCurrentIdx(0);} },[open]);
  useEffect(()=>{ if(selected && step===2){ (async()=>{ try { setLoadingTemplates(true); const keys = selected.actions.map(a=>a.key);
        const fetched: Record<string,{title?:string;description?:string}> = {}; 
        for (const k of keys){ try { const r = await fetch('/api/action-library?q='+encodeURIComponent(k)); if(r.ok){ const j= await r.json(); const t=(j.templates||[]).find((t:any)=>t.key===k); if(t){ fetched[k]={ title: t.title, description: t.description }; } } } catch {} }
        setTemplatesMap(m=>({...m,...fetched}));
      } finally { setLoadingTemplates(false);} })(); } },[selected, step]);

  const filtered = useMemo(()=>{
    if (!packs) return [] as ActionPack[];
    if (!search.trim()) return packs;
    const q = search.toLowerCase();
    return packs.filter(p=> [p.key,p.title,p.description,(p.tags||[]).join(' ')].some(v=> (v||'').toLowerCase().includes(q)) );
  },[packs,search]);

  function proceed() { if (selected) { setStep(2); setCurrentIdx(0); } }
  function back() { if (step===2 && !initialPackKey) setStep(1); else if (step===3) setStep(2); }

  function nextAction() {
    if (!selected) return;
    if (currentIdx < selected.actions.length - 1) {
      setCurrentIdx(i=>i+1);
    } else {
      setStep(3);
    }
  }
  function prevAction() {
    if (currentIdx > 0) setCurrentIdx(i=>i-1); else if (!initialPackKey) setStep(1);
  }
  function skipAction() {
    if (!selected) return;
    const act = selected.actions[currentIdx];
    setSkipped(s => { const n = new Set(s); n.add(act.key); return n; });
    nextAction();
  }
  function saveAnswer(val: string) {
    if (!selected) return;
    const act = selected.actions[currentIdx];
    setAnswers(a => ({ ...a, [act.key]: val }));
  }

  async function applyPack() {
    if (!selected) return;
    setApplying(true); setError(null);
    try {
  const res = await fetch('/api/action-packs/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packKey: selected.key, context: answers, skipped: Array.from(skipped) }) });
      const text = await res.text();
      let payload: any = null; try { payload = text? JSON.parse(text): {}; } catch {}
      if (!res.ok) { setError(payload?.error || text || 'Failed'); return; }
      const created: string[] = Array.isArray(payload?.created)? payload.created: [];
      const existing: string[] = Array.isArray(payload?.existing)? payload.existing: [];
      const missing: string[] = Array.isArray(payload?.missing)? payload.missing: [];
      const skippedList: string[] = Array.isArray(payload?.skipped)? payload.skipped: [];
      const reEnabled: string[] = Array.isArray(payload?.reEnabled)? payload.reEnabled: [];
      const placeholders: string[] = Array.isArray(payload?.placeholders)? payload.placeholders: [];
      if (created.length === 0 && reEnabled.length === 0 && placeholders.length === 0) {
        // Stay on review step and show diagnostic summary instead of redirecting silently
        const parts: string[] = [];
        if (existing.length) parts.push(`${existing.length} already existed`);
        if (reEnabled.length) parts.push(`${reEnabled.length} re-enabled`);
        if (placeholders.length) parts.push(`${placeholders.length} upgraded placeholders`);
        if (missing.length) parts.push(`${missing.length} missing templates`);
        if (skippedList.length) parts.push(`${skippedList.length} skipped`);
        setError(parts.length ? 'No new actions created: '+parts.join(', ') : 'No new actions created.');
        return;
      }
      onApplied?.(selected.key);
      window.location.href = '/dashboard/manifest?fromPack='+encodeURIComponent(selected.key)+'&created='+encodeURIComponent(String(created.length));
    } catch (e:any) { setError(e.message||'Failed'); } finally { setApplying(false); }
  }

  const totalActions = selected?.actions.length || 0;
  const currentAction = selected && totalActions>0 ? selected.actions[currentIdx] : null;
  const currentTemplate = currentAction ? templatesMap[currentAction.key] : undefined;
  const progressPct = step===2 && totalActions>0 ? ((currentIdx)/totalActions)*100 : step===3 ? 100 : 0;

  return (
    <Modal open={open} onClose={onClose} title="Action Pack Wizard" size="2xl" variant="dark" footer={(
      <div className="flex justify-between w-full">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {step===2 && selected && (
            <span>Action {currentIdx+1} / {totalActions}</span>
          )}
          {step!==2 && <span>Step {step} / 3</span>}
          {error && <span className="text-rose-400">{error}</span>}
        </div>
        <div className="flex gap-2">
          {step>1 && (
            <Button
              variant="ghost"
              onClick={() => {
                if (step===2) {
                  if (currentIdx>0) prevAction(); else back();
                } else { back(); }
              }}
              className="px-3 py-2 text-sm"
            >Back</Button>
          )}
          <Button variant="ghost" onClick={onClose} className="px-3 py-2 text-sm">Close</Button>
          {step===1 && <Button disabled={!selected} onClick={proceed} className="px-4 py-2 text-sm disabled:opacity-40">Continue</Button>}
          {step===2 && <>
            <Button variant="ghost" onClick={skipAction} className="px-3 py-2 text-sm">Skip</Button>
            <Button onClick={nextAction} className="px-4 py-2 text-sm">{currentIdx === totalActions-1 ? 'Review' : 'Next'}</Button>
          </>}
          {step===3 && <Button disabled={applying} onClick={applyPack} className="px-4 py-2 text-sm">{applying?'Applying…':'Apply Pack'}</Button>}
        </div>
      </div>
    )}>
      <div className="space-y-8">
        {/* Progress Bar */}
        {step>=2 && (
          <div className="h-1 w-full rounded bg-slate-800/70 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-fuchsia-600 to-sky-600 transition-all" style={{ width: progressPct+'%' }} />
          </div>
        )}

        {/* Step 1: Pack Selection (hidden if auto-selected) */}
        {step===1 && !initialPackKey && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-72 relative">
                <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search packs…" className="pr-8" />
                {search && <button type="button" onClick={()=>setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-200">Clear</button>}
              </div>
              <div className="text-xs text-slate-500">{loadingPacks ? 'Loading…' : packs? filtered.length+' result'+(filtered.length===1?'':'s'): '—'}</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-h-[50vh] overflow-y-auto pr-1">
              {filtered.map(p=> (
                <button key={p.key} onClick={()=>setSelected(p)} className={`text-left p-4 rounded-lg border transition-colors ${selected?.key===p.key? 'border-fuchsia-500/70 bg-fuchsia-500/10':'border-slate-800/70 hover:border-slate-700/70 bg-slate-900/40'}`}>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1 flex justify-between"><span>{p.category||'Uncategorized'}</span><span>{p.industry||''}</span></div>
                  <div className="font-semibold text-slate-100">{p.title}</div>
                  <p className="text-sm text-slate-300 line-clamp-3 mt-2">{p.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(p.tags||[]).slice(0,5).map(t=> <span key={t} className="px-2 py-0.5 rounded bg-slate-800/70 text-[10px] text-slate-300">{t}</span>)}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">{p.actions.length} action{p.actions.length===1?'':'s'}</div>
                </button>
              ))}
              {packs && filtered.length===0 && <div className="col-span-full text-center text-sm text-slate-500 py-10">No packs match your search.</div>}
              {loadingPacks && !packs && <div className="col-span-full text-center text-sm text-slate-500 py-10">Loading packs…</div>}
            </div>
          </div>
        )}

        {/* Step 2: Per-action context (one by one) */}
        {step===2 && selected && currentAction && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Configure Actions: {selected.title}</h3>
              <p className="text-sm text-slate-400 mt-1">Provide (or skip) optional context. You can revisit later in the Manifest.</p>
            </div>
            <div className="space-y-5">
              <div className="p-5 rounded-lg border border-slate-800/70 bg-slate-900/40 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-100 leading-snug">{currentTemplate?.title || currentAction.title || currentAction.key}</div>
                    {(currentTemplate?.description || currentAction.description) && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{currentTemplate?.description || currentAction.description}</p>}
                    <div className="mt-1 text-[10px] font-mono text-slate-600">{currentAction.key}</div>
                  </div>
                </div>
                {currentAction.prompt && <p className="text-[11px] text-slate-500 italic">Hint: {currentAction.prompt}</p>}
                <Textarea value={answers[currentAction.key]||''} onChange={e=>saveAnswer(e.target.value)} placeholder={currentTemplate?.description || currentAction.description || 'Optional context'} className="h-36" />
                <div className="flex items-center justify-end text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                  <span>{currentIdx+1} of {totalActions}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step===3 && selected && (
          <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-1">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Review & Apply</h3>
              <p className="text-sm text-slate-400 mt-1">Summary of actions to be created. Skipped actions are noted; you can configure them later.</p>
            </div>
            <div className="space-y-4">
              {selected.actions.map(a=> {
                const skippedFlag = skipped.has(a.key);
                const hasContext = Boolean(answers[a.key]);
                return (
                  <div key={a.key} className={`rounded border p-3 text-xs space-y-1 ${skippedFlag? 'border-slate-800/50 bg-slate-900/30 opacity-60':'border-slate-800/70 bg-slate-900/40'}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-fuchsia-300/90">{a.key}</span>
                      <span className="text-slate-300 font-medium">{a.title || a.key}</span>
                      {skippedFlag && <span className="ml-auto px-2 py-0.5 rounded bg-slate-800/70 text-[10px] text-slate-400">Skipped</span>}
                      {!skippedFlag && hasContext && <span className="ml-auto px-2 py-0.5 rounded bg-sky-600/30 text-[10px] text-sky-300">Context</span>}
                    </div>
                    {a.description && <div className="text-slate-400">{a.description}</div>}
                    {hasContext && !skippedFlag && <div className="text-slate-300"><span className="text-slate-500">Context:</span> {answers[a.key]}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
