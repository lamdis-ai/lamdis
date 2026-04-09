// Cleaned duplicate/merged file. Keeping a single implementation below.
"use client";
import { Suspense, useEffect, useState } from 'react';
import Button from '@/components/base/Button';
import Input from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import { FiLink, FiTrash2 } from 'react-icons/fi';

export const dynamic = 'force-dynamic';

type Connection = { key: string; label?: string; auth_type: string; base_url?: string; scopes: string[]; has_api_key?: boolean; api_key_last4?: string | null; api_key_ref_key?: string | null };
type VariableMeta = { id: string; key: string; createdAt: string; updatedAt: string };

export default function ProvidersPage() {
  return (
    <Suspense fallback={<div className="text-xs text-slate-500">Loading…</div>}>
      <ProvidersInner />
    </Suspense>
  );
}

function ProvidersInner() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [variables, setVariables] = useState<VariableMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [showConnModal, setShowConnModal] = useState(false);
  const [editConnKey, setEditConnKey] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState<any[] | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ key: string; actions: any[] } | null>(null);

  useEffect(()=>{ loadAll(); }, []);
  async function loadAll() {
    try {
      const cr = await fetch('/api/orgs/connections', { cache: 'no-store' });
      if (cr.ok) { const cj = await cr.json(); setConnections(Array.isArray(cj.connections)?cj.connections:[]); } else setConnections([]);
    } catch { setConnections([]); }
    try {
      const vr = await fetch('/api/orgs/variables', { cache: 'no-store' });
      if (vr.ok) { const vj = await vr.json(); setVariables(Array.isArray(vj.variables)?vj.variables:[]); } else setVariables([]);
    } catch { setVariables([]); }
  }

  async function loadAudit() {
    setAudit(null);
    try {
      const r = await fetch('/api/orgs/connections/audit', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); setAudit(Array.isArray(j.audit)?j.audit:[]); } else setAudit([]);
    } catch { setAudit([]); }
  }

  async function confirmDelete(key: string) {
    // fetch impact first
    try {
      const r = await fetch(`/api/orgs/connections/impact?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      let actions: any[] = [];
      if (r.ok) { const j = await r.json(); actions = Array.isArray(j.actions)? j.actions: []; }
      setConfirmDel({ key, actions });
    } catch { setConfirmDel({ key, actions: [] }); }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header className="space-y-2">
  <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Connections</h1>
  <p className="text-sm md:text-base text-slate-400 max-w-2xl">Connections are reusable, authenticated HTTP endpoints. Use them to call secured APIs to create test data, verify information in your systems, or point to the endpoint where your AI assistant is hosted. Configure auth once (API key or OAuth2) and then reference the connection in requests—Lamdis attaches the right headers/tokens automatically.</p>
      </header>

      <section className="space-y-8">
        <SectionCard title="Org Connections" actions={
          <div className='flex items-center gap-2'>
            <Input value={query} onChange={e=>setQuery(e.target.value)} sizeVariant='sm' placeholder='Search connections…' className='w-52' />
            <Button onClick={()=>{ setEditConnKey(null); setShowConnModal(true); }} className='h-8 text-xs'>New</Button>
            <Button variant='ghost' className='h-8 text-xs' onClick={()=>{ setShowAudit(x=>!x); if(!showAudit) loadAudit(); }}>{showAudit? 'Hide Audit':'Show Audit'}</Button>
          </div>
        }>
          {connections === null && <div className='text-xs text-slate-500'>Loading…</div>}
          {connections && connections.length===0 && <div className='text-xs text-slate-500'>No connections yet.</div>}
          {connections && connections.length>0 && (
            <table className='w-full text-xs'>
              <thead>
                <tr className='text-left text-slate-400'>
                  <th className='py-1 px-2'>Key</th>
                  <th className='py-1 px-2'>Label</th>
                  <th className='py-1 px-2'>Auth</th>
                  <th className='py-1 px-2'>Scopes</th>
                  <th className='py-1 px-2'>API Key</th>
                  <th className='py-1 px-2'>Actions</th>
                </tr>
              </thead>
              <tbody>
                {connections.filter(c=>{
                  const q = query.trim().toLowerCase();
                  if(!q) return true;
                  return c.key.toLowerCase().includes(q) || (c.label || '').toLowerCase().includes(q);
                }).map(c => (
                  <tr key={c.key} className='border-t border-slate-800/60 hover:bg-slate-800/40'>
                    <td className='py-1.5 px-2 font-mono text-slate-200'>{c.key}</td>
                    <td className='py-1.5 px-2 text-slate-300'>{c.label || '—'}</td>
                    <td className='py-1.5 px-2 text-slate-300'>{c.auth_type}</td>
                    <td className='py-1.5 px-2 text-slate-400'>{c.scopes?.length? c.scopes.join(', '): '—'}</td>
                    <td className='py-1.5 px-2'>
                      {c.api_key_ref_key ? (
                        <Badge color='violet'>Var: {c.api_key_ref_key}</Badge>
                      ) : c.has_api_key ? (
                        <Badge color='sky'>Stored • *{c.api_key_last4}</Badge>
                      ) : (
                        <Badge color='slate'>None</Badge>
                      )}
                    </td>
                    <td className='py-1.5 px-2 flex items-center gap-2'>
                      <Button variant='outline' className='h-8 px-3 text-xs' onClick={()=>{ setEditConnKey(c.key); setShowConnModal(true); }}>Edit</Button>
                      <Button variant='danger' className='h-8 px-3 text-xs' onClick={()=>confirmDelete(c.key)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className='text-[11px] text-slate-500'>You can supply an API key directly or reference a variable (preferred). When referencing a variable the secret rotates centrally.</p>
          {showAudit && (
            <div className='mt-4 border-t border-slate-800/60 pt-4'>
              <div className='flex items-center gap-2 mb-2'>
                <div className='text-[11px] uppercase tracking-wide text-slate-400'>Recent Audit (connections)</div>
                <Button variant='ghost' className='h-6 px-2 text-[10px]' onClick={loadAudit}>Refresh</Button>
              </div>
              {audit === null && <div className='text-[11px] text-slate-500'>Loading audit…</div>}
              {audit && audit.length === 0 && <div className='text-[11px] text-slate-500'>No audit events yet.</div>}
              {audit && audit.length > 0 && (
                <div className='max-h-60 overflow-auto rounded-md border border-slate-800/60'>
                  <table className='w-full text-[11px]'>
                    <thead className='bg-slate-800/40 text-slate-400'>
                      <tr>
                        <th className='px-2 py-1 text-left'>Time</th>
                        <th className='px-2 py-1 text-left'>Action</th>
                        <th className='px-2 py-1 text-left'>Connection</th>
                        <th className='px-2 py-1 text-left'>Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map(a => (
                        <tr key={a.id} className='border-t border-slate-800/50 hover:bg-slate-800/30'>
                          <td className='px-2 py-1 whitespace-nowrap'>{new Date(a.createdAt).toLocaleString()}</td>
                          <td className='px-2 py-1 font-mono'>{a.action}</td>
                          <td className='px-2 py-1'>{a.key || '—'}</td>
                          <td className='px-2 py-1 text-slate-400'>{a.actor || 'system'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </SectionCard>
        {/* Legacy OAuth providers UI removed */}
      </section>

      {showConnModal && (
        <ConnectionModal
          connectionKey={editConnKey}
          variables={variables||[]}
          onClose={(changed)=>{ setShowConnModal(false); if (changed) loadAll(); }} />
      )}
      {confirmDel && (
        <ConfirmDeleteDialog data={confirmDel} onCancel={()=>setConfirmDel(null)} onConfirm={async(key)=>{ try { await fetch(`/api/orgs/connections?key=${encodeURIComponent(key)}`, { method: 'DELETE' }); } finally { setConfirmDel(null); loadAll(); } }} />
      )}
    </div>
  );
}

// Helper to generate a unique key from a name
function generateKeyFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing dashes
    .slice(0, 50)                   // Limit length
    || 'connection';               // Fallback if empty
}

function ConnectionModal({ connectionKey, variables, onClose }: { connectionKey: string | null; variables: VariableMeta[]; onClose: (changed:boolean)=>void }) {
  const [key, setKey] = useState(connectionKey || '');
  const [label, setLabel] = useState('');
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(!!connectionKey); // Track if user manually edited key
  const [authType, setAuthType] = useState('apiKey');
  const [baseUrl, setBaseUrl] = useState('');
  const [scopes, setScopes] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVar, setApiKeyVar] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // OAuth2 specific fields
  const [tokenUrl, setTokenUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientIdVar, setClientIdVar] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [clientSecretVar, setClientSecretVar] = useState('');
  const [audience, setAudience] = useState('');
  const [audienceVar, setAudienceVar] = useState('');
  // removed prompt

  useEffect(()=>{ (async()=>{ if(!connectionKey) return; try { const r = await fetch('/api/orgs/connections'); if (r.ok) { const j = await r.json(); const c = (j.connections||[]).find((x:any)=>x.key===connectionKey); if (c) { setKey(c.key); setLabel(c.label||''); setAuthType(c.auth_type); setBaseUrl(c.base_url||''); setScopes(Array.isArray(c.scopes)?c.scopes.join(' '):''); if (c.api_key_ref_key) setApiKeyVar(c.api_key_ref_key); } } } catch {} })(); }, [connectionKey]);

  const submit = async () => {
    setLoading(true); setMsg(null);
    try {
      if (!key.trim()) throw new Error('Key required');
      if (authType === 'oauth2') {
        // Use existing oauth providers endpoint to store details (legacy system for now)
  const body: any = { provider: key.trim(), token_url: tokenUrl, scopes: scopes.trim() || undefined };
        const extra: Record<string,string|boolean> = {};
  if (audienceVar) extra.audience_var = audienceVar; else if (audience) extra.audience = audience;
        if (Object.keys(extra).length) body.extra_params = extra;
  if (clientIdVar) body.client_id_var = clientIdVar; else if (clientId) body.client_id = clientId;
  if (clientSecretVar) body.client_secret_var = clientSecretVar; else if (clientSecret) body.client_secret = clientSecret;
        const r = await fetch('/api/oauth/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Save failed');
        setMsg('Saved');
        onClose(true);
      } else {
        const body: any = { key, label: label?.trim() || undefined, auth_type: authType, base_url: baseUrl || undefined, scopes: scopes.trim()? scopes.trim().split(/[ ,]+/): [] };
        if (apiKeyVar) body.apiKey_var = apiKeyVar; else if (apiKey) body.apiKey = apiKey;
        if (connectionKey && !apiKeyVar && !apiKey) {
          // do not clear existing secret unless explicitly changed
        }
        const r = await fetch('/api/orgs/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Save failed');
        setMsg('Saved');
        onClose(true);
      }
    } catch(e:any) { setMsg(e.message || 'Failed'); } finally { setLoading(false); }
  };

  const removeApiKeyRef = async () => {
    setApiKeyVar('');
  };

  return (
    <Modal
      open={true}
      onClose={()=>onClose(false)}
      title={connectionKey ? 'Edit Connection' : 'New Connection'}
      titleIcon={<FiLink className="text-fuchsia-400" />}
      size="xl"
      footer={
        <>
          {msg && <span className='text-sm text-slate-400 mr-auto'>{msg}</span>}
          <button onClick={()=>onClose(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-sm">
            Cancel
          </button>
          <Button onClick={submit} disabled={loading || !key.trim()}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div className='md:col-span-2'>
            <label className='block text-sm text-slate-400 mb-1'>Label</label>
            <Input 
              value={label} 
              onChange={e => {
                setLabel(e.target.value);
                if (!keyManuallyEdited && !connectionKey) {
                  setKey(generateKeyFromName(e.target.value));
                }
              }} 
              placeholder='Friendly name e.g. "Docs API (Production)"' 
            />
          </div>
          <div className='md:col-span-2'>
            <label className='block text-sm text-slate-400 mb-1'>Key</label>
            <Input 
              value={key} 
              onChange={e => {
                setKey(e.target.value);
                setKeyManuallyEdited(true);
              }} 
              mono 
              disabled={!!connectionKey} 
              placeholder='auto-generated from label'
            />
            {!connectionKey && (
              <p className='text-xs text-slate-500 mt-1'>Unique identifier. Auto-generated from label, or enter your own.</p>
            )}
          </div>
          <div>
            <label className='block text-sm text-slate-400 mb-1'>Auth Type</label>
            <select value={authType} onChange={e=>setAuthType(e.target.value)} className='w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500'>
              <option value='apiKey'>apiKey</option>
              <option value='oauth2'>oauth2</option>
            </select>
          </div>
          <div>
            <label className='block text-sm text-slate-400 mb-1'>Base URL (optional)</label>
            <Input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder='https://api.example.com' />
          </div>
          <div className='md:col-span-2'>
            <label className='block text-sm text-slate-400 mb-1'>Scopes (space or comma separated)</label>
            <Input value={scopes} onChange={e=>setScopes(e.target.value)} />
          </div>
          {authType === 'oauth2' && (
            <>
              <div className='md:col-span-2'>
                <label className='block text-sm text-slate-400 mb-1'>Token URL</label>
                <Input value={tokenUrl} onChange={e=>setTokenUrl(e.target.value)} placeholder='https://id.example.com/oauth/token' />
              </div>
              <div>
                <label className='block text-sm text-slate-400 mb-1'>Client ID</label>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <Input value={clientId} onChange={e=>{ setClientId(e.target.value); if (e.target.value) setClientIdVar(''); }} placeholder='client id' />
                  </div>
                  <select value={clientIdVar} onChange={e=>{ setClientIdVar(e.target.value); if (e.target.value) setClientId(''); }} className='w-40 rounded-lg bg-slate-800 border border-slate-700 px-2 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500'>
                    <option value=''>Var…</option>
                    {variables.sort((a,b)=>a.key.localeCompare(b.key)).map(v=> <option key={v.id} value={v.key}>{v.key}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className='block text-sm text-slate-400 mb-1'>Client Secret (optional)</label>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <Input value={clientSecret} onChange={e=>{ setClientSecret(e.target.value); if (e.target.value) setClientSecretVar(''); }} placeholder='••••••••' />
                  </div>
                  <select value={clientSecretVar} onChange={e=>{ setClientSecretVar(e.target.value); if (e.target.value) setClientSecret(''); }} className='w-40 rounded-lg bg-slate-800 border border-slate-700 px-2 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500'>
                    <option value=''>Var…</option>
                    {variables.sort((a,b)=>a.key.localeCompare(b.key)).map(v=> <option key={v.id} value={v.key}>{v.key}</option>)}
                  </select>
                </div>
              </div>
              <div className='md:col-span-2'>
                <label className='block text-sm text-slate-400 mb-1'>Audience (optional)</label>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <Input value={audience} onChange={e=>{ setAudience(e.target.value); if (e.target.value) setAudienceVar(''); }} placeholder='https://api.example.com' />
                  </div>
                  <select value={audienceVar} onChange={e=>{ setAudienceVar(e.target.value); if (e.target.value) setAudience(''); }} className='w-40 rounded-lg bg-slate-800 border border-slate-700 px-2 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500'>
                    <option value=''>Var…</option>
                    {variables.sort((a,b)=>a.key.localeCompare(b.key)).map(v=> <option key={v.id} value={v.key}>{v.key}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          {authType === 'apiKey' && (
            <div className='md:col-span-2 space-y-3'>
              <div className='flex items-center gap-2'>
                <label className='text-sm text-slate-400'>API Key Source</label>
                {apiKeyVar && <Button variant='ghost' className='h-6 px-2 text-xs' onClick={removeApiKeyRef}>Clear Variable Ref</Button>}
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs text-slate-500 mb-1'>Reference Variable</label>
                  <select value={apiKeyVar} onChange={e=>{ setApiKeyVar(e.target.value); if (e.target.value) setApiKey(''); }} className='w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500'>
                    <option value=''>— Select variable —</option>
                    {variables.sort((a,b)=>a.key.localeCompare(b.key)).map(v=> <option key={v.id} value={v.key}>{v.key}</option>)}
                  </select>
                </div>
                <div>
                  <label className='block text-xs text-slate-500 mb-1'>Or Enter Raw API Key</label>
                  <Input value={apiKey} onChange={e=>{ setApiKey(e.target.value); if (e.target.value) setApiKeyVar(''); }} placeholder='sk_live_***' />
                </div>
              </div>
              <p className='text-xs text-slate-500'>Referencing a variable centralizes rotation and prevents distributing raw credentials.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Reusable components
function SectionCard({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className='relative rounded-xl border border-slate-800/70 bg-slate-900/60 backdrop-blur px-5 py-6 shadow-lg shadow-black/30 space-y-4'>
      <div className='flex items-center gap-3 flex-wrap'>
        <div className='text-[15px] font-medium text-slate-200 tracking-wide'>{title}</div>
        <div className='ml-auto flex items-center gap-2'>{actions}</div>
      </div>
      {children}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: 'violet'|'sky'|'slate' }) {
  const map: Record<string,string> = {
    violet: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
    sky: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
    slate: 'bg-slate-700/30 text-slate-400 ring-slate-700/40'
  };
  return <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ring-1 ${map[color]}`}>{children}</span>;
}

function ConfirmDeleteDialog({ data, onCancel, onConfirm }: { data: { key: string; actions: any[] }; onCancel: ()=>void; onConfirm:(key:string)=>void }) {
  const { key, actions } = data;
  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Delete Connection"
      titleIcon={<FiTrash2 className="text-rose-400" />}
      size="md"
      footer={
        <>
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-sm">
            Cancel
          </button>
          <Button variant='danger' onClick={()=>onConfirm(key)}>
            Delete
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <p className='text-sm text-slate-300'>
          You are about to delete <code className='px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono'>{key}</code>. This cannot be undone.
        </p>
        <div>
          <label className='block text-sm text-slate-400 mb-2'>Impacted Actions ({actions.length})</label>
          {actions.length === 0 && <p className='text-sm text-slate-500'>No actions currently reference this connection.</p>}
          {actions.length > 0 && (
            <ul className='max-h-40 overflow-auto text-sm space-y-1 list-disc pl-5 marker:text-slate-500'>
              {actions.map(a=> <li key={a.id}><span className='font-mono'>{a.id}</span> – {a.title || 'Untitled action'}</li>)}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Legacy ProviderModal & auxiliary inputs removed

