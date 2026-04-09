"use client";
import CodeNoCodeToggle from '@/components/base/CodeNoCodeToggle';

export type MappingRow = { key: string; value: string; isJson?: boolean };
export type ExpectRow = { key: string; type: 'string'|'number'|'boolean'|'object'|'array'|'any'; optional?: boolean };
export type Step = {
  id: string;
  title?: string;
  uses: string;
  when?: string;
  on_error?: 'continue'|'retry'|'halt';
  mapping: MappingRow[];
  expect_output?: ExpectRow[];
  timeout_s?: number;
  idempotency_key?: string;
  tags?: string[];
  output_mode?: 'raw'|'custom';
  output_mapping?: MappingRow[];
  // Nested steps (for control.loop or future block-like steps)
  children?: Step[]; // only used when uses === 'control.loop'
};

export type StepTemplate = {
  key: string; // generic action key (e.g., http.get, notify.email)
  title: string;
  category: 'App'|'Control'|'Transform'|'Data'|'Notify'|'AI';
  icon?: string; // emoji for now
  defaultMapping?: Record<string, any>;
  description?: string;
};

export const STEP_TEMPLATES: StepTemplate[] = [
  // App (generic, business-friendly)
  { key: 'app.call', title: 'Request', category: 'App', icon: '🧩', description: 'Invoke a reusable HTTP request you configured (pick in Inspector)', defaultMapping: { /* select a request in Inspector, then map inputs */ } },
  { key: 'app.create_appointment', title: 'Create Appointment', category: 'App', icon: '📅', description: 'Create a calendar event/appointment in your connected calendar', defaultMapping: { title: "concat('Appt: ', $.input.service, ' – ', $.input.customer.name)", start: '$.output.start_time', end: 'plusMinutes($.output.start_time, 60)', location: '$.input.address', description: "concat('Booked by ', coalesce($.input.channel,'assistant'))" } },
  { key: 'app.send_email', title: 'Send Email', category: 'App', icon: '✉️', description: 'Send an email via your configured provider', defaultMapping: { to: '$.input.customer.email', subject: 'Follow-up', body: "concat('Hi ', $.input.customer.name)" } },
  { key: 'app.send_text', title: 'Send Text', category: 'App', icon: '📲', description: 'Send a text message (SMS) via your configured provider', defaultMapping: { to: '${ENV.OWNER_PHONE}', body: "concat('New message: ', $.input.message)" } },
  { key: 'app.create_record', title: 'Create Record', category: 'App', icon: '🗂️', description: 'Create a record in your connected app (e.g., CRM lead)', defaultMapping: { type: 'Lead', data: { name: '$.input.customer.name', phone: '$.input.customer.phone', email: '$.input.customer.email' } } },
  { key: 'app.update_record', title: 'Update Record', category: 'App', icon: '🛠️', description: 'Update a record in your connected app', defaultMapping: { type: 'Contact', id: '$.steps.lookup_customer.output.contact_id', data: { notes: '$.input.notes' } } },

  // Control
  { key: 'control.loop', title: 'Loop (for each)', category: 'Control', icon: '🔁', description: 'Iterate over a list to run nested logic', defaultMapping: { items: '$.input.items' } },

  // Transform
  { key: 'transform.map', title: 'Transform (map fields)', category: 'Transform', icon: '🧭', description: 'Map and reshape data from input to output', defaultMapping: { full_name: "concat($.input.first_name,' ', $.input.last_name)", phone: '$.input.phone', email: '$.input.email' } },
  { key: 'transform.extract', title: 'Extract Value', category: 'Transform', icon: '🧪', description: 'Extract a value from input/output for later steps', defaultMapping: { value: '$.input.payload.data.id' } },

  // Data (enrich temporarily removed)

  // Notify (generic, not vendor-specific)
  { key: 'notify.sms', title: 'Notify (SMS)', category: 'Notify', icon: '�', description: 'Send a text message via configured provider', defaultMapping: { to: '${ENV.OWNER_PHONE}', body: "concat('New message: ', $.input.message)" } },
  { key: 'notify.email', title: 'Notify (Email)', category: 'Notify', icon: '✉️', description: 'Send an email via configured provider', defaultMapping: { to: '$.input.customer.email', subject: 'Follow-up', body: "concat('Hi ', $.input.customer.name)" } },

  // AI
  { key: 'ai.generate', title: 'AI Generate', category: 'AI', icon: '✨', description: 'Generate text with your configured model', defaultMapping: { prompt: "concat('Write a friendly confirmation for ', $.input.customer.name)" } },
  { key: 'ai.summarize', title: 'AI Summarize', category: 'AI', icon: '🧠', description: 'Summarize long text into key points', defaultMapping: { text: '{text}', length: 'short' } },
  { key: 'ai.transform', title: 'AI Transform', category: 'AI', icon: '🔁', description: 'Transform text (rewrite, change tone, translate)', defaultMapping: { text: '{text}', instruction: 'Rewrite in a friendly, concise tone' } },
];

