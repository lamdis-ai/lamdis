"use client";
import Link from 'next/link';
import Table from '@/components/base/Table';
import AlertModal from '@/components/base/AlertModal';
import { useEffect, useMemo, useState } from 'react';
import CodeNoCodeToggle from '@/components/base/CodeNoCodeToggle';
import Tabs from '@/components/base/Tabs';

export const dynamic = 'force-dynamic';

type ActionDoc = { 
  id: string; 
  title?: string; 
  description?: string; 
  input_schema?: any; 
  output_schema?: any; 
  method?: string; 
  path?: string; 
  headers?: any; 
  body?: any; 
  enabled?: boolean; 
  tags?: string[];
  isMock?: boolean;
  static_response?: {
    content?: any;
    content_type?: string;
    status?: number;
    headers?: Record<string, string>;
  };
};

export default function ActionsPage() {
  const [actions, setActions] = useState<ActionDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ActionDoc | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ActionDoc | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'http' | 'mock'>('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      const r = await fetch('/api/orgs/actions', { cache: 'no-store' });
      if (!r.ok) { setActions([]); return; }
      const j = await r.json();
      setActions(Array.isArray(j.actions) ? j.actions : []);
      setError(null);
    } catch (e:any) { setError(e?.message || 'Failed to load'); setActions([]); }
  }

  async function removeAction(id: string) {
    try {
      const res = await fetch(`/api/orgs/actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
      await load();
    } catch (e:any) {
      setError(e?.message || 'Failed to delete');
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Actions</h1>
        <p className="text-sm md:text-base text-slate-400 max-w-2xl">
          Actions define HTTP operations (method, path, body schema). 
          ActionBindings supply the baseUrl and auth for executing Actions in specific Environments.
        </p>
      </header>

      <section className="space-y-4">
        {error && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="text-[15px] font-medium text-slate-200 tracking-wide">Configured Actions</div>
          <button 
            onClick={() => { setEditing({ id: '', title: '' }); setShowNew(true); }} 
            className="ml-auto px-4 py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white text-sm font-medium shadow hover:brightness-110 transition"
          >
            New Action
          </button>
        </div>
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, ID, or description..."
          className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">Type:</span>
            {(['all', 'http', 'mock'] as const).map(v => (
              <button key={v} onClick={() => setTypeFilter(v)} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${typeFilter === v ? 'border-fuchsia-500/50 bg-fuchsia-950/30 text-fuchsia-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>
                {v === 'all' ? 'All' : v === 'http' ? 'HTTP' : 'Mock'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">Method:</span>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="text-[11px] px-2 py-1 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 focus:outline-none">
              <option value="all">All</option>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">Status:</span>
            {(['all', 'enabled', 'disabled'] as const).map(v => (
              <button key={v} onClick={() => setStatusFilter(v)} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${statusFilter === v ? 'border-fuchsia-500/50 bg-fuchsia-950/30 text-fuchsia-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {(search || typeFilter !== 'all' || methodFilter !== 'all' || statusFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setTypeFilter('all'); setMethodFilter('all'); setStatusFilter('all'); }} className="text-[11px] text-slate-500 hover:text-slate-300 underline decoration-dotted">
              Clear filters
            </button>
          )}
        </div>

        {actions === null ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : (() => {
          const filtered = actions.filter(a => {
            if (search) {
              const q = search.toLowerCase();
              if (!(a.title || '').toLowerCase().includes(q) &&
                  !(a.id || '').toLowerCase().includes(q) &&
                  !(a.description || '').toLowerCase().includes(q)) return false;
            }
            if (typeFilter === 'http' && a.isMock) return false;
            if (typeFilter === 'mock' && !a.isMock) return false;
            if (methodFilter !== 'all' && (a.method || 'GET') !== methodFilter) return false;
            if (statusFilter === 'enabled' && a.enabled === false) return false;
            if (statusFilter === 'disabled' && a.enabled !== false) return false;
            return true;
          });
          return (
            <>
              <div className="text-[11px] text-slate-500">
                Showing {filtered.length} of {actions.length} action{actions.length !== 1 ? 's' : ''}
              </div>
              <Table
                data={filtered}
            empty={<span className="text-xs text-slate-500">No actions yet.</span>}
            columns={[
              {
                key: 'id',
                header: 'ID',
                render: (a: ActionDoc) => <span className="font-mono text-slate-200">{a.id}</span>,
              },
              {
                key: 'title',
                header: 'Title',
                render: (a: ActionDoc) => <span className="text-slate-300">{a.title || ''}</span>,
              },
              {
                key: 'method',
                header: 'Method',
                render: (a: ActionDoc) => <span className="font-mono text-slate-400">{a.method || 'GET'}</span>,
              },
              {
                key: 'path',
                header: 'Path',
                render: (a: ActionDoc) => <span className="font-mono text-slate-400 truncate max-w-[200px]" title={a.path || ''}>{a.path || '—'}</span>,
              },
              {
                key: 'type',
                header: 'Type',
                render: (a: ActionDoc) => (
                  a.isMock ? (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">Mock</span>
                  ) : (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-slate-700/30 text-slate-400 ring-1 ring-slate-700/30">HTTP</span>
                  )
                ),
              },
              {
                key: 'enabled',
                header: 'Status',
                render: (a: ActionDoc) => (
                  a.enabled === false ? (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-slate-700/30 text-slate-400 ring-1 ring-slate-700/30">Disabled</span>
                  ) : (
                    <span className="text-[10px] inline-flex items-center px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">Enabled</span>
                  )
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (a: ActionDoc) => (
                  <div className="flex items-center gap-3">
                    <button
                      className="text-[11px] underline decoration-dotted underline-offset-2 text-slate-400 hover:text-slate-200"
                      onClick={() => { setEditing(a); setShowNew(true); }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[11px] underline decoration-dotted underline-offset-2 text-rose-400 hover:text-rose-300"
                      onClick={() => setConfirmDelete(a)}
                    >
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
            </>
          );
        })()}
      </section>

      {/* Delete confirm modal */}
      <AlertModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Action?"
        message={
          confirmDelete ? (
            <div>
              Are you sure you want to delete <code className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/60">{confirmDelete.id}</code>? This action cannot be undone.
            </div>
          ) : ''
        }
        variant="error"
        primaryLabel="Delete"
        onPrimary={async () => {
          if (confirmDelete) {
            await removeAction(confirmDelete.id);
            setConfirmDelete(null);
          }
        }}
      />

      {showNew && editing && (
        <ActionModal doc={editing} onClose={async (changed) => { setShowNew(false); setEditing(null); if (changed) await load(); }} />
      )}
    </div>
  );
}

function ActionModal({ doc, onClose }: { doc: ActionDoc; onClose: (changed: boolean) => void }) {
  function parseJsonSoft(txt: string, fallback: any = {}): any { 
    try { return txt ? JSON.parse(txt) : fallback; } catch { return fallback; } 
  }

  const [id, setId] = useState(doc.id || '');
  const [idTouched, setIdTouched] = useState<boolean>(!!doc.id);
  const [title, setTitle] = useState(doc.title || '');
  const [description, setDescription] = useState(doc.description || '');
  const [method, setMethod] = useState(doc.method || 'POST');
  const [path, setPath] = useState(doc.path || '');
  const [headers, setHeaders] = useState(JSON.stringify(doc.headers || {}, null, 2));
  const [bodyText, setBodyText] = useState(JSON.stringify(doc.body || {}, null, 2));
  const [inputSchema, setInputSchema] = useState(JSON.stringify(doc.input_schema || { 
    $schema: 'https://json-schema.org/draft/2020-12/schema', 
    type: 'object', 
    properties: {}, 
    additionalProperties: false 
  }, null, 2));
  const [outputSchema, setOutputSchema] = useState(JSON.stringify(doc.output_schema || { 
    $schema: 'https://json-schema.org/draft/2020-12/schema', 
    type: 'object', 
    properties: {}, 
    additionalProperties: true 
  }, null, 2));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showGenerators, setShowGenerators] = useState(false);
  // Mock action state
  const [isMock, setIsMock] = useState(doc.isMock || false);
  const [mockStatus, setMockStatus] = useState(String(doc.static_response?.status ?? 200));
  const [mockContentType, setMockContentType] = useState(doc.static_response?.content_type || 'application/json');
  const [mockContent, setMockContent] = useState(
    typeof doc.static_response?.content === 'string' 
      ? doc.static_response.content 
      : JSON.stringify(doc.static_response?.content ?? { message: 'Mock response' }, null, 2)
  );
  const [mockHeaders, setMockHeaders] = useState(JSON.stringify(doc.static_response?.headers || {}, null, 2));

  const inputKeys = useMemo(() => { 
    try { 
      const s = JSON.parse(inputSchema || '{}'); 
      const props = s?.properties && typeof s.properties === 'object' ? Object.keys(s.properties) : []; 
      return props; 
    } catch { return []; } 
  }, [inputSchema]);
  const tokens = useMemo(() => inputKeys.map(k => `{${k}}`), [inputKeys]);

  function insertTokenIntoPath(tok: string) {
    setPath((p: string) => (p || '').includes(tok) ? p : `${p || ''}${tok}`);
  }
  function mergeHeaderToken(key: string) {
    try {
      const obj = parseJsonSoft(headers, {});
      if (!obj[key]) obj[key] = `{${key}}`;
      setHeaders(JSON.stringify(obj, null, 2));
    } catch {}
  }
  function mergeBodyToken(key: string) {
    const obj = parseJsonSoft(bodyText, {});
    if (typeof obj === 'object' && obj !== null) {
      if (!obj[key]) obj[key] = `{${key}}`;
      setBodyText(JSON.stringify(obj, null, 2));
    }
  }

  async function save() {
    setMsg(null); 
    setSaving(true);
    try {
      // Parse mock content - try as JSON first, fallback to string
      let parsedMockContent: any = mockContent;
      if (mockContentType === 'application/json') {
        try {
          parsedMockContent = JSON.parse(mockContent);
        } catch {
          // Keep as string if invalid JSON
        }
      }
      
      const payload: any = {
        id,
        title: title || id,
        description,
        method,
        path,
        headers: parseJsonSoft(headers, {}),
        body: parseJsonSoft(bodyText, undefined),
        input_schema: JSON.parse(inputSchema || '{}'),
        output_schema: JSON.parse(outputSchema || '{}'),
        enabled: true,
        isMock,
      };
      
      // Include static_response if mock is enabled, clear it if disabled
      if (isMock) {
        payload.static_response = {
          content: parsedMockContent,
          content_type: mockContentType,
          status: parseInt(mockStatus, 10) || 200,
          headers: parseJsonSoft(mockHeaders, undefined),
        };
      } else {
        // Explicitly clear static_response when mock is disabled
        payload.static_response = null;
      }
      
      // Use PUT for existing actions (editing), POST for new actions
      const isEdit = !!doc.id;
      const url = isEdit 
        ? `/api/orgs/actions/${encodeURIComponent(id)}`
        : '/api/orgs/actions';
      
      const r = await fetch(url, { 
        method: isEdit ? 'PUT' : 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to save');
      setMsg('Saved');
      onClose(true);
    } catch (e: any) { 
      setMsg(e?.message || 'Failed'); 
    } finally { 
      setSaving(false); 
    }
  }

  // Auto-generate ID from Title
  useEffect(() => {
    if (doc.id) return; // don't override existing id on edit
    if (idTouched) return; // keep auto-updating until the user edits the ID
    const slug = (title || '').trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    setId(slug);
  }, [title, doc.id, idTouched]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-5xl max-h-[88vh] flex flex-col bg-slate-950/85 backdrop-blur-xl border border-slate-800/70 rounded-xl shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3 px-5 pt-4 pb-2 text-slate-200">
          <div className="text-base font-medium tracking-wide">{doc.id ? 'Edit action' : 'Create action'}</div>
          <button onClick={() => onClose(false)} className="ml-auto text-xs underline decoration-dotted text-slate-400 hover:text-slate-200">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 text-slate-200">
          <Tabs variant="dark" items={[
            { key: 'basics', label: 'Basics', content: (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <LabeledInput label="Title" value={title} onChange={setTitle} placeholder="Create Account" />
                <LabeledInput label="Action ID" value={id} onChange={(v) => { setId(v); setIdTouched(true); }} placeholder="create-account" />
                <LabeledInput label="Description" value={description} onChange={setDescription} placeholder="Creates a new account via POST /accounts" full />
              </div>
            )},
            { key: 'input', label: 'Input Schema', content: (
              <div className="space-y-3 text-xs text-slate-400">
                <div>
                  <div className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Input Schema</div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Define the inputs this action expects so test steps can pass data in. Use these fields as tokens like <code className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/60">{`{user_id}`}</code> in the Request tab.
                  </p>
                </div>
                <CodeNoCodeToggle kind="schema" value={inputSchema} onChange={setInputSchema} />
              </div>
            )},
            { key: 'request', label: 'Request', content: (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <LabeledInput label="HTTP Method" value={method} onChange={setMethod} placeholder="GET, POST, PUT, DELETE, etc." />
                  <LabeledInput label="Path" value={path} onChange={setPath} placeholder="/v1/users/{user_id}" />
                </div>
                {tokens.length > 0 && (
                  <div className="text-[11px] text-slate-300 space-y-2">
                    <div className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Available tokens</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {inputKeys.map(k => (
                        <div key={k} className="flex items-center justify-between gap-2">
                          <code className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/60">{`{${k}}`}</code>
                          <div className="ml-auto flex items-center gap-1">
                            <button type="button" onClick={() => insertTokenIntoPath(`{${k}}`)} className="px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-200 hover:bg-slate-800/60">Path</button>
                            <button type="button" onClick={() => mergeHeaderToken(k)} className="px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-200 hover:bg-slate-800/60">Header</button>
                            <button type="button" onClick={() => mergeBodyToken(k)} className="px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-200 hover:bg-slate-800/60">Body</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <TestDataGenerators 
                  setPath={setPath} 
                  setHeaders={setHeaders} 
                  setBodyText={setBodyText} 
                  showGenerators={showGenerators}
                  setShowGenerators={setShowGenerators}
                />
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Headers</div>
                  <CodeNoCodeToggle kind="headers" value={headers} onChange={setHeaders} />
                </div>
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Body (example/default)</div>
                  <CodeNoCodeToggle kind="json" value={bodyText} onChange={setBodyText} />
                </div>
                <div className="text-[11px] text-slate-400">
                  Tip: Use tokens like {tokens.slice(0, 3).map(t => <code key={t} className="mx-1 px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/60">{t}</code>)} in path, headers, or body. Base URL comes from the ActionBinding at runtime.
                </div>
              </div>
            )},
            { key: 'output', label: 'Output Schema', content: (
              <div className="space-y-2 text-xs text-slate-400">
                <div className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Output Schema</div>
                <CodeNoCodeToggle kind="schema" value={outputSchema} onChange={setOutputSchema} />
              </div>
            )},
            { key: 'mock', label: isMock ? '🟡 Mock Response' : 'Mock Response', content: (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isMock} 
                      onChange={(e) => setIsMock(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
                    />
                    <div>
                      <div className="text-sm font-medium text-amber-300">Enable Mock Response</div>
                      <div className="text-[11px] text-slate-400">
                        When enabled, this action returns a static response instead of making real HTTP calls. 
                        Perfect for testing without integration work.
                      </div>
                    </div>
                  </label>
                </div>
                
                {isMock && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Status Code</label>
                        <select 
                          value={mockStatus} 
                          onChange={(e) => setMockStatus(e.target.value)}
                          className="w-full px-3 py-2 rounded-md bg-slate-950/60 border border-slate-800/70 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        >
                          <option value="200">200 OK</option>
                          <option value="201">201 Created</option>
                          <option value="204">204 No Content</option>
                          <option value="400">400 Bad Request</option>
                          <option value="401">401 Unauthorized</option>
                          <option value="403">403 Forbidden</option>
                          <option value="404">404 Not Found</option>
                          <option value="500">500 Internal Server Error</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Content Type</label>
                        <select 
                          value={mockContentType} 
                          onChange={(e) => setMockContentType(e.target.value)}
                          className="w-full px-3 py-2 rounded-md bg-slate-950/60 border border-slate-800/70 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        >
                          <option value="application/json">application/json</option>
                          <option value="text/plain">text/plain</option>
                          <option value="text/html">text/html</option>
                          <option value="application/xml">application/xml</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Response Body</div>
                      <textarea 
                        value={mockContent}
                        onChange={(e) => setMockContent(e.target.value)}
                        placeholder='{"message": "Success", "data": {...}}'
                        rows={8}
                        className="w-full px-3 py-2 rounded-md bg-slate-950/60 border border-slate-800/70 text-slate-200 placeholder-slate-600 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-y"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMockContent(JSON.stringify({ success: true, data: { id: "mock-123", name: "Example" } }, null, 2))}
                          className="text-[10px] px-2 py-1 rounded border border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        >
                          Insert Example JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const formatted = JSON.stringify(JSON.parse(mockContent), null, 2);
                              setMockContent(formatted);
                            } catch {}
                          }}
                          className="text-[10px] px-2 py-1 rounded border border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        >
                          Format JSON
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">Response Headers (optional)</div>
                      <textarea 
                        value={mockHeaders}
                        onChange={(e) => setMockHeaders(e.target.value)}
                        placeholder='{"X-Custom-Header": "value"}'
                        rows={3}
                        className="w-full px-3 py-2 rounded-md bg-slate-950/60 border border-slate-800/70 text-slate-200 placeholder-slate-600 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-y"
                      />
                    </div>

                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <div className="text-[11px] text-slate-400">
                        <strong className="text-slate-300">How it works:</strong> When this action is called, it returns your configured
                        mock response without making real HTTP requests. You can use variable expressions like{' '}
                        <code className="text-emerald-400">{'${var.Amount}'}</code> or{' '}
                        <code className="text-emerald-400">{'${preSteps.step_name.output.id}'}</code>{' '}
                        in the response body — they will be resolved at runtime during test execution.
                      </div>
                    </div>
                  </>
                )}
              </div>
            )},
          ]} />
        </div>
        <div className="border-t border-slate-800/70 px-5 py-4 flex items-center gap-3 bg-slate-950/70 rounded-b-xl">
          <button 
            onClick={save} 
            disabled={saving} 
            className="px-4 py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white text-sm font-medium disabled:opacity-50 shadow hover:brightness-110 transition"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {msg && <span className="text-xs text-slate-400">{msg}</span>}
          <button onClick={() => onClose(false)} className="ml-auto text-xs underline text-slate-400 hover:text-slate-200">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TestDataGenerators({ 
  setPath, setHeaders, setBodyText, showGenerators, setShowGenerators 
}: { 
  setPath: (fn: (p: string) => string) => void; 
  setHeaders: (fn: (h: string) => string) => void; 
  setBodyText: (fn: (b: string) => string) => void;
  showGenerators: boolean;
  setShowGenerators: (v: boolean) => void;
}) {
  const generators = [
    { label: 'Full name', token: '{generateFullName()}', headerKey: 'X-Test-Full-Name' },
    { label: 'First name', token: '{generateFirstName()}', headerKey: 'X-Test-First-Name' },
    { label: 'Last name', token: '{generateLastName()}', headerKey: 'X-Test-Last-Name' },
    { label: 'Email', token: '{generateEmail()}', headerKey: 'X-Test-Email' },
    { label: 'Street', token: '{generateStreet()}', headerKey: 'X-Test-Street' },
    { label: 'City', token: '{generateCity()}', headerKey: 'X-Test-City' },
    { label: 'State', token: '{generateState()}', headerKey: 'X-Test-State' },
    { label: 'ZIP / Postal code', token: '{generateZip()}', headerKey: 'X-Test-Zip' },
    { label: 'Phone', token: '{generatePhone()}', headerKey: 'X-Test-Phone' },
    { label: 'Date of birth', token: '{generateDob()}', headerKey: 'X-Test-Dob' },
    { label: 'Numeric ID (6 digits)', token: '{generateNumericId(6)}', headerKey: 'X-Test-Id6' },
    { label: 'UUID v4', token: '{generateUuid()}', headerKey: 'X-Test-Uuid' },
  ];

  return (
    <div className="text-[11px] text-slate-300 space-y-1">
      <button
        type="button"
        className="flex items-center justify-between w-full text-left tracking-wide font-medium text-[11px] uppercase text-slate-400/80"
        onClick={() => setShowGenerators(!showGenerators)}
      >
        <span>Test data generators</span>
        <span className="text-[10px] text-slate-500">{showGenerators ? 'Hide' : 'Show'}</span>
      </button>
      {showGenerators && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
            {generators.map(g => (
              <div key={g.token} className="flex items-center justify-between gap-2">
                <div className="flex flex-col text-[11px] text-slate-300">
                  <span>{g.label}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{g.token}</span>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setPath((p: string) => `${p || ''}${g.token}`)} className="px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-200 hover:bg-slate-800/60">Path</button>
                  <button type="button" onClick={() => setHeaders(h => {
                    try { const obj = JSON.parse(h || '{}'); obj[g.headerKey] = g.token; return JSON.stringify(obj, null, 2); } catch { return h; }
                  })} className="px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-200 hover:bg-slate-800/60">Header</button>
                  <button type="button" onClick={() => setBodyText(b => `${b || ''}${g.token}`)} className="px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-200 hover:bg-slate-800/60">Body</button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Generator tokens like <code>{`{generateUuid()}`}</code> are resolved at runtime when this action is executed.
          </p>
        </>
      )}
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder, full }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; full?: boolean }) {
  return (
    <label className={(full ? 'md:col-span-2 ' : '') + ' space-y-1 text-xs text-slate-400 block'}>
      <span className="tracking-wide font-medium text-[11px] uppercase text-slate-400/80">{label}</span>
      <input 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder} 
        className="w-full px-3 py-2 rounded-md bg-slate-950/60 border border-slate-800/70 text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-600/70" 
      />
    </label>
  );
}
