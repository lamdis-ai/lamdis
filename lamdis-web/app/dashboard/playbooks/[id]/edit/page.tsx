"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiPlus, FiTrash2, FiRefreshCw } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";
import ApprovalChainQuickCreate from "@/components/playbooks/ApprovalChainQuickCreate";

interface ConnectorInstance { id: string; name: string }
interface DocumentTemplate { id: string; name: string; key: string }
interface ApprovalChain { id: string; name: string }

const BINDING_ROLES = [
  { value: "document_store",     label: "Document store" },
  { value: "approver_directory", label: "Approver directory" },
  { value: "evidence_archive",   label: "Evidence archive" },
  { value: "notification",       label: "Notification" },
  { value: "signature",          label: "Signature" },
  { value: "crm",                label: "CRM" },
  { value: "fax",                label: "Fax" },
  { value: "custom",             label: "Custom" },
];

interface StepDraft { sequence: number; title: string; description: string; requiresApproval: boolean; approvalChainId: string }
interface BindingDraft { role: string; connectorInstanceId: string }
interface DocReqDraft { documentTemplateId: string; required: boolean }

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";
const sectionCls = "rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4";

export default function EditPlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [showAuthError, setShowAuthError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [connectors, setConnectors] = useState<ConnectorInstance[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocumentTemplate[]>([]);
  const [approvalChains, setApprovalChains] = useState<ApprovalChain[]>([]);

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [approvalChainId, setApprovalChainId] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [bindings, setBindings] = useState<BindingDraft[]>([]);
  const [docReqs, setDocReqs] = useState<DocReqDraft[]>([]);

  const [showChainCreate, setShowChainCreate] = useState(false);
  const [chainCreateForStep, setChainCreateForStep] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, cRes, dRes, aRes] = await Promise.all([
          authFetch(`/api/orgs/playbooks/${id}`),
          authFetch("/api/orgs/connector-instances"),
          authFetch("/api/orgs/document-templates"),
          authFetch("/api/orgs/approval-chains"),
        ]);
        if (!pRes.ok) throw new Error(`Failed (${pRes.status})`);
        const p = await pRes.json();
        setName(p.name || "");
        setSummary(p.summary || "");
        setApprovalChainId(p.approvalChainId || "");
        setSteps((p.procedureSteps || []).map((s: any, i: number) => ({
          sequence: s.sequence ?? i + 1,
          title: s.title || "",
          description: s.description || "",
          requiresApproval: s.requiresApproval || false,
          approvalChainId: s.approvalChainId || "",
        })));
        setBindings((p.bindings || []).map((b: any) => ({
          role: b.role,
          connectorInstanceId: b.connectorInstanceId || "",
        })));
        setDocReqs((p.documents || []).map((d: any) => ({
          documentTemplateId: d.documentTemplateId,
          required: d.required ?? true,
        })));
        if (cRes.ok) setConnectors((await cRes.json())?.items || []);
        if (dRes.ok) setDocTemplates((await dRes.json())?.items || []);
        if (aRes.ok) setApprovalChains((await aRes.json())?.items || []);
        setError(null);
      } catch (e: any) {
        if (isAuthError(e)) setShowAuthError(true);
        else setError(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function addStep() {
    setSteps((s) => [...s, { sequence: s.length + 1, title: "", description: "", requiresApproval: false, approvalChainId: "" }]);
  }
  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i).map((step, idx) => ({ ...step, sequence: idx + 1 })));
  }
  function addBinding() { setBindings((b) => [...b, { role: "document_store", connectorInstanceId: "" }]); }
  function updateBinding(i: number, patch: Partial<BindingDraft>) { setBindings((b) => b.map((bd, idx) => (idx === i ? { ...bd, ...patch } : bd))); }
  function removeBinding(i: number) { setBindings((b) => b.filter((_, idx) => idx !== i)); }
  function addDocReq() { setDocReqs((d) => [...d, { documentTemplateId: "", required: true }]); }
  function updateDocReq(i: number, patch: Partial<DocReqDraft>) { setDocReqs((d) => d.map((dr, idx) => (idx === i ? { ...dr, ...patch } : dr))); }
  function removeDocReq(i: number) { setDocReqs((d) => d.filter((_, idx) => idx !== i)); }

  function openChainCreate(stepIndex: number) {
    setChainCreateForStep(stepIndex);
    setShowChainCreate(true);
  }
  function onChainCreated(chain: { id: string; name: string }) {
    setApprovalChains((c) => [...c, chain]);
    if (chainCreateForStep !== null) updateStep(chainCreateForStep, { approvalChainId: chain.id });
    setShowChainCreate(false);
    setChainCreateForStep(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        name: name.trim(),
        summary: summary.trim() || null,
        approvalChainId: approvalChainId || null,
        procedureSteps: steps
          .filter((s) => s.title.trim())
          .map((s) => ({
            sequence: s.sequence,
            title: s.title.trim(),
            description: s.description.trim() || undefined,
            requiresApproval: s.requiresApproval,
            approvalChainId: s.approvalChainId || undefined,
          })),
        systemBindings: bindings.filter((b) => b.connectorInstanceId),
        documentRequirements: docReqs.filter((d) => d.documentTemplateId),
      };
      const res = await authFetch(`/api/orgs/playbooks/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      router.push(`/dashboard/playbooks/${id}`);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to save");
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo={`/dashboard/playbooks/${id}/edit`} />
      <ApprovalChainQuickCreate open={showChainCreate} onClose={() => { setShowChainCreate(false); setChainCreateForStep(null); }} onCreated={onChainCreated} />

      <Link href={`/dashboard/playbooks/${id}`} className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to playbook
      </Link>

      <h1 className="text-2xl font-semibold text-slate-100">Edit Playbook</h1>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basics */}
        <div className={sectionCls}>
          <h2 className="text-sm font-medium text-slate-200">Basics</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Default approval chain</label>
              <select className={`${selectCls} w-full`} value={approvalChainId} onChange={(e) => {
                if (e.target.value === "__create__") { setChainCreateForStep(null); setShowChainCreate(true); return; }
                setApprovalChainId(e.target.value);
              }}>
                <option value="">None</option>
                {approvalChains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__create__">+ Create new chain…</option>
              </select>
              <p className="text-[11px] text-slate-600 mt-1">
                Used for steps that require approval but don't specify their own chain.
              </p>
            </div>
          </div>
          <div>
            <label className={labelCls}>Summary</label>
            <textarea className={inputCls} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
        </div>

        {/* Steps */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-200">Procedure steps</h2>
            <button type="button" onClick={addStep} className="inline-flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300">
              <FiPlus size={12} /> Add step
            </button>
          </div>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-6">{i + 1}.</span>
                  <input className={`${inputCls} flex-1`} placeholder="Step title" value={s.title} onChange={(e) => updateStep(i, { title: e.target.value })} />
                  <button type="button" onClick={() => removeStep(i)} className="text-slate-600 hover:text-rose-400"><FiTrash2 size={14} /></button>
                </div>
                <textarea className={inputCls} rows={2} placeholder="Description (optional)" value={s.description} onChange={(e) => updateStep(i, { description: e.target.value })} />
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={s.requiresApproval} onChange={(e) => updateStep(i, { requiresApproval: e.target.checked, approvalChainId: e.target.checked ? s.approvalChainId : "" })} />
                  Requires approval
                </label>
                {s.requiresApproval && (
                  <div className="pl-6 flex items-center gap-2">
                    <label className="text-xs text-slate-400">Approval chain:</label>
                    <select className={`${selectCls} flex-1`} value={s.approvalChainId} onChange={(e) => {
                      if (e.target.value === "__create__") { openChainCreate(i); return; }
                      updateStep(i, { approvalChainId: e.target.value });
                    }}>
                      <option value="">None (uses default)</option>
                      {approvalChains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      <option value="__create__">+ Create new chain…</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bound systems */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-200">Bound systems</h2>
            <button type="button" onClick={addBinding} disabled={connectors.length === 0} className="inline-flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 disabled:text-slate-600">
              <FiPlus size={12} /> Add binding
            </button>
          </div>
          {connectors.length === 0 ? (
            <div className="text-xs text-slate-500 italic">
              No connector instances yet.{" "}
              <a href="/dashboard/connections" target="_blank" rel="noopener" className="text-fuchsia-400 hover:text-fuchsia-300">Add one in Connections</a>
            </div>
          ) : bindings.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No bindings.</div>
          ) : (
            <div className="space-y-2">
              {bindings.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className={`${selectCls} w-44`} value={b.role} onChange={(e) => updateBinding(i, { role: e.target.value })}>
                    {BINDING_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <select className={`${selectCls} flex-1`} value={b.connectorInstanceId} onChange={(e) => updateBinding(i, { connectorInstanceId: e.target.value })} required>
                    <option value="">Pick a connector…</option>
                    {connectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" onClick={() => removeBinding(i)} className="text-slate-600 hover:text-rose-400"><FiTrash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document requirements */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-200">Required documents</h2>
            <button type="button" onClick={addDocReq} disabled={docTemplates.length === 0} className="inline-flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 disabled:text-slate-600">
              <FiPlus size={12} /> Add document
            </button>
          </div>
          {docTemplates.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No document templates yet.</div>
          ) : docReqs.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No required documents.</div>
          ) : (
            <div className="space-y-2">
              {docReqs.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className={`${selectCls} flex-1`} value={d.documentTemplateId} onChange={(e) => updateDocReq(i, { documentTemplateId: e.target.value })} required>
                    <option value="">Pick a document template…</option>
                    {docTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input type="checkbox" checked={d.required} onChange={(e) => updateDocReq(i, { required: e.target.checked })} />
                    Required
                  </label>
                  <button type="button" onClick={() => removeDocReq(i)} className="text-slate-600 hover:text-rose-400"><FiTrash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/dashboard/playbooks/${id}`} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
