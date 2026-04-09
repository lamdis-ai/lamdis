"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import WhenBuilder from './WhenBuilder';
import { Step, mappingFromObject, objectFromMapping, replaceTokensInString, isLoop, uniqueStepId, STEP_TEMPLATES } from './helpers';

export default function StepInspector({ step, onChange, sampleInput, ctxSteps, resolvePreview, actions, actionsLoaded, onNavigateToStep, priorOutputs, requests, availableTokens, workflowInputSchema }: { step: Step; onChange: (s: Step)=>void; sampleInput: string; ctxSteps: Step[]; resolvePreview: (s: Step)=>any; actions: any[]; actionsLoaded: boolean; onNavigateToStep: (id: string)=>void; priorOutputs: any; requests: any[]; availableTokens: string[]; workflowInputSchema?: any }) {
  const isLoopStep = isLoop(step);
  const [tab, setTab] = useState<'basics'|'mappings'|'conditions'|'advanced'>(isLoopStep ? 'basics' : 'basics');
  const preview = useMemo(()=> resolvePreview(step), [step, sampleInput, ctxSteps]);
  const mappingObj = useMemo(()=>objectFromMapping(step.mapping||[]), [step.mapping]);
  const selectedOperation = step.uses === 'app.call' ? mappingObj.operation : step.uses;
  const [mapMode] = useState<'simple'|'advanced'>('simple');
  const [actionSearch, setActionSearch] = useState('');
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [internalRequests, setInternalRequests] = useState<any[] | null>(null);
  const [internalReqLoading, setInternalReqLoading] = useState(false);
  // Source of truth for app calls: organization requests plus any that we fetch here if not provided
  const effectiveActions = useMemo(()=>{
    const orgReqs = Array.isArray(requests)? requests : [];
    const fetched = Array.isArray(internalRequests)? internalRequests : [];
    // No dedupe logic needed if ids are unique; still dedupe to be safe
    const byId: Record<string, any> = {};
    [...orgReqs, ...fetched].forEach(r=>{ if (r && r.id && !byId[r.id]) byId[r.id] = r; });
    return Object.values(byId);
  }, [requests, internalRequests]);
  const effectiveLoaded = (Array.isArray(requests) || internalRequests !== null) && !internalReqLoading;
  const actionDoc = useMemo(()=> effectiveActions.find((a:any)=>a.id===selectedOperation) || null, [effectiveActions, selectedOperation]);
  // In the new model, a request IS the app call document
  const requestDoc = actionDoc;
  const inputSchema = useMemo(()=>{
    const fromAction = (actionDoc?.input_schema && typeof actionDoc.input_schema==='object') ? actionDoc.input_schema : undefined;
    const fromRequest = (requestDoc?.input_schema && typeof requestDoc.input_schema==='object') ? requestDoc.input_schema : undefined;
    return fromRequest || fromAction;
  }, [actionDoc, requestDoc]);
  useEffect(()=>{
    // Fetch organization actions if not provided by parent
    if (step.uses === 'app.call' && !Array.isArray(requests) && internalRequests === null && !internalReqLoading) {
      let cancelled = false;
      (async()=>{
        try {
          setInternalReqLoading(true);
          const r = await fetch('/api/orgs/actions?pageSize=500', { cache: 'no-store' });
          const j = await r.json().catch(()=>({}));
          if (!cancelled) {
            const list = Array.isArray(j?.actions) ? j.actions : (Array.isArray(j) ? j : []);
            setInternalRequests(list);
          }
        } catch {
          if (!cancelled) setInternalRequests([]);
        } finally { if (!cancelled) setInternalReqLoading(false); }
      })();
      return ()=>{ cancelled = true; };
    }
  }, [step.uses, requests, internalRequests, internalReqLoading]);
  const sample = useMemo(()=> safeParse(sampleInput), [sampleInput]);
  const ctxForPreview = useMemo(()=> ({ input: sample.input || sample, steps: {}, ENV: {} }), [sample]);

  // OAuth status logic (unchanged)
  const providerKey = useMemo(()=>{
    const p = (actionDoc as any)?.auth?.provider || (actionDoc as any)?.provider;
    const t = String((actionDoc as any)?.auth?.type || '').toLowerCase();
    if (!p) return undefined;
    if (!t.startsWith('oauth')) return undefined;
    return String(p);
  }, [actionDoc]);
  const oauthCacheRef = useRef<Map<string, any>>(new Map());
  const slugRef = useRef<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<{ state: 'idle'|'loading'|'ok'|'error'; data?: any; error?: string }>({ state: 'idle' });

  // Auto-convert any legacy step (uses != 'app.call') to the unified form so user always gets a picker.
  useEffect(()=>{
    if (step.uses !== 'app.call') {
      const base = objectFromMapping(step.mapping||[]);
      if (!base.operation && step.uses) base.operation = step.uses; // preserve original action id if it was one
      onChange({ ...step, uses: 'app.call', mapping: mappingFromObject(base) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.uses]);
  useEffect(()=>{
    let cancelled = false;
    async function load(){
      if (!providerKey) { setOauthStatus({ state: 'idle' }); return; }
      if (oauthCacheRef.current.has(providerKey)) { setOauthStatus({ state: 'ok', data: oauthCacheRef.current.get(providerKey) }); return; }
      setOauthStatus({ state: 'loading' });
      try {
        if (!slugRef.current) {
          try {
            const mr = await fetch('/api/me', { cache: 'no-store' });
            const mj = await mr.json().catch(()=>({}));
            slugRef.current = mj?.orgs?.[0]?.org?.slug || null;
          } catch {}
        }
        const slug = slugRef.current;
        if (!slug) throw new Error('org slug unavailable');
        const pubBase = (process.env.NEXT_PUBLIC_PUBLIC_BASE || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
        const url = `${pubBase}/public/orgs/${slug}/oauth/status/${encodeURIComponent(providerKey)}`;
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) throw new Error(j?.error || 'status fetch failed');
        if (!cancelled) { oauthCacheRef.current.set(providerKey, j); setOauthStatus({ state: 'ok', data: j }); }
      } catch (e: any) {
        if (!cancelled) setOauthStatus({ state: 'error', error: e?.message || 'failed' });
      }
    }
    load();
    return ()=>{ cancelled = true; };
  }, [providerKey]);

  function renderOAuthStatus(){
    if (!actionDoc) return <div className="text-[11px] text-slate-500">OAuth status: <span className="text-slate-400">Select a request</span></div>;
    if (!providerKey) return <div className="text-[11px] text-slate-500">Auth: <span className="text-slate-400">No auth required</span></div>;
    if (oauthStatus.state === 'loading') return <div className="text-[11px] text-slate-500">OAuth status: <span className="text-slate-400">Checking…</span></div>;
    if (oauthStatus.state === 'error') return <div className="text-[11px] text-slate-500">OAuth status: <span className="text-amber-300">Error</span></div>;
    const d = oauthStatus.data || {}; const linked = !!d.linked; const missing: string[] = Array.isArray(d.missing_scopes) ? d.missing_scopes : [];
    if (!linked) return <div className="text-[11px] text-slate-500">OAuth status: <span className="text-rose-300">Not connected</span> <a href={`/api/oauth/start?provider=${encodeURIComponent(providerKey)}`} className="underline text-slate-400 hover:text-slate-300 ml-1">Connect</a></div>;
    if (missing.length) return <div className="text-[11px] text-slate-500">OAuth status: <span className="text-amber-300">Missing scopes ({missing.slice(0,3).join(', ')}{missing.length>3?'…':''})</span></div>;
    return <div className="text-[11px] text-slate-500">OAuth status: <span className="text-emerald-300">✔ Connected</span></div>;
  }
  const variableOptions = useMemo(() => {
    const vars: { label:string; expr:string }[] = [];
    try { const props = workflowInputSchema?.properties || {}; Object.keys(props).forEach(k=>{ vars.push({ label:`Input: ${k}`, expr:`$.input.${k}` }); }); } catch {}
    const idx = ctxSteps.findIndex(s=>s.id===step.id);
    ctxSteps.slice(0, idx).forEach(s => { (s.expect_output||[]).forEach(e=>{ vars.push({ label:`Step ${s.id}: ${e.key}`, expr:`$.steps.${s.id}.output.${e.key}` }); }); });
    return vars;
  }, [workflowInputSchema, ctxSteps, step.id]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {(['basics', ...(isLoopStep? [] : ['mappings']), 'conditions', 'advanced'] as const).map(t => (
          <button key={t} onClick={()=>setTab(t as any)} className={`px-2 py-1 rounded border ${tab===t?'border-slate-500 bg-slate-800 text-slate-100':'border-slate-800 bg-slate-900 text-slate-300'} text-xs`}>
            {t==='basics' && 'Basics'}
            {t==='mappings' && 'Inputs'}
            {t==='conditions' && 'Conditions'}
            {t==='advanced' && 'Advanced'}
          </button>
        ))}
      </div>
      {tab==='basics' && (
        <div className="space-y-2">
          <div>
            <div className="text-xs text-slate-400 mb-1">Step ID</div>
            <input value={step.id} onChange={(e)=>onChange({ ...step, id: e.target.value })} className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
          </div>
            <div>
            <div className="text-xs text-slate-400 mb-1">Title</div>
            <input value={step.title || ''} onChange={(e)=>onChange({ ...step, title: e.target.value })} placeholder="Optional display title" className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
          </div>
          {!isLoopStep && (
            <div className="relative">
              <div className="text-xs text-slate-400 mb-1">Request</div>
              <div className="flex gap-2">
                <input
                  value={actionSearch}
                  onChange={(e)=>setActionSearch(e.target.value)}
                  onFocus={()=>{ setActionPickerOpen(true); setActionSearch(''); }}
                  placeholder={actionDoc?.id || 'Search requests…'}
                  className="flex-1 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100 font-mono"
                />
                <button type="button" className="text-xs rounded border border-slate-700 px-2 py-1 text-slate-200" onClick={()=>{ setActionPickerOpen(o=>!o); if (!actionPickerOpen) setActionSearch(''); }}>{actionPickerOpen? 'Hide':'Browse'}</button>
              </div>
              {actionPickerOpen && (
                <div className="absolute z-20 mt-2 w-full max-h-64 overflow-auto rounded border border-slate-700 bg-slate-900 shadow-xl">
                  <div className="p-2 border-b border-slate-800">
                    <input value={actionSearch} onChange={(e)=>setActionSearch(e.target.value)} placeholder="Filter…" className="w-full text-[12px] rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-200" />
                  </div>
                  <div className="p-1 text-[12px]">
                    {!effectiveLoaded && <div className="p-2 text-slate-400">Loading requests…</div>}
                    {effectiveLoaded && effectiveActions.length===0 && <div className="p-2 text-slate-400">No requests available.</div>}
                    {effectiveLoaded && effectiveActions.filter((a:any)=>{ const q = actionSearch.toLowerCase(); return !q || String(a.id||'').toLowerCase().includes(q) || String(a.title||a.name||'').toLowerCase().includes(q); }).map((a:any)=> (
                      <button key={a.id} type="button" onClick={()=>{ const base = objectFromMapping(step.mapping||[]); base.operation = a.id || ''; onChange({ ...step, mapping: mappingFromObject(base) }); setActionPickerOpen(false); setActionSearch(''); }} className="w-full text-left px-2 py-1 rounded hover:bg-slate-800">
                        <div className="text-slate-100 font-mono">{a.id}</div>
                        {(a.title||a.name) && <div className="text-slate-400">{a.title||a.name}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {actionDoc && (
                <div className="mt-1 text-[11px] text-slate-500">Selected Request: <span className="font-mono text-slate-300">{actionDoc.id}</span>{(actionDoc.title||actionDoc.name)? <> — {actionDoc.title||actionDoc.name}</> : null}</div>
              )}
              {!actionDoc && <div className="mt-1 text-[11px] text-slate-500">Pick a request to configure inputs.</div>}
            </div>
          )}
          {renderOAuthStatus()}
          {isLoopStep && (
            <div className="mt-2 rounded border border-slate-800 bg-slate-950/60 p-2 space-y-3">
              <div>
                <div className="text-xs text-slate-400 mb-1">Loop Items (array source)</div>
                {(() => {
                  const arrSources: { label:string; expr:string }[] = [];
                  try { const props = workflowInputSchema?.properties || {}; Object.keys(props).forEach(k=>{ if (props[k]?.type==='array') arrSources.push({ label:`Input: ${k}`, expr:`$.input.${k}`}); }); } catch {}
                  ctxSteps.forEach((s,i)=>{ if (s===step) return; if (i >= ctxSteps.findIndex(x=>x.id===step.id)) return; (s.expect_output||[]).forEach(e=>{ if (e.type==='array') arrSources.push({ label:`Step ${s.id}: ${e.key}`, expr:`$.steps.${s.id}.output.${e.key}`}); }); });
                  const mObj = objectFromMapping(step.mapping||[]); const current = mObj.items || mObj.list || mObj.values || '';
                  return (
                    <div className="space-y-1">
                      <select value={current} onChange={(e)=>{ const base = objectFromMapping(step.mapping||[]); base.items = e.target.value; onChange({ ...step, mapping: mappingFromObject(base) }); }} className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100 text-xs">
                        <option value="">Select array source…</option>
                        {arrSources.map(src => <option key={src.expr} value={src.expr}>{src.label}</option>)}
                      </select>
                      {current && !arrSources.some(s=>s.expr===current) && (<div className="text-[11px] text-amber-300">Current expression not recognized as an allowed array source.</div>)}
                      {arrSources.length===0 && <div className="text-[11px] text-slate-500">No array inputs or prior array outputs available yet.</div>}
                    </div>
                  );
                })()}
              </div>
              <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                <span>Loop Body Steps</span>
              </div>
              <div className="space-y-2">
                {(step.children||[]).map((c,i)=>(
                  <div key={c.id} className="rounded border border-slate-700 p-2 bg-slate-900/60">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-slate-500">#{i+1}</div>
                      <div className="flex-1 text-[12px] text-slate-200 font-mono">{c.id}</div>
                      <button type="button" className="text-[10px] rounded border border-slate-600 px-1.5 py-0.5 text-slate-300" onClick={()=>{ onChange({ ...step, children: (step.children||[]).filter((_,j)=>j!==i) }); }}>Remove</button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {STEP_TEMPLATES.filter(t=>t.key!=='control.loop').slice(0,6).map(t => (
                    <button key={t.key} type="button" className="text-[11px] rounded border border-slate-700 px-2 py-0.5 text-slate-200" onClick={()=>{ const childId = uniqueStepId(step.children||[], t.key.split('.').pop()||'child'); const newChild: Step = { id: childId, uses: t.key, mapping: mappingFromObject(t.defaultMapping||{}) } as any; onChange({ ...step, children: [ ...(step.children||[]), newChild ] }); }}>{t.title}</button>
                  ))}
                </div>
                {(step.children||[]).length===0 && (<div className="text-[11px] text-slate-500">Add steps that will run for each item in the list.</div>)}
              </div>
            </div>
          )}
        </div>
      )}
      {tab==='mappings' && !isLoopStep && (
        <MappingsTab step={step} onChange={onChange} mapMode={mapMode} sample={sample} ctxForPreview={ctxForPreview} priorOutputs={priorOutputs} onNavigateToStep={onNavigateToStep} actionDoc={actionDoc} variableOptions={variableOptions} inputSchema={inputSchema} requestDoc={requestDoc} resolvePreview={resolvePreview} ctxSteps={ctxSteps} availableTokens={availableTokens} />
      )}
      {tab==='conditions' && (
        <div className="space-y-2">
          <WhenBuilder value={step.when || ''} onChange={(w)=>onChange({ ...step, when: w || undefined })} onErrorChange={(v)=>onChange({ ...step, on_error: (v||undefined) as any })} onErrorValue={step.on_error} />
          <div className="text-[11px] text-slate-500">Run when: gate this step on a simple condition.</div>
        </div>
      )}
      {tab==='advanced' && (
        <AdvancedTab step={step} onChange={onChange} availableTokens={availableTokens} resolvePreview={resolvePreview} />
      )}
    </div>
  );
}

// Extracted subcomponents (unchanged logic from original for mappings & advanced)
function MappingsTab({ step, onChange, mapMode, sample, ctxForPreview, priorOutputs, onNavigateToStep, actionDoc, variableOptions, inputSchema, requestDoc, resolvePreview, ctxSteps, availableTokens }: any){
  const [mapModeState, setMapModeState] = useState(mapMode);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-200">Inputs</div>
          <div className="text-[11px] text-slate-500">Provide values for this request{requestDoc? ' (from request schema)':''}. {inputSchema ? <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Schema</span> : <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-500">Free-form</span>}</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button className={`px-2 py-0.5 rounded border ${mapModeState==='simple'?'border-slate-500 bg-slate-800 text-slate-100':'border-slate-800 bg-slate-900 text-slate-300'}`} onClick={()=>setMapModeState('simple')}>Simple</button>
        </div>
      </div>
      {mapModeState==='simple' && (
        <SchemaDrivenForm
          schema={inputSchema}
          mappingRows={step.mapping}
          onRowsChange={(rows)=>onChange({ ...step, mapping: rows })}
          sample={sample}
          onInsertToken={()=>{}}
          step={step}
          allSteps={ctxSteps}
          resolve={(expr:any)=>replaceTokensInString(String(expr ?? ''), ctxForPreview)}
          priorOutputs={priorOutputs}
          onNavigateToStep={onNavigateToStep}
          actionDoc={actionDoc}
          variableOptions={variableOptions}
        />
      )}
      <ExpectedOutputEditor step={step} onChange={onChange} availableTokens={availableTokens} resolvePreview={resolvePreview} />
    </div>
  );
}

function ExpectedOutputEditor({ step, onChange, availableTokens, resolvePreview }: any){
  return (
    <div>
      <div className="text-xs text-slate-400 mb-1">Expect Output</div>
      {(step.expect_output||[]).map((row: any, eIdx: number) => (
        <div key={eIdx} className="grid grid-cols-12 gap-2 items-center">
          <input value={row.key} onChange={e=>onChange({ ...step, expect_output: (step.expect_output||[]).map((m:any,j:number)=>j===eIdx?{...m, key:e.target.value}:m) })} placeholder="key" className="col-span-5 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
          <select value={row.type} onChange={e=>onChange({ ...step, expect_output: (step.expect_output||[]).map((m:any,j:number)=>j===eIdx?{...m, type:e.target.value as any}:m) })} className="col-span-4 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100 text-xs">
            <option>string</option><option>number</option><option>boolean</option><option>object</option><option>array</option><option>any</option>
          </select>
          <label className="col-span-2 inline-flex items-center gap-1 text-[11px] text-slate-300"><input type="checkbox" checked={!!row.optional} onChange={e=>onChange({ ...step, expect_output: (step.expect_output||[]).map((m:any,j:number)=>j===eIdx?{...m, optional:e.target.checked}:m) })} /> optional</label>
          <button type="button" onClick={()=>onChange({ ...step, expect_output: (step.expect_output||[]).filter((_:any,j:number)=>j!==eIdx) })} className="col-span-1 text-[11px] rounded border border-red-700 px-2 py-0.5 text-red-300">✕</button>
        </div>
      ))}
      <button type="button" onClick={()=>onChange({ ...step, expect_output: [...(step.expect_output||[]), { key:'', type:'string' } as any] })} className="mt-1 text-xs rounded-md bg-slate-800 px-2 py-1 text-slate-100 border border-slate-700 hover:bg-slate-700">Add Output Field</button>
      <div className="sticky bottom-0 border border-slate-800 bg-slate-950/70 rounded p-2 mt-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400">What will be sent</div>
          <button type="button" className="text-[11px] rounded border border-slate-700 px-2 py-0.5 text-slate-200" onClick={()=>{ const txt = JSON.stringify(objectFromMapping(step.mapping||[]), null, 2); navigator.clipboard?.writeText(txt).catch(()=>{}); }}>Copy</button>
        </div>
        <pre className="mt-1 max-h-48 overflow-auto text-[11px] text-slate-200">{JSON.stringify(resolvePreview(step), null, 2)}</pre>
      </div>
    </div>
  );
}

function AdvancedTab({ step, onChange, availableTokens, resolvePreview }: any){
  return (
    <div className="space-y-2">
      <div>
        <div className="text-xs text-slate-400 mb-1">Timeout (s)</div>
        <input type="number" value={String(step.timeout_s || '')} onChange={(e)=>onChange({ ...step, timeout_s: e.target.value? Number(e.target.value): undefined })} className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">Tags</div>
        <input value={(step.tags||[]).join(', ')} onChange={(e)=>onChange({ ...step, tags: e.target.value.split(',').map((s:string)=>s.trim()).filter(Boolean) })} placeholder="ops, critical" className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
      </div>
      <div className="border-t border-slate-800 pt-2">
        <div className="text-xs text-slate-400 mb-1">Output</div>
        <div className="flex items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1"><input type="radio" name={`out_${step.id}`} checked={(step.output_mode||'raw')==='raw'} onChange={()=>onChange({ ...step, output_mode:'raw', output_mapping: undefined })} /> Raw app response</label>
          <label className="inline-flex items-center gap-1"><input type="radio" name={`out_${step.id}`} checked={step.output_mode==='custom'} onChange={()=>onChange({ ...step, output_mode:'custom', output_mapping: step.output_mapping||[] })} /> Custom</label>
        </div>
        {step.output_mode==='custom' && (
          <div className="mt-2 space-y-2">
            {(step.output_mapping||[]).map((row: any, rIdx: number) => (
              <div key={rIdx} className="grid grid-cols-12 gap-2 items-start">
                <input value={row.key} onChange={e=>onChange({ ...step, output_mapping: (step.output_mapping||[]).map((m:any,j:number)=>j===rIdx?{...m, key:e.target.value}:m) })} placeholder="key" className="col-span-4 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
                <div className="col-span-7 space-y-1">
                  <div className="flex gap-2 text-[11px] text-slate-400 flex-wrap">
                    {availableTokens.map((k:string) => (
                      <button key={k} type="button" className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-200" onClick={()=>{ const tok = `{${k}}`; onChange({ ...step, output_mapping: (step.output_mapping||[]).map((m:any,j:number)=>j===rIdx?{...m, value: (m.value? m.value + tok : tok)}:m) }); }}>{`{${k}}`}</button>
                    ))}
                  </div>
                  <textarea value={row.value} onChange={e=>onChange({ ...step, output_mapping: (step.output_mapping||[]).map((m:any,j:number)=>j===rIdx?{...m, value:e.target.value}:m) })} placeholder="value or token like {name}" className="w-full h-14 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100 font-mono" />
                </div>
                <label className="col-span-1 inline-flex items-center gap-1 text-[11px] text-slate-300"><input type="checkbox" checked={!!row.isJson} onChange={e=>onChange({ ...step, output_mapping: (step.output_mapping||[]).map((m:any,j:number)=>j===rIdx?{...m, isJson:e.target.checked}:m) })} /> JSON</label>
                <button type="button" onClick={()=>onChange({ ...step, output_mapping: (step.output_mapping||[]).filter((_:any,j:number)=>j!==rIdx) })} className="col-span-12 text-[11px] rounded border border-red-700 px-2 py-0.5 text-red-300">Remove</button>
              </div>
            ))}
            <button type="button" onClick={()=>onChange({ ...step, output_mapping: [ ...(step.output_mapping||[]), { key:'', value:'' } ] })} className="text-xs rounded-md bg-slate-800 px-2 py-1 text-slate-100 border border-slate-700 hover:bg-slate-700">Add Output Field</button>
            <div className="rounded border border-slate-800 p-2 bg-slate-950/60">
              <div className="text-[11px] text-slate-400">Preview</div>
              <pre className="text-[11px] text-slate-200 max-h-40 overflow-auto">{JSON.stringify(resolvePreview({ ...step, mapping: step.output_mapping||[] } as any), null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Original schema-driven form and related helpers kept below
function SchemaDrivenForm({ schema, mappingRows, onRowsChange, sample, onInsertToken, step, allSteps, resolve, priorOutputs, onNavigateToStep, actionDoc, variableOptions }:{ schema?: any; mappingRows: any[]; onRowsChange: (rows: any[])=>void; sample: any; onInsertToken: (path: string)=>void; step: Step; allSteps: Step[]; resolve: (expr:any)=>any; priorOutputs: any; onNavigateToStep: (id:string)=>void; actionDoc: any; variableOptions: { label:string; expr:string }[] }){
  const mappingObj = useMemo(()=>objectFromMapping(mappingRows || []), [mappingRows]);
  const [showOptionals, setShowOptionals] = useState(false);
  const properties = (schema?.properties && typeof schema.properties==='object') ? schema.properties : {};
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
  const fields = Object.keys(properties);
  const [focused, setFocused] = useState<string | null>(null);
  const ordered = fields.slice().sort((a,b)=>{ const ra = required.includes(a) ? 0 : 1; const rb = required.includes(b) ? 0 : 1; if (ra!==rb) return ra-rb; return a.localeCompare(b); });
  function setField(key: string, val: any, isJson?: boolean){
    const rows = [...(mappingRows||[])];
    const idx = rows.findIndex((r:any)=>r.key===key);
    if (idx>=0) rows[idx] = { key, value: String(val ?? ''), isJson } as any; else rows.push({ key, value: String(val ?? '') } as any);
    onRowsChange(rows);
  }
  function valueFor(key: string){ return (mappingRows||[]).find((r:any)=>r.key===key)?.value || ''; }
  function exampleFor(key: string){ const ex = properties[key]?.example ?? properties[key]?.examples?.[0]; return ex!=null? String(ex):''; }
  function typeFor(key: string){ return properties[key]?.format || properties[key]?.type || 'any'; }
  function suggestFor(key: string){ const k = key.toLowerCase(); if (k.includes('email')) return "$.input.customer.email"; if (k.includes('phone')) return "$.input.customer.phone"; if (k.includes('name')) return "$.input.customer.name"; if (k.includes('summary')||k.includes('subject')) return "concat('Plumbing: ', $.input.service, ' – ', $.input.customer.name)"; if (k.includes('start')||k.includes('time')) return "$.output.start_time"; return ''; }
  return (
    <div className="space-y-2">
      {schema ? (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-slate-500">Fill required fields. Use Vars to insert available expressions.</div>
          </div>
          {ordered.filter(k=>required.includes(k)).map(k => (
            <SchemaFieldRow key={k} k={k} prop={properties[k]} required onChange={(v)=>setField(k,v)} value={valueFor(k)} example={exampleFor(k)} type={typeFor(k)} onFocus={()=>setFocused(k)} focused={focused===k} resolve={resolve} suggest={suggestFor(k)} variableOptions={variableOptions} />
          ))}
          {ordered.filter(k=>!required.includes(k)).length>0 && (
            <div className="mt-2">
              <button type="button" className="text-xs underline text-slate-300" onClick={()=>setShowOptionals(v=>!v)}>{showOptionals?'Hide':'Add more fields'}</button>
              {showOptionals && (
                <div className="mt-2 space-y-2">
                  {ordered.filter(k=>!required.includes(k)).map(k => (
                    <SchemaFieldRow key={k} k={k} prop={properties[k]} onChange={(v)=>setField(k,v)} value={valueFor(k)} example={exampleFor(k)} type={typeFor(k)} onFocus={()=>setFocused(k)} focused={focused===k} resolve={resolve} suggest={suggestFor(k)} variableOptions={variableOptions} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">No schema found for this request. Use free-form key/value mappings. Insert tokens below.</div>
          {(mappingRows||[]).map((row: any, rIdx: number) => (
            <div key={rIdx} className="grid grid-cols-12 gap-2 items-start">
              <input value={row.key} onChange={e=>onRowsChange(mappingRows.map((m:any,j:number)=>j===rIdx?{...m, key:e.target.value}:m))} placeholder="key" className="col-span-4 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
              <div className="col-span-7 space-y-1">
                <div className="flex gap-2 text-[11px] text-slate-400 flex-wrap">
                  {variableOptions.map(v => (
                    <button key={v.expr} type="button" className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-200" onClick={()=>{ const tok = v.expr; onRowsChange(mappingRows.map((m:any,j:number)=>j===rIdx?{...m, value: (m.value? m.value + tok : tok)}:m)); }}>{v.label}</button>
                  ))}
                </div>
                <textarea value={row.value} onChange={e=>onRowsChange(mappingRows.map((m:any,j:number)=>j===rIdx?{...m, value:e.target.value}:m))} placeholder="value or token like $.input.name" className="w-full h-14 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100 font-mono" />
              </div>
              <label className="col-span-1 inline-flex items-center gap-1 text-[11px] text-slate-300"><input type="checkbox" checked={!!row.isJson} onChange={e=>onRowsChange(mappingRows.map((m:any,j:number)=>j===rIdx?{...m, isJson:e.target.checked}:m))} /> JSON</label>
              <button type="button" onClick={()=>onRowsChange(mappingRows.filter((_:any,j:number)=>j!==rIdx))} className="col-span-12 text-[11px] rounded border border-red-700 px-2 py-0.5 text-red-300">Remove</button>
            </div>
          ))}
          <button type="button" onClick={()=>onRowsChange([...(mappingRows||[]), { key:'', value:'' }])} className="text-xs rounded-md bg-slate-800 px-2 py-1 text-slate-100 border border-slate-700 hover:bg-slate-700">Add Mapping</button>
        </div>
      )}
    </div>
  );
}

function SchemaFieldRow({ k, prop, required, value, example, type, onChange, onFocus, focused, resolve, suggest, variableOptions }:{ k:string; prop:any; required?:boolean; value:string; example?:string; type?:string; onChange:(v:string)=>void; onFocus:()=>void; focused:boolean; resolve:(expr:any)=>any; suggest?:string; variableOptions: { label:string; expr:string }[] }){
  const resolved = useMemo(()=> value? resolve(value): undefined, [value, resolve]);
  const typeBadge = (type||'any').toString();
  const [showSuggestion, setShowSuggestion] = useState(true);
  const needs = required && !value;
  const previewMsg = (()=>{ if (!value) return needs? 'Required' : '—'; if (type==='date-time') { const ok = resolved && !isNaN(new Date(resolved).getTime()); return ok? String(resolved): 'Type mismatch (date-time)'; } if (type==='number') return (typeof resolved==='number')? String(resolved): 'Type mismatch (number)'; return typeof resolved==='undefined'? 'Unresolved' : String(resolved); })();
  const statusOk = !!value && !String(previewMsg).startsWith('Type mismatch') && previewMsg !== '—';
  const tokensInValue: { label:string }[] = useMemo(()=>{ const matches: { label:string }[] = []; const rx = /\{([a-zA-Z0-9_\.]+)\}/g; let m: RegExpExecArray | null; const txt = value||''; while ((m = rx.exec(txt))) { matches.push({ label: m[1] }); } return matches; }, [value]);
  return (
    <div className="rounded border border-slate-800 p-2 bg-slate-950/60">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-slate-200 flex items-center gap-2">
          {required && <span className="text-rose-400">•</span>}
          <span>{k}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{typeBadge}</span>
          {example && <span className="text-[11px] text-slate-500">e.g., {example}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className={`text-[11px] px-2 py-0.5 rounded ${statusOk? 'bg-emerald-900/40 text-emerald-200' : 'bg-amber-900/40 text-amber-200'}`}>{statusOk? 'Filled' : 'Missing'}</div>
          <div className={`text-[11px] px-2 py-0.5 rounded ${previewMsg==='Required' || previewMsg.startsWith('Type mismatch')? 'bg-amber-900/40 text-amber-200' : 'bg-slate-800 text-slate-300'}`}>Preview: {previewMsg}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-12 gap-2 items-start">
        <input value={value} onChange={(e)=>onChange(e.target.value)} onFocus={onFocus} placeholder={example || 'value or token like {name}'} className="col-span-8 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100" />
        <div className="col-span-4 flex items-start gap-1">
          <VariablePicker options={variableOptions} onInsert={(expr)=>onChange((value||'') + expr)} />
        </div>
      </div>
      {tokensInValue.length>0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {tokensInValue.map((t,i)=> (
            <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
              <span>{`{${t.label}}`}</span>
            </span>
          ))}
        </div>
      )}
      {needs && showSuggestion && suggest && (
        <div className="mt-2 text-[12px] text-slate-300">Suggested mapping: <button type="button" className="underline" onClick={()=>{ onChange(suggest); setShowSuggestion(false); }}>{suggest}</button></div>
      )}
  {required && !value && <div className="mt-1 text-[11px] text-rose-300">This field is required by the request.</div>}
    </div>
  );
}

function VariablePicker({ options, onInsert }:{ options: { label:string; expr:string }[]; onInsert:(expr:string)=>void }){
  const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const filtered = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()) || o.expr.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <button type="button" onClick={()=>setOpen(o=>!o)} className="text-[11px] rounded border border-slate-700 px-2 py-0.5 text-slate-200">Vars</button>
      {open && (
        <div className="absolute z-30 mt-1 w-56 rounded border border-slate-700 bg-slate-900 shadow-xl p-2 space-y-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filter…" className="w-full text-[11px] rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-200" />
          <div className="max-h-48 overflow-auto space-y-1">
            {filtered.map(o => (
              <button key={o.expr} type="button" onClick={()=>{ onInsert(o.expr); setOpen(false); }} className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-slate-800">
                <div className="text-slate-100">{o.label}</div>
                <div className="text-slate-500 font-mono text-[10px]">{o.expr}</div>
              </button>
            ))}
            {filtered.length===0 && <div className="text-[11px] text-slate-500 px-1 py-1">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function safeParse(s: string){ try { return JSON.parse(s || '{}'); } catch { return {}; } }