// Expression helpers
export function getByPath(root: any, path: string) {
  if (!path || !path.startsWith('$.')) return undefined;
  const parts = path.replace(/^\$\./, '').split('.');
  let cur: any = root;
  for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
  return cur;
}
export function splitArgs(s: string): string[] {
  const out: string[] = []; let buf=''; let depth=0; let inStr: string|false=false;
  for (let i=0;i<s.length;i++) { const ch=s[i];
    if (inStr) { if (ch===inStr && s[i-1]!=='\\') inStr=false; buf+=ch; continue; }
    if (ch==='"' || ch==='\'') { inStr=ch as any; buf+=ch; continue; }
    if (ch==='(') { depth++; buf+=ch; continue; }
    if (ch===')') { depth--; buf+=ch; continue; }
    if (ch===',' && depth===0) { out.push(buf.trim()); buf=''; continue; }
    buf+=ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
export function evalExpr(expr: any, ctx: any): any {
  if (expr == null) return undefined;
  if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
  if (typeof expr === 'object') return expr;
  const s = String(expr).trim();
  if (s === 'true') return true; if (s === 'false') return false;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/\\'/g, "'");
  if (s.startsWith('$.')) return getByPath(ctx, s);
  if (s.startsWith('${ENV.')) return (ctx.ENV && ctx.ENV[s.slice(2, -1).split('.').slice(1).join('.')]) || '';
  if (s.startsWith('concat(') && s.endsWith(')')) {
    const args = splitArgs(s.slice(7, -1));
    return args.map(a=>evalExpr(a, ctx)).join('');
  }
  if (s.startsWith('coalesce(') && s.endsWith(')')) {
    const [a,b] = splitArgs(s.slice(9, -1));
    const va = evalExpr(a, ctx); return (va!=null && va!=='') ? va : evalExpr(b, ctx);
  }
  if (s.startsWith('fmtTime(') && s.endsWith(')')) {
    const [a] = splitArgs(s.slice(8, -1)); const v = evalExpr(a, ctx);
    const d = v ? new Date(v) : new Date(); return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  }
  if (s.startsWith('plusMinutes(') && s.endsWith(')')) {
    const [a,b] = splitArgs(s.slice(12, -1)); const t = new Date(evalExpr(a, ctx)); const m = Number(evalExpr(b, ctx) || 0);
    if (isNaN(t.getTime())) return evalExpr(a, ctx);
    t.setMinutes(t.getMinutes()+m); return t.toISOString();
  }
  if (s.startsWith('not(') && s.endsWith(')')) { const [a] = splitArgs(s.slice(4,-1)); return !Boolean(evalExpr(a, ctx)); }
  if (s.includes('==') || s.includes('!=')) {
    const op = s.includes('!=') ? '!=' : '=='; const [l,r] = s.split(op); const lv = evalExpr(l.trim(), ctx); const rv = evalExpr(r.trim(), ctx); return op==='==' ? (lv==rv) : (lv!=rv);
  }
  return s; // fallback
}
export function resolveMapping(mapping: Record<string, any>, ctx: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (typeof v === 'object' && v && !Array.isArray(v)) out[k] = resolveMapping(v as any, ctx);
    else out[k] = evalExpr(v, ctx);
  }
  return out;
}
// Token substitution helpers: replace {key.path} with $.input.key.path
export function replaceTokensInString(s: string, ctx: any){
  if (!s || typeof s !== 'string') return s as any;
  return s.replace(/\{([a-zA-Z0-9_\.]+)\}/g, (_m, p1) => {
    const v = getByPath({ input: ctx?.input }, `$.input.${p1}`);
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}
export function resolveTokensInObject(obj: any, ctx: any): any {
  if (obj == null) return obj;
  if (typeof obj === 'string') return replaceTokensInString(obj, ctx);
  if (Array.isArray(obj)) return obj.map(x=>resolveTokensInObject(x, ctx));
  if (typeof obj === 'object') {
    const out: any = {};
    for (const [k,v] of Object.entries(obj)) out[k] = resolveTokensInObject(v, ctx);
    return out;
  }
  return obj;
}
export function evalWhen(expr?: string, ctx?: any) {
  if (!expr) return true; try { return Boolean(evalExpr(expr, ctx)); } catch { return false; }
}

export function objectFromMapping(rows: MappingRow[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const r of rows) {
    if (!r.key) continue;
    if (r.isJson) {
      try { out[r.key] = JSON.parse(r.value || 'null'); } catch { out[r.key] = r.value; }
    } else {
      out[r.key] = r.value;
    }
  }
  return out;
}

export function mappingFromObject(obj: any): MappingRow[] {
  if (!obj || typeof obj !== 'object') return [];
  const rows: MappingRow[] = [];
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (v && typeof v === 'object') rows.push({ key: k, value: JSON.stringify(v, null, 2), isJson: true });
    else rows.push({ key: k, value: String(v ?? '') });
  }
  return rows;
}

export function expectFromRows(rows?: ExpectRow[]) {
  if (!rows || !rows.length) return undefined;
  const out: Record<string, string> = {};
  for (const r of rows) {
    const base = r.type || 'any';
    out[r.key] = r.optional ? `${base}?` : base;
  }
  return out;
}

export function rowsFromExpect(obj?: Record<string,string>) : ExpectRow[]|undefined {
  if (!obj) return undefined;
  const rows: ExpectRow[] = [];
  for (const [k, t] of Object.entries(obj)) {
    const optional = String(t).endsWith('?');
    const base = (optional ? String(t).slice(0, -1) : String(t)) as any;
    rows.push({ key: k, type: ((['string','number','boolean','object','array','any'] as const).includes(base) ? base : 'any') as any, optional });
  }
  return rows;
}

export function iconFor(st: Step) { const t = STEP_TEMPLATES.find(x=>x.key===st.uses); return t?.icon || '🔧'; }
export function isLoop(st: Step){ return st.uses === 'control.loop'; }
export function humanize(id: string) { return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m)=>m.toUpperCase()); }
export function truncate(s: string, n: number){ return s.length>n? s.slice(0,n-1)+'…':s; }
export function miniSummary(st: Step) {
  const m = st.mapping || []; const first = m.find(x=>x.key); const count = m.filter(x=>x.key).length; const tail = count>1?` +${count-1}`:''; return first?`${first.key}:${truncate(String(first.value||''),24)}${tail}`:'No mappings';
}
export function safeParse(s: string){ try { return JSON.parse(s || '{}'); } catch { return {}; } }
export function buildCtxSteps(steps: Step[], dry: any){ const ctx:any={}; if (!dry) return ctx; dry.forEach((r:any)=>{ ctx[steps[r.stepIndex]?.id||`step_${r.stepIndex+1}`]= { output: r.output }; }); return ctx; }
export function uniqueStepId(existing: Step[], base: string) {
  const norm = base.replace(/[^a-zA-Z0-9_]+/g, '_');
  let i = 1; let candidate = norm;
  const set = new Set(existing.map(s => s.id));
  while (set.has(candidate)) { i += 1; candidate = `${norm}_${i}`; }
  return candidate || `step_${existing.length+1}`;
}

// Re-export CodeNoCodeToggle type for convenience where needed
export { CodeNoCodeToggle };
