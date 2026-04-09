"use client";
import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/base/Modal';
import Input from '@/components/base/Input';
import Select from '@/components/base/Select';
import Textarea from '@/components/base/Textarea';
import Tabs from '@/components/base/Tabs';
import CodeNoCodeToggle from '@/components/base/CodeNoCodeToggle';
import { FiCpu, FiBookOpen, FiGitBranch } from 'react-icons/fi';

function isFeatureEnabled(key?: string) {
  const v = key != null ? key : process.env.NEXT_PUBLIC_FEATURE_HOSTED_ACTIONS;
  if (v != null) {
    const s = String(v).toLowerCase();
    if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
    return false;
  }
  return process.env.NEXT_PUBLIC_DEV_FEATURES === '1';
}

export type ActionDoc = any;

export default function ActionEditorModal({
  open,
  onClose,
  action,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  action?: ActionDoc | null;
  onSaved: (actions: any[]) => void;
}) {
  const HOSTED_FEATURE = isFeatureEnabled();
  const DEFAULT_INPUT_SCHEMA = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{},"additionalProperties":false}';
  const DEFAULT_OUTPUT_SCHEMA = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{},"additionalProperties":true}';
  const [saving, setSaving] = useState(false);

  // Core fields
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // High-level action type
  const [actionType, setActionType] = useState<'app'|'knowledge'|'workflow'>('app');
  const [mode, setMode] = useState<'direct'|'hosted'>('direct');
  // Request linkage (new)
  const [requests, setRequests] = useState<Array<{ id: string; title?: string }>>([]);
  const [requestId, setRequestId] = useState<string>('');
  const [overrideAuth, setOverrideAuth] = useState<boolean>(false);
  // Knowledge + Workflow linkage
  const [articles, setArticles] = useState<Array<{ id: string; title?: string }>>([]);
  const [articleId, setArticleId] = useState<string>('');
  const [workflows, setWorkflows] = useState<Array<{ id: string; name?: string }>>([]);
  const [workflowId, setWorkflowId] = useState<string>('');
  // (Legacy inline transport/schema removed from UI)
  const [authRequired, setAuthRequired] = useState(true);
  const [authType, setAuthType] = useState<'none'|'apiKey'|'oauth2'>('oauth2');
  // Connection selection (providers)
  const [providers, setProviders] = useState<Array<{ key: string; name?: string }>>([]);
  const [providerQuery, setProviderQuery] = useState('');
  const [authProvider, setAuthProvider] = useState('');
  const [authScopes, setAuthScopes] = useState('');
  // hosted
  const [hostedEnabled, setHostedEnabled] = useState(false);
  const [hostedCode, setHostedCode] = useState('return { kind: "text", value: "hello" };');
  const [hostedTimeout, setHostedTimeout] = useState(6000);
  const [hostedNetAllow, setHostedNetAllow] = useState('');
  const [hostedEnv, setHostedEnv] = useState('');

  // preservation when feature is off
  const [originalHosted, setOriginalHosted] = useState<any|null>(null);
  const [originalTransportMode, setOriginalTransportMode] = useState<'direct'|'hosted'|'unknown'>('unknown');
  const [originalTransport, setOriginalTransport] = useState<any|null>(null);

  const isConfigured = useMemo(() => {
    if (actionType === 'app') return !!requestId;
    if (actionType === 'knowledge') return !!articleId;
    if (actionType === 'workflow') return !!workflowId;
    return false;
  }, [actionType, requestId, articleId, workflowId]);

  useEffect(() => {
    if (!open) return;
    // Load actions for selection (formerly requests)
    (async () => {
      try {
        const r = await fetch('/api/orgs/actions', { cache: 'no-store' });
        const j = await r.json();
        const arr = Array.isArray(j?.actions) ? j.actions : [];
        setRequests(arr.map((x:any)=>({ id: x.id, title: x.title })));
      } catch {
        setRequests([]);
      }
    })();
    // Load knowledge articles for selection
    (async () => {
      try {
        const r = await fetch('/api/orgs/knowledge', { cache: 'no-store' });
        const j = await r.json();
        const arr = Array.isArray(j?.articles) ? j.articles : [];
        setArticles(arr.map((x:any)=>({ id: x.id, title: x.title })));
      } catch { setArticles([]); }
    })();
    // Load workflows for selection
    (async () => {
      try {
        const r = await fetch('/api/orgs/workflows', { cache: 'no-store' });
        const j = await r.json();
        const arr = Array.isArray(j?.workflows) ? j.workflows : [];
        setWorkflows(arr.map((x:any)=>({ id: x.id, name: x.name })));
      } catch { setWorkflows([]); }
    })();
    // Load providers (connections)
    (async () => {
      try {
        const r = await fetch('/api/oauth/providers', { cache: 'no-store' });
        const j = await r.json();
        const arr = Array.isArray(j?.providers) ? j.providers : [];
        setProviders(arr.map((p:any)=>({ key: p.key, name: p.name || p.title || p.key })));
      } catch { setProviders([]); }
    })();
    // initialize from action or defaults
    const a = action || null;
    setId(a?.id || '');
  setIdTouched(!!a?.id);
    setTitle(a?.title || a?.id || '');
    setDescription(a?.description || '');
    const t = a?.transport || {};
    const http = t?.http || a?.http || {};
    setOriginalTransportMode((t?.mode || 'direct') as any);
    setOriginalTransport(t || a?.http ? { ...(t || {}), http: t?.http || a?.http || {} } : null);
    setMode((t?.mode || 'direct') as any);
    setAuthRequired(Boolean(a?.auth?.required ?? true));
    setAuthType((a?.auth?.type as any) || 'oauth2');
    setAuthProvider(a?.auth?.provider || '');
    setAuthScopes(Array.isArray(a?.auth?.scopes) ? a.auth.scopes.join(',') : '');

    // link request if present
  const req = a?.request_ref?.id || '';
  setRequestId(req);
  setOverrideAuth(req ? false : true);

  // knowledge/workflow detection
  const kref = a?.knowledge_ref?.id || '';
  setArticleId(kref);
  const wref = a?.workflow_ref?.id || '';
  setWorkflowId(wref);
  if (kref) setActionType('knowledge');
  else if (wref) setActionType('workflow');
  else setActionType('app');

    const hs = a?.hosted || null; setOriginalHosted(hs || null);
    if (HOSTED_FEATURE && hs && typeof hs.code === 'string' && (t?.mode || 'direct') !== 'direct') {
      setHostedEnabled(true);
      setHostedCode(hs.code || '');
      setHostedTimeout(hs.timeout_ms || 6000);
      setHostedNetAllow(Array.isArray(hs.permissions?.net_allow) ? hs.permissions.net_allow.join(',') : '');
      setHostedEnv(Array.isArray(hs.permissions?.env) ? hs.permissions.env.join(',') : '');
      setMode('hosted'); setAuthRequired(false);
    } else { setHostedEnabled(false); setHostedCode('return { kind: "text", value: "hello" };'); setHostedTimeout(6000); setHostedNetAllow(''); setHostedEnv(''); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-generate Action ID from Title for new actions until user edits ID
  useEffect(() => {
    if (action) return; // don't override when editing
    if (idTouched) return; // stop auto-updating once user typed in ID
    const slug = (title || '').trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    setId(slug);
  }, [title, action, idTouched]);

  useEffect(() => {
    if (hostedEnabled) {
      if (mode === 'direct') setMode('hosted');
      setAuthRequired(false);
    }
  }, [hostedEnabled, mode]);

  async function save() {
    setSaving(true);
    try {
      let hosted: any = undefined;
      if (HOSTED_FEATURE && hostedEnabled) {
        hosted = {
          runtime: 'js-v1',
          code: hostedCode,
          timeout_ms: hostedTimeout,
          permissions: {
            net_allow: hostedNetAllow.split(/\s*,\s*/).map((s)=>s).filter(Boolean),
            env: hostedEnv.split(/\s*,\s*/).map((s)=>s).filter(Boolean),
          }
        };
      }
      if (!HOSTED_FEATURE) {
        if (!hosted && originalHosted) hosted = originalHosted;
      }
  // Hosted for Knowledge/Workflow, direct for Request unless Hosted enabled
      const computedMode: 'direct'|'hosted' = (hostedEnabled || actionType==='knowledge' || actionType==='workflow') ? 'hosted' : 'direct';

      const payload: any = {
        id: id.trim(),
        title: title || id.trim(),
        description: description || undefined,
        transport: { mode: computedMode },
        ...(actionType==='knowledge' && articleId ? { knowledge_ref: { id: articleId } } : {}),
        ...(actionType==='workflow' && workflowId ? { workflow_ref: { id: workflowId, mode: 'effect' } } : {}),
        ...(actionType==='app' && requestId ? { request_ref: { id: requestId } } : {}),
        ...(hosted ? { hosted } : {}),
  enabled: true,
      };

      // Auth semantics:
      // - If overriding, persist the full auth config for this Action.
      // - If NOT overriding and user selected Not required, persist { required:false, type:'none' } to gate execution without changing request auth.
      if (actionType==='app' && requestId) {
        const mkScopes = () => authScopes ? authScopes.split(',').map((s)=>s.trim()).filter(Boolean) : undefined;
        if (overrideAuth) {
          payload.auth = {
            required: !!authRequired,
            type: authRequired ? authType : 'none',
            provider: authProvider || undefined,
            scopes: authRequired ? mkScopes() : undefined,
          };
        } else {
          if (!authRequired) {
            payload.auth = { required: false, type: 'none' };
          } else {
            // Gate execution to users with a connection, but do not alter transport auth
            payload.auth = {
              required: true,
              type: authType,
              provider: authProvider || undefined,
              scopes: mkScopes(),
            };
          }
        }
      }

      const res = await fetch('/api/orgs/actions', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Save failed');
      const arr = Array.isArray(data.actions) ? data.actions : [];
      onSaved(arr);
      onClose();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={action ? `Edit Action: ${action.id}` : 'New Action'}
      variant="dark"
      size="2xl"
      footer={(
        <div className="flex justify-end gap-2">
          <button disabled={saving} onClick={onClose} className="btn border border-slate-600/70 bg-slate-800/60 text-slate-200 hover:bg-slate-700/70 hover:border-slate-500/70 transition-colors">Cancel</button>
          <button disabled={saving || !id.trim() || !title.trim() || !isConfigured} onClick={save} className="btn bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white">{saving ? 'Saving…' : (action ? 'Save Changes' : 'Create Action')}</button>
        </div>
      )}
    >
      <Tabs
        variant="dark"
        items={[
          { key: 'basics', label: 'Basics', content: (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Title</div>
                  <Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="My Action" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">ID</div>
                  <Input value={id} onChange={(e)=>{ setId(e.target.value); setIdTouched(true); }} placeholder="unique-action-id" disabled={!!action} />
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Description</div>
                <Textarea value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="What this action does" />
              </div>
              <div className="rounded border border-slate-700/60 p-3 bg-slate-900/40 space-y-3">
                <div className="text-sm font-medium text-slate-200 mb-2">What does this action do?</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { key: 'app', title: 'Request', desc: 'Call an external API using a reusable request', icon: <FiCpu className="text-xl" /> },
                    { key: 'knowledge', title: 'Knowledge', desc: 'Return content from a single knowledge article', icon: <FiBookOpen className="text-xl" /> },
                    { key: 'workflow', title: 'Workflow', desc: 'Trigger a Lamdis workflow as a side effect', icon: <FiGitBranch className="text-xl" /> },
                  ].map((card: any) => (
                    <button
                      key={card.key}
                      type="button"
                      onClick={()=>{ setActionType(card.key); setRequestId(''); setArticleId(''); setWorkflowId(''); }}
                      className={`text-left rounded border p-3 transition-colors ${actionType===card.key ? 'border-fuchsia-500/70 bg-fuchsia-950/20' : 'border-slate-700/60 bg-slate-900/40 hover:border-slate-600/60'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded ${actionType===card.key ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-slate-800/70 text-slate-300'}`}>{card.icon}</div>
                        <div>
                          <div className="text-slate-200 font-medium">{card.title}</div>
                          <div className="text-xs text-slate-400">{card.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {actionType==='app' && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-400 mb-1">Select Request</div>
                      <Select value={requestId} onChange={(e)=>{ const v = e.target.value; setRequestId(v); setOverrideAuth(false); setArticleId(''); setWorkflowId(''); }}>
                        <option value="">— Choose a Request —</option>
                        {requests.map(r => (
                          <option key={r.id} value={r.id}>{r.title ? `${r.title} (${r.id})` : r.id}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="text-xs text-slate-400">
                      {requestId ? (
                        <div className="p-2 rounded border border-emerald-700/50 bg-emerald-900/20 text-emerald-200">Using Request <span className="font-mono">{requestId}</span></div>
                      ) : (
                        <div className="p-2 rounded border border-amber-700/50 bg-amber-900/20 text-amber-200">Select a Request to continue.</div>
                      )}
                    </div>
                  </div>
                )}
                {actionType==='knowledge' && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-400 mb-1">Select Article</div>
                      <Select value={articleId} onChange={(e)=>{ setArticleId(e.target.value); setRequestId(''); setWorkflowId(''); }}>
                        <option value="">— Choose article —</option>
                        {articles.map(a => (
                          <option key={a.id} value={a.id}>{a.title ? `${a.title} (${a.id})` : a.id}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="text-xs text-slate-400">
                      {articleId ? (
                        <div className="p-2 rounded border border-emerald-700/50 bg-emerald-900/20 text-emerald-200">Using article <span className="font-mono">{articleId}</span></div>
                      ) : (
                        <div className="p-2 rounded border border-amber-700/50 bg-amber-900/20 text-amber-200">Pick an article to continue.</div>
                      )}
                    </div>
                  </div>
                )}
                {actionType==='workflow' && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-400 mb-1">Select Workflow</div>
                      <Select value={workflowId} onChange={(e)=>{ setWorkflowId(e.target.value); setRequestId(''); setArticleId(''); }}>
                        <option value="">— Choose workflow —</option>
                        {workflows.map(w => (
                          <option key={w.id} value={w.id}>{w.name ? `${w.name} (${w.id})` : w.id}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="text-xs text-slate-400">
                      {workflowId ? (
                        <div className="p-2 rounded border border-emerald-700/50 bg-emerald-900/20 text-emerald-200">Invokes workflow <span className="font-mono">{workflowId}</span></div>
                      ) : (
                        <div className="p-2 rounded border border-amber-700/50 bg-amber-900/20 text-amber-200">Select a workflow to invoke.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Static Response removed */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-400 mb-1">Auth Required</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[{ key: true, title: 'Required', desc: 'Users must connect a credential to run this action.' }, { key: false, title: 'Not required', desc: 'No credential needed. Use for public/anonymous endpoints.' }].map((opt)=> (
                      <button
                        key={String(opt.key)}
                        type="button"
                        onClick={()=> setAuthRequired(Boolean(opt.key))}
                        disabled={!(actionType==='app' && requestId)}
                        className={`text-left rounded border p-3 transition-colors ${authRequired===opt.key ? 'border-sky-500/70 bg-sky-950/20' : 'border-slate-700/60 bg-slate-900/40 hover:border-slate-600/60'} ${!(actionType==='app' && requestId) ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <div className="text-slate-200 font-medium">{opt.title}</div>
                        <div className="text-xs text-slate-400">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Auth Type</div>
                  <Select value={authType} onChange={(e)=>setAuthType(e.target.value as any)} disabled={!authRequired || !(actionType==='app' && requestId)}>
                    <option value="oauth2">OAuth2</option>
                    <option value="apiKey">API Key</option>
                    <option value="none">None</option>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Connection</div>
                  <div className="grid grid-cols-1 gap-2">
                    <Input value={providerQuery} onChange={(e)=>setProviderQuery(e.target.value)} placeholder="Search connections…" disabled={!authRequired || !(actionType==='app' && requestId)} />
                  <Select value={authProvider} onChange={(e)=>setAuthProvider(e.target.value)} disabled={!authRequired || !(actionType==='app' && requestId)}>
                    <option value="">— Select connection —</option>
                    {(providers||[]).filter(p => {
                      const q = providerQuery.toLowerCase();
                      if (!q) return true;
                      return (p.name||'').toLowerCase().includes(q) || p.key.toLowerCase().includes(q);
                    }).map(p => (
                      <option key={p.key} value={p.key}>{p.name || p.key}</option>
                    ))}
                  </Select>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Scopes (comma-separated)</div>
                <Input value={authScopes} onChange={(e)=>setAuthScopes(e.target.value)} placeholder="scope1,scope2" disabled={!authRequired || !(actionType==='app' && requestId)} />
              </div>
              {requestId && (
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={overrideAuth} onChange={(e)=>setOverrideAuth(e.target.checked)} />
                    Override Request authentication
                  </label>
                  {!overrideAuth && <span className="text-slate-500">The call will use the Request's credentials. Settings above are used to gate who can run the action (e.g., require a user connection) but won't change transport auth.</span>}
                </div>
              )}
            </div>
          ) },
          // Hosted script remains in Actions (not part of Request migration)
          ...(HOSTED_FEATURE ? [{ key: 'hosted', label: 'Hosted Script', content: (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-200">Hosted Script</div>
                <label className="text-xs text-slate-300 inline-flex items-center gap-2">
                  <input type="checkbox" checked={hostedEnabled} onChange={(e)=>setHostedEnabled(e.target.checked)} /> Enable
                </label>
              </div>
              {hostedEnabled && (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Code (JS)</div>
                    <Textarea value={hostedCode} onChange={(e)=>setHostedCode(e.target.value)} mono className="h-40" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Timeout (ms)</div>
                      <Input type="number" value={String(hostedTimeout)} onChange={(e)=>setHostedTimeout(Number(e.target.value || 0))} />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Net Allow (comma-separated)</div>
                      <Input value={hostedNetAllow} onChange={(e)=>setHostedNetAllow(e.target.value)} placeholder="api.example.com, *.foo.com" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Env Allow (comma-separated)</div>
                      <Input value={hostedEnv} onChange={(e)=>setHostedEnv(e.target.value)} placeholder="API_KEY, SECRET" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) }] : []),
        ]}
      />
    </Modal>
  );
}
