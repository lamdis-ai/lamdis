"use client";
import { useEffect, useMemo, useState } from 'react';
import CodeNoCodeToggle from '@/components/base/CodeNoCodeToggle';
import Input from '@/components/base/Input';
import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import Library from './Library';
import Canvas from './Canvas';
import Inspector from './Inspector';
import { FiCode, FiPlay, FiLogOut } from 'react-icons/fi';
import {
  Step,
  StepTemplate,
  MappingRow,
  ExpectRow,
  mappingFromObject,
  rowsFromExpect,
  objectFromMapping,
  expectFromRows,
  evalWhen,
  resolveTokensInObject,
  safeParse,
  uniqueStepId,
} from './helpers';

export default function WorkflowBuilder({ initial, onSaved }: { initial: any; onSaved?: (wf: any)=>void }) {
  const [id, setId] = useState<string>(initial?.id || '');
  const [name, setName] = useState<string>(initial?.name || '');
  // Track whether the id (API name) is user-managed. If editing existing workflow keep stable.
  const [idManuallySet] = useState<boolean>(!!initial?.id);
  const [description, setDescription] = useState<string>(initial?.description || '');

  const initialSchemaStr = useMemo(() => {
    try {
      const obj = initial?.definition?.input_schema;
      return obj && typeof obj === 'object' ? JSON.stringify(obj, null, 2) : '';
    } catch { return ''; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [inputSchemaText, setInputSchemaText] = useState<string>(initialSchemaStr);

  const initSteps: Step[] = (initial?.definition?.steps || []).map((s: any) => ({
    id: s.id || '',
    title: s.title || undefined,
    uses: s.uses || '',
    when: s.when || '',
    on_error: s.on_error || undefined,
    mapping: mappingFromObject(s.mapping || {}),
    expect_output: rowsFromExpect(s.expect_output) || undefined,
    timeout_s: s.timeout_s || undefined,
    idempotency_key: s.idempotency_key || undefined,
    tags: Array.isArray(s.tags) ? s.tags : undefined,
  }));
  const [steps, setSteps] = useState<Step[]>(initSteps);
  const [mode, setMode] = useState<'wait-for'|'after-effect'>(initial?.definition?.policy?.mode === 'after-effect' ? 'after-effect' : 'wait-for');
  const initialOutputSchemaStr = useMemo(() => {
    try { const obj = initial?.definition?.output_schema; return obj && typeof obj==='object'? JSON.stringify(obj, null, 2): ''; } catch { return ''; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [outputSchemaText, setOutputSchemaText] = useState<string>(initialOutputSchemaStr);
  const [wfOutputKind, setWfOutputKind] = useState<'from-step'|'static'>(initial?.definition?.output?.mode === 'static' ? 'static' : 'from-step');
  const [wfOutputStepId, setWfOutputStepId] = useState<string>(initial?.definition?.output?.step_id || '');
  const [wfOutputPath, setWfOutputPath] = useState<string>(initial?.definition?.output?.path || '');
  const [wfOutputStaticText, setWfOutputStaticText] = useState<string>(initial?.definition?.output?.body ? JSON.stringify(initial?.definition?.output?.body, null, 2) : '{"ok": true}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|undefined>();
  const [notice, setNotice] = useState<string|undefined>();
  const [runInput, setRunInput] = useState<string>('{}');
  const [status, setStatus] = useState<'draft'|'published'>('draft');
  const [version] = useState<string>('v1');
  const [selected, setSelected] = useState<number>(steps.length ? 0 : -1);
  const [selectedChild, setSelectedChild] = useState<{ parent: number; index: number } | null>(null);
  const [dryRun, setDryRun] = useState<{ stepIndex: number; status: 'passed'|'skipped'|'failed'; output?: any; error?: string }[]|null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [actionsLoaded, setActionsLoaded] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  // Separate modal: input schema vs test inputs
  const [showInputSchemaModal, setShowInputSchemaModal] = useState(false);
  const [showTestInputsModal, setShowTestInputsModal] = useState(false);
  const [showOutputsModal, setShowOutputsModal] = useState(false);
  const [libCollapsed, setLibCollapsed] = useState<boolean>(false);
  useEffect(()=>{ try { const v = localStorage.getItem('wf.library.collapsed'); if (v!=null) setLibCollapsed(v==='1'); } catch {} }, []);
  useEffect(()=>{ try { localStorage.setItem('wf.library.collapsed', libCollapsed? '1':'0'); } catch {} }, [libCollapsed]);

  // Load actions/requests
  useEffect(() => {
    let active = true;
    (async()=>{
      try {
        const res = await fetch('/api/orgs/actions', { cache: 'no-store' });
        const data = await res.json().catch(()=>({}));
        if (!active) return;
        const arr = Array.isArray(data?.actions) ? data.actions : [];
        setActions(arr);
        // Also set requests to the same array since Request model was merged into Action
        setRequests(arr);
      } finally { 
        if (active) setActionsLoaded(true); 
        if (active) setRequestsLoaded(true);
      }
    })();
    return ()=>{ active=false; };
  }, []);

  function removeStep(idx: number) {
    setSteps(s => s.filter((_, i) => i !== idx));
    setSelected(p => (p === idx ? -1 : (p > idx ? p-1 : p)));
    setSelectedChild(c => (c && c.parent===idx) ? null : c ? ({ parent: c.parent>idx? c.parent-1 : c.parent, index: c.index }) : null);
  }
  function moveStep(idx: number, dir: -1|1) {
    setSteps(s => {
      const n = [...s];
      const j = idx + dir;
      if (j < 0 || j >= n.length) return n;
      const tmp = n[idx]; n[idx] = n[j]; n[j] = tmp; return n;
    });
    setSelected(i => (i === idx ? idx+dir : i === idx+dir ? idx : i));
  }

  // Drag & drop from library
  function onAddTemplate(tmpl: StepTemplate, insertIndex?: number, opts?: { placeholder?: boolean }){
    const baseId = tmpl.key.split('.').pop() || 'step';
    const newStep: Step = {
      id: uniqueStepId(steps, baseId),
      title: tmpl.title,
      // For loop we always set uses immediately; for others placeholder leaves uses blank
      uses: (tmpl.key==='control.loop') ? tmpl.key : (opts?.placeholder ? '' : tmpl.key),
      mapping: (tmpl.key==='control.loop') ? mappingFromObject(tmpl.defaultMapping||{}) : (opts?.placeholder ? [] : mappingFromObject(tmpl.defaultMapping || {})),
    } as any;
    setSteps(prev => {
      const n = [...prev];
      const idx = (insertIndex ?? prev.length);
      n.splice(idx, 0, newStep);
      return n;
    });
    setSelected((insertIndex ?? steps.length));
    setSelectedChild(null);
  }
  function onDropTemplateRaw(raw: string, insertIndex?: number){
    try {
      const tmpl: StepTemplate = JSON.parse(raw);
      // Drag from Library should create an ideation placeholder (no auto-selected action)
      onAddTemplate(tmpl, insertIndex, { placeholder: true });
    } catch {}
  }
  function onDropTemplateNestedRaw(raw: string, parentIndex: number){
    try {
      const tmpl: StepTemplate = JSON.parse(raw);
      setSteps(prev => prev.map((s,i)=>{
        if (i!==parentIndex) return s;
        // only allow nesting under control.loop
        if (s.uses !== 'control.loop') return s;
        const baseId = tmpl.key.split('.').pop() || 'step';
        const childId = uniqueStepId(s.children||[], baseId);
        const newChild: Step = { id: childId, title: tmpl.title, uses: tmpl.key, mapping: mappingFromObject(tmpl.defaultMapping||{}) } as any;
        return { ...s, children: [...(s.children||[]), newChild] };
      }));
      setSelected(parentIndex); setSelectedChild({ parent: parentIndex, index: (steps[parentIndex]?.children?.length || 0) });
    } catch {}
  }
  function onAddNestedTemplate(tmpl: StepTemplate, parentIndex: number){
    setSteps(prev => prev.map((s,i)=>{
      if (i!==parentIndex) return s;
      if (s.uses !== 'control.loop') return s;
      const baseId = tmpl.key.split('.').pop() || 'step';
      const childId = uniqueStepId(s.children||[], baseId);
      const newChild: Step = { id: childId, title: tmpl.title, uses: tmpl.key, mapping: mappingFromObject(tmpl.defaultMapping||{}) } as any;
      return { ...s, children: [...(s.children||[]), newChild] };
    }));
    setSelected(parentIndex);
    setSelectedChild({ parent: parentIndex, index: (steps[parentIndex]?.children?.length || 0) });
  }

  function onMoveChild(parentIdx: number, childIdx: number, dir: -1|1){
    setSteps(prev => prev.map((s,i)=>{
      if (i!==parentIdx) return s;
      const kids = [...(s.children||[])];
      const j = childIdx + dir;
      if (j < 0 || j >= kids.length) return s;
      const tmp = kids[childIdx]; kids[childIdx] = kids[j]; kids[j] = tmp;
      return { ...s, children: kids };
    }));
    setSelectedChild(c => (c && c.parent===parentIdx ? { parent: parentIdx, index: Math.min(Math.max(c.index + dir,0), (steps[parentIdx]?.children?.length||1)-1) } : c));
  }
  function onRemoveChild(parentIdx: number, childIdx: number){
    setSteps(prev => prev.map((s,i)=>{
      if (i!==parentIdx) return s;
      const kids = (s.children||[]).filter((_,k)=>k!==childIdx);
      return { ...s, children: kids };
    }));
    setSelectedChild(c => {
      if (!c || c.parent!==parentIdx) return c;
      if (childIdx === c.index) return null;
      if (childIdx < c.index) return { parent: parentIdx, index: c.index-1 };
      return c;
    });
  }

  const workflowInputSchema = useMemo(() => {
    try { const obj = inputSchemaText ? JSON.parse(inputSchemaText) : undefined; return (obj && typeof obj === 'object') ? obj : undefined; } catch { return undefined; }
  }, [inputSchemaText]);
  const workflowOutputSchema = useMemo(() => {
    try { const obj = outputSchemaText ? JSON.parse(outputSchemaText) : undefined; return (obj && typeof obj === 'object') ? obj : undefined; } catch { return undefined; }
  }, [outputSchemaText]);

  const preview = useMemo(() => {
    const def = {
      policy: { mode },
      ...(workflowInputSchema ? { input_schema: workflowInputSchema } : {}),
      ...(workflowOutputSchema ? { output_schema: workflowOutputSchema } : {}),
      output: (wfOutputKind==='static'
        ? { mode: 'static', body: safeParse(wfOutputStaticText) }
        : (wfOutputStepId ? { mode: 'from-step', step_id: wfOutputStepId, ...(wfOutputPath? { path: wfOutputPath }: {}) } : undefined)
      ),
      steps: steps.map(st => ({
        id: st.id,
        ...(st.title ? { title: st.title } : {}),
        uses: st.uses,
        ...(st.when ? { when: st.when } : {}),
        ...(st.on_error ? { on_error: st.on_error } : {}),
        mapping: objectFromMapping(st.mapping || []),
        ...(st.expect_output && st.expect_output.length ? { expect_output: expectFromRows(st.expect_output) } : {}),
        ...(st.timeout_s ? { timeout_s: st.timeout_s } : {}),
        ...(st.tags && st.tags.length ? { tags: st.tags } : {}),
        ...(st.output_mode==='custom' && st.output_mapping && st.output_mapping.length ? { output: objectFromMapping(st.output_mapping) } : {}),
        ...(st.children && st.children.length ? { children: st.children.map(ch => ({
          id: ch.id,
          ...(ch.title ? { title: ch.title } : {}),
          uses: ch.uses,
          ...(ch.when ? { when: ch.when } : {}),
          ...(ch.on_error ? { on_error: ch.on_error } : {}),
          mapping: objectFromMapping(ch.mapping || []),
          ...(ch.expect_output && ch.expect_output.length ? { expect_output: expectFromRows(ch.expect_output) } : {}),
          ...(ch.timeout_s ? { timeout_s: ch.timeout_s } : {}),
          ...(ch.tags && ch.tags.length ? { tags: ch.tags } : {}),
          ...(ch.output_mode==='custom' && ch.output_mapping && ch.output_mapping.length ? { output: objectFromMapping(ch.output_mapping) } : {}),
        })) } : {})
      }))
    };
    return {
      id,
      name,
      description,
      definition: def,
      status,
      version,
    };
  }, [id, name, description, steps, workflowInputSchema, workflowOutputSchema, wfOutputKind, wfOutputStepId, wfOutputPath, wfOutputStaticText, mode, status, version]);

  const missingRequiredIssues = useMemo(() => {
    if (!actionsLoaded) return [] as string[];
    const issues: string[] = [];
    steps.forEach((st, i) => {
      const doc = actions.find((a:any)=>a.id===st.uses);
      // Actions now have input_schema directly (Request model was merged into Action)
      const schema = doc?.input_schema;
      if (!schema || typeof schema !== 'object') return;
      const required: string[] = Array.isArray(schema.required) ? schema.required : [];
      if (!required.length) return;
      const obj = objectFromMapping(st.mapping || []);
      const missing = required.filter((k)=>{
        const v = obj?.[k];
        return v == null || v === '';
      });
      if (missing.length) issues.push(`Step #${i+1} (${st.id}): Missing required fields: ${missing.join(', ')}`);
    });
    return issues;
  }, [steps, actions, actionsLoaded]);

  async function onSave() {
    try {
      setSaving(true); setError(undefined);
      const resp = await fetch('/api/orgs/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: preview }) });
      const json = await resp.json().catch(()=>null);
      if (!resp.ok) throw new Error(json?.error || 'Save failed');
      onSaved?.(json?.workflow || preview);
      // optional: navigate to list after save when publishing
      const effectiveStatus = (preview as any).status || status;
      if (effectiveStatus === 'published') {
        setNotice('Published successfully. Redirecting…');
        try { window.location.href = '/dashboard/workflows'; } catch {}
      } else {
        setNotice('Saved as draft.');
        setTimeout(()=>setNotice(undefined), 2500);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onRun() {
    try {
      setSaving(true); setError(undefined);
      const input = JSON.parse(runInput || '{}');
      const resp = await fetch(`/api/orgs/workflows/${encodeURIComponent(id)}/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
      const json = await resp.json().catch(()=>null);
      if (!resp.ok) throw new Error(json?.error || 'Run failed');
      // Navigate to specific run detail if available
      const runId = (json && (json.runId || json.id || json._id)) || '';
      const target = runId ? `/dashboard/activity/runs/${encodeURIComponent(runId)}` : '/dashboard/activity/runs';
      try { window.location.href = target; } catch {}
    } catch (e: any) {
      setError(e?.message || 'Failed to run');
    } finally {
      setSaving(false);
    }
  }

  function loadTemplate() {
    const tmpl: Step[] = [
      { id: 'lookup_customer', title:'Lookup Customer', uses: 'app.call', mapping: mappingFromObject({ operation: 'find_contact', phone: '$.input.customer.phone', email: '$.input.customer.email' }), on_error: 'continue', expect_output: rowsFromExpect({ exists: 'boolean', contact_id: 'string?', url: 'string?' }) },
      { id: 'create_calendar', title:'Create Calendar', uses: 'app.create_appointment', mapping: mappingFromObject({ title: "concat('Plumbing: ', $.input.service, ' - ', $.input.customer.name)", start: '$.output.start_time', end: 'plusMinutes($.output.start_time, 90)', location: '$.input.address', description: "concat('Booked via assistant. ', coalesce($.steps.lookup_customer.output.url,''))" }), on_error: 'retry' },
      { id: 'text_owner', title:'Notify (SMS)', uses: 'notify.sms', mapping: mappingFromObject({ to: '${ENV.OWNER_PHONE}', body: "concat('New appt ', fmtTime($.output.start_time), ' - ', $.input.customer.name, ' (', $.input.customer.phone, ')')" }) },
      { id: 'crm_task_existing', title:'CRM Task (Contact)', uses: 'app.update_record', when: '$.steps.lookup_customer.output.exists', mapping: mappingFromObject({ type: 'Contact', id: '$.steps.lookup_customer.output.contact_id', subject: 'Plumbing appointment', due: '$.output.start_time', notes: "concat('Returning customer. Event created')" }) },
      { id: 'email_returning', title:'Email (Returning)', uses: 'notify.email', when: '$.steps.lookup_customer.output.exists', mapping: mappingFromObject({ to: '$.input.customer.email', subject: 'Welcome back', body: "concat('Hi ', $.input.customer.name, ', your appointment is set for ', fmtTime($.output.start_time))" }) },
      { id: 'crm_upsert_lead_new', title:'CRM Upsert Lead', uses: 'app.create_record', when: 'not($.steps.lookup_customer.output.exists)', mapping: mappingFromObject({ type: 'Lead', data: { full_name: '$.input.customer.name', phone: '$.input.customer.phone', email: '$.input.customer.email', notes: '$.input.notes' } }), expect_output: rowsFromExpect({ lead_id: 'string', url: 'string?' }) },
      { id: 'crm_task_new', title:'CRM Task (Lead)', uses: 'app.update_record', when: 'not($.steps.lookup_customer.output.exists)', mapping: mappingFromObject({ type: 'Lead', id: '$.steps.crm_upsert_lead_new.output.lead_id', subject: 'New lead: booked appointment', due: '$.output.start_time', notes: 'New customer. Follow up.' }) },
      { id: 'email_new', title:'Email (New)', uses: 'notify.email', when: 'not($.steps.lookup_customer.output.exists)', mapping: mappingFromObject({ to: '$.input.customer.email', subject: 'Thanks for booking', body: "concat('Hi ', $.input.customer.name, ', your appointment is set for ', fmtTime($.output.start_time))" }) },
    ];
    setId('booking_flow');
    setName('Appointment Booking Flow');
    setDescription('Handles returning vs new customers and follow-ups.');
    setSteps(tmpl);
    setSelected(0);
  }

  async function onDryRun() {
    setDryRun(null);
    let sample: any = {}; try { sample = JSON.parse(runInput || '{}'); } catch {}
    const results: { stepIndex: number; status: 'passed'|'skipped'|'failed'; output?: any; error?: string }[] = [];
    const ctx: any = { input: sample, output: sample.output || {}, steps: {}, ENV: {} };
    for (let i=0;i<steps.length;i++) {
      const st = steps[i];
      const canRun = evalWhen(st.when, ctx);
      if (!canRun) { results.push({ stepIndex: i, status: 'skipped' }); continue; }
      try {
        const payload = objectFromMapping(st.mapping || []);
        const resolved = resolveTokensInObject(payload, ctx);
        const out = { ...resolved };
        ctx.steps[st.id] = { output: out };
        results.push({ stepIndex: i, status: 'passed', output: out });
      } catch (e: any) {
        results.push({ stepIndex: i, status: 'failed', error: e?.message || 'eval_failed' });
        if (st.on_error !== 'continue' && st.on_error !== 'retry') break;
      }
    }
    setDryRun(results);
  }

  const lint: string[] = [];
  if (!id.trim()) lint.push('Workflow ID is required.');
  steps.forEach((s, i) => {
    if (!s.id.trim()) lint.push(`Step #${i+1}: ID is required.`);
    if (!s.uses.trim()) lint.push(`Step #${i+1}: Choose an action in Inspector.`);
    if (s.uses==='control.loop') {
      const obj = objectFromMapping(s.mapping||[]);
      const itemsExpr = obj.items || obj.list || obj.values;
      if (!itemsExpr || typeof itemsExpr !== 'string' || !itemsExpr.trim()) {
        lint.push(`Step #${i+1} (${s.id}): Loop requires an items mapping (array expression).`);
      } else if (!/\$\.[a-zA-Z0-9_\.]+/.test(itemsExpr)) {
        // heuristic: expression should reference a token; we cannot fully eval here
        lint.push(`Step #${i+1} (${s.id}): Loop items expression should reference a list token (e.g. $.input.items).`);
      } else {
        // Validate against discovered allowed sources (array inputs + prior step array expected outputs)
        const allowed: string[] = [];
        try {
          const props = (workflowInputSchema as any)?.properties || {};
          Object.keys(props).forEach(k=>{ if (props[k]?.type==='array') allowed.push(`$.input.${k}`); });
        } catch {}
        steps.slice(0, i).forEach(ps => {
          (ps.expect_output||[]).forEach(e=>{ if (e.type==='array') allowed.push(`$.steps.${ps.id}.output.${e.key}`); });
        });
        if (allowed.length && !allowed.includes(itemsExpr)) {
          lint.push(`Step #${i+1} (${s.id}): Loop items must be one of: ${allowed.join(', ')}`);
        }
      }
      if ((s.children||[]).length===0) lint.push(`Step #${i+1} (${s.id}): Loop has no nested steps.`);
    }
  });
  if (missingRequiredIssues.length) lint.push(...missingRequiredIssues);
  // Do not block publishing when sample test inputs are missing required fields.
  // This is a runtime/test concern and should not prevent saving the definition.
  // We intentionally skip adding a lint error here.
  try { /* reserved for future non-blocking hints */ } catch { /* ignore */ }
  if (mode==='after-effect' && wfOutputKind!=='static') lint.push('After-effect workflows must return a static response.');
  if (wfOutputKind==='from-step' && !wfOutputStepId) lint.push('Select a step for workflow output or switch to Static response.');

  const availableTokens = useMemo(() => {
    try {
      const props = (workflowInputSchema && typeof workflowInputSchema==='object' && (workflowInputSchema as any).properties) ? (workflowInputSchema as any).properties : undefined;
      return props && typeof props==='object' ? Object.keys(props) : [];
    } catch { return []; }
  }, [workflowInputSchema]);

  // Auto-generate workflow id (API name) from title when creating a new workflow (no existing id)
  useEffect(()=>{
    if (idManuallySet) return; // don't override existing persisted ids
    if (!name || !name.trim()) { setId(''); return; }
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64); // limit length
    setId(slug || '');
  }, [name, idManuallySet]);

  return (
    <>
      <div className="space-y-4">
        <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800 p-3 rounded-md">
          <div className="flex items-center gap-3">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
              <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Workflow name" className="md:col-span-2" />
              {/* API name (id) now auto-generated & hidden from editing. Show read-only pill for clarity. */}
              <div className="flex items-center px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-xs font-mono text-slate-300 overflow-x-auto" title="Auto-generated API name">{id || '–'}</div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">{version}</span>
                <select value={status} onChange={e=>setStatus(e.target.value as any)} className="rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200 text-sm">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onDryRun} className="rounded-md border border-sky-700/70 bg-sky-900/40 px-3 py-1.5 text-sky-100 hover:bg-sky-800">Test run</button>
              <Button onClick={onSave} disabled={saving || lint.length>0 || !name.trim() || !id.trim()}>{saving? 'Saving…':'Publish'}</Button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description" className="md:col-span-3" />
            <div className="flex flex-col gap-1">
              <button type="button" onClick={()=>setShowTestInputsModal(true)} className="w-full justify-center text-xs rounded-md border border-slate-700 px-2 py-1 text-slate-200 bg-slate-900 hover:bg-slate-800">Edit Inputs</button>
              <button type="button" onClick={()=>setShowTestInputsModal(true)} className="text-[10px] text-left text-slate-500 hover:text-slate-300 truncate font-mono" title={runInput || '{}'}>
                {(runInput && runInput.trim()) ? runInput.slice(0,40)+(runInput.length>40?'…':'') : '{ }'}
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="text-xs text-slate-400">Mode</div>
            <select value={mode} onChange={(e)=>setMode(e.target.value as any)} className="rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200 text-xs">
              <option value="wait-for">wait-for (synchronous)</option>
              <option value="after-effect">after-effect (asynchronous)</option>
            </select>
          </div>
          {lint.length>0 && <div className="mt-2 text-amber-300 text-xs">{lint.join(' ')}</div>}
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={()=>setShowInputSchemaModal(true)} className="text-xs rounded-md border border-slate-700 px-2 py-1 text-slate-200">Workflow Inputs</button>
            <button type="button" onClick={()=>setShowOutputsModal(true)} className="text-xs rounded-md border border-slate-700 px-2 py-1 text-slate-200">Workflow Output</button>
            {availableTokens.length>0 && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-slate-500">Tokens:</span>
                {availableTokens.map(k => (
                  <code key={k} className="px-1 py-0.5 rounded bg-slate-900/60 border border-slate-700/60">{`{${k}}`}</code>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {!libCollapsed ? (
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-slate-200">Library</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={()=>setLibCollapsed(true)} className="text-xs rounded border border-slate-700 px-2 py-0.5 text-slate-200">Collapse</button>
                  <button type="button" onClick={loadTemplate} className="text-xs rounded border border-slate-700 px-2 py-0.5 text-slate-200">Templates</button>
                </div>
              </div>
              <Library onAdd={(t)=>onAddTemplate(t)} />
            </div>
          ) : (
            <div className="lg:col-span-1">
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2 h-full flex items-center justify-center">
                <button type="button" onClick={()=>setLibCollapsed(false)} className="text-xs rounded border border-slate-700 px-2 py-1 text-slate-200">Open Library</button>
              </div>
            </div>
          )}
          <div className={libCollapsed ? "lg:col-span-6 xl:col-span-7" : "lg:col-span-6"}>
            <Canvas
              steps={steps}
              selected={selected}
              setSelected={setSelected}
              selectedChild={selectedChild}
              onSelectChild={(parent, index)=>{ setSelected(parent); setSelectedChild({ parent, index }); }}
              onAddAfter={(t, idx)=>onAddTemplate(t, idx)}
              onAddNested={(t, parentIdx)=>onAddNestedTemplate(t, parentIdx)}
              onMoveChild={onMoveChild}
              onRemoveChild={onRemoveChild}
              onMove={moveStep}
              onRemove={(idx)=>removeStep(idx)}
              onDropTemplate={(raw, idx)=>onDropTemplateRaw(raw, idx)}
              onDropTemplateNested={(raw, parentIdx)=>onDropTemplateNestedRaw(raw, parentIdx)}
            />
          </div>
          <div className={libCollapsed ? "lg:col-span-5 xl:col-span-4" : "lg:col-span-3"}>
            {selected<0 || !steps[selected] ? (
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-slate-400 text-sm">Select a step to edit.</div>
            ) : (
              (()=>{
                const baseStep = steps[selected];
                const editingChild = selectedChild && selectedChild.parent===selected ? baseStep.children?.[selectedChild.index] : null;
                const effectiveStep = editingChild || baseStep;
                const onChangeStep = (updated: Step)=>{
                  setSteps(s => s.map((st,i)=>{
                    if (i!==selected) return st;
                    if (editingChild){
                      const kids = [...(st.children||[])];
                      if (selectedChild!.index < kids.length) kids[selectedChild!.index] = updated;
                      return { ...st, children: kids };
                    }
                    return updated;
                  }));
                };
                return (
                  <div className="space-y-2">
                    {editingChild && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <div>Editing child step of <span className="font-mono text-slate-300">{baseStep.id}</span></div>
                        <button type="button" className="underline" onClick={()=>setSelectedChild(null)}>Back to parent</button>
                      </div>
                    )}
                    <Inspector
                      step={effectiveStep}
                      onChange={onChangeStep}
                      sampleInput={runInput}
                      steps={steps}
                      actions={actions}
                      actionsLoaded={actionsLoaded}
                      requests={requests}
                      availableTokens={availableTokens}
                      onNavigateToStep={(stepId)=>{ const idx = steps.findIndex(s=>s.id===stepId); if (idx>=0) { setSelected(idx); setSelectedChild(null); } }}
                      dryRun={dryRun}
                      workflowInputSchema={workflowInputSchema}
                    />
                  </div>
                );
              })()
            )}
          </div>
        </div>

  {error && <div className="text-red-400 text-sm">{error}</div>}
  {notice && <div className="text-emerald-300 text-sm">{notice}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-sm text-slate-300">Definition Preview</div>
            <pre className="rounded-md bg-slate-950 border border-slate-800 p-4 overflow-auto text-xs text-slate-200">{JSON.stringify(preview, null, 2)}</pre>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-300">Last Test Run</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onDryRun} className="text-xs rounded border border-slate-700 px-2 py-0.5 text-slate-200">Replay</button>
                <button type="button" onClick={onRun} disabled={!id.trim()} className="text-xs rounded bg-sky-700 px-2 py-0.5 text-white">Execute</button>
              </div>
            </div>
            <div className="rounded-md bg-slate-950 border border-slate-800 p-2 max-h-[40vh] overflow-auto text-xs">
              {!dryRun ? <div className="text-slate-500">No run yet.</div> : (
                <div className="space-y-2">
                  {dryRun.map(r => (
                    <div key={r.stepIndex} className="border border-slate-800 rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-slate-200">#{r.stepIndex+1} {steps[r.stepIndex]?.id}</div>
                        <div className={`text-[11px] ${r.status==='passed'?'text-emerald-300': r.status==='skipped'?'text-slate-300':'text-amber-300'}`}>{r.status}</div>
                      </div>
                      {r.output && <pre className="mt-1 text-slate-300">{JSON.stringify(r.output, null, 2)}</pre>}
                      {r.error && <div className="mt-1 text-amber-300">{r.error}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {showTestInputsModal && (
        <Modal
          open={showTestInputsModal}
          onClose={()=>setShowTestInputsModal(false)}
          title="Test Inputs"
          titleIcon={<FiPlay className="text-cyan-400" />}
          size="xl"
          footer={
            <>
              <span className="text-xs text-slate-400 mr-auto">Will not modify schema</span>
              <Button onClick={()=>setShowTestInputsModal(false)}>Done</Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Sample Input JSON</label>
              <textarea 
                value={runInput} 
                onChange={(e)=>setRunInput(e.target.value)} 
                className="w-full h-64 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500" 
              />
            </div>
            <p className="text-xs text-slate-500">These values are only used for local test runs and previews. They are NOT persisted to the workflow definition.</p>
          </div>
        </Modal>
      )}

      {showInputSchemaModal && (
        <Modal
          open={showInputSchemaModal}
          onClose={()=>setShowInputSchemaModal(false)}
          title="Workflow Inputs"
          titleIcon={<FiCode className="text-fuchsia-400" />}
          size="xl"
          footer={
            <>
              <span className="text-xs text-slate-400 mr-auto">
                Tokens: {availableTokens.map(k=> <code key={k} className="mx-1 px-1 py-0.5 rounded bg-slate-800 border border-slate-700">{`{${k}}`}</code>)}
              </span>
              <Button onClick={()=>setShowInputSchemaModal(false)}>Done</Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Input Schema</label>
              <CodeNoCodeToggle kind="schema" value={inputSchemaText} onChange={setInputSchemaText} />
            </div>
            <p className="text-xs text-slate-500">Define fields your workflow expects. They become tokens like {`{name}`}, available to map into step inputs.</p>
          </div>
        </Modal>
      )}

      {showOutputsModal && (
        <Modal
          open={showOutputsModal}
          onClose={()=>setShowOutputsModal(false)}
          title="Workflow Output"
          titleIcon={<FiLogOut className="text-cyan-400" />}
          size="xl"
          footer={<Button onClick={()=>setShowOutputsModal(false)}>Done</Button>}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Output Schema</label>
              <CodeNoCodeToggle kind="schema" value={outputSchemaText} onChange={setOutputSchemaText} />
              <p className="text-xs text-slate-500 mt-1">Define the shape your workflow returns.</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Workflow Output Mode</label>
              <div className="flex items-center gap-4 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="wf_out_mode" disabled={mode==='after-effect'} checked={wfOutputKind==='from-step'} onChange={()=>setWfOutputKind('from-step')} className="text-fuchsia-500 focus:ring-fuchsia-500" />
                  <span>From step</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="wf_out_mode" checked={wfOutputKind==='static'} onChange={()=>setWfOutputKind('static')} className="text-fuchsia-500 focus:ring-fuchsia-500" />
                  <span>Static</span>
                </label>
              </div>
              {wfOutputKind==='from-step' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <select value={wfOutputStepId} onChange={(e)=>setWfOutputStepId(e.target.value)} className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500">
                    <option value="">Select step…</option>
                    {steps.map(s=> <option key={s.id} value={s.id}>{s.id}</option>)}
                  </select>
                  <input value={wfOutputPath} onChange={(e)=>setWfOutputPath(e.target.value)} placeholder="optional path e.g., data.id" className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500" />
                </div>
              ) : (
                <textarea value={wfOutputStaticText} onChange={(e)=>setWfOutputStaticText(e.target.value)} className="w-full h-32 mt-3 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-fuchsia-500" />
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
