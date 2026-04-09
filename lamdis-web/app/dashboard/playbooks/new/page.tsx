"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiPlus, FiTrash2, FiChevronDown, FiChevronUp, FiRefreshCw } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";
import ApprovalChainQuickCreate from "@/components/playbooks/ApprovalChainQuickCreate";

interface ConnectorInstance { id: string; name: string }
interface DocumentTemplate { id: string; name: string; key: string }
interface ApprovalChain { id: string; name: string }
interface Objective { id: string; name: string }

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

export default function NewPlaybookPage() {
  const router = useRouter();
  const [showAuthError, setShowAuthError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [connectors, setConnectors] = useState<ConnectorInstance[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocumentTemplate[]>([]);
  const [approvalChains, setApprovalChains] = useState<ApprovalChain[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);

  const [outcomeTypeId, setOutcomeTypeId] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [steps, setSteps] = useState<StepDraft[]>([
    { sequence: 1, title: "", description: "", requiresApproval: false, approvalChainId: "" },
  ]);
  const [bindings, setBindings] = useState<BindingDraft[]>([]);
  const [docReqs, setDocReqs] = useState<DocReqDraft[]>([]);

  // Quick-create modal
  const [showChainCreate, setShowChainCreate] = useState(false);
  const [chainCreateForStep, setChainCreateForStep] = useState<number | null>(null);

  // Guidance panel
  const [showGuide, setShowGuide] = useState(true);

  async function loadPickers() {
    try {
      const [cRes, dRes, aRes, oRes] = await Promise.all([
        authFetch("/api/orgs/connector-instances"),
        authFetch("/api/orgs/document-templates"),
        authFetch("/api/orgs/approval-chains"),
        authFetch("/api/orgs/outcomes"),
      ]);
      if (cRes.ok) setConnectors((await cRes.json())?.items || []);
      if (dRes.ok) setDocTemplates((await dRes.json())?.items || []);
      if (aRes.ok) setApprovalChains((await aRes.json())?.items || []);
      if (oRes.ok) {
        const data = await oRes.json();
        setObjectives(Array.isArray(data) ? data : data?.outcomeTypes || data?.items || []);
      }
    } catch (e) {
      if (isAuthError(e)) setShowAuthError(true);
    }
  }

  useEffect(() => { loadPickers(); }, []);

  function addStep() {
    setSteps((s) => [...s, { sequence: s.length + 1, title: "", description: "", requiresApproval: false, approvalChainId: "" }]);
  }
  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i).map((step, idx) => ({ ...step, sequence: idx + 1 })));
  }

  function addBinding() {
    setBindings((b) => [...b, { role: "document_store", connectorInstanceId: "" }]);
  }
  function updateBinding(i: number, patch: Partial<BindingDraft>) {
    setBindings((b) => b.map((bd, idx) => (idx === i ? { ...bd, ...patch } : bd)));
  }
  function removeBinding(i: number) {
    setBindings((b) => b.filter((_, idx) => idx !== i));
  }

  function addDocReq() {
    setDocReqs((d) => [...d, { documentTemplateId: "", required: true }]);
  }
  function updateDocReq(i: number, patch: Partial<DocReqDraft>) {
    setDocReqs((d) => d.map((dr, idx) => (idx === i ? { ...dr, ...patch } : dr)));
  }
  function removeDocReq(i: number) {
    setDocReqs((d) => d.filter((_, idx) => idx !== i));
  }

  function openChainCreate(stepIndex: number) {
    setChainCreateForStep(stepIndex);
    setShowChainCreate(true);
  }

  function onChainCreated(chain: { id: string; name: string }) {
    setApprovalChains((c) => [...c, chain]);
    if (chainCreateForStep !== null) {
      updateStep(chainCreateForStep, { approvalChainId: chain.id });
    }
    setShowChainCreate(false);
    setChainCreateForStep(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        name: name.trim(),
        summary: summary.trim() || undefined,
        status,
        outcomeTypeId: outcomeTypeId || undefined,
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

      const res = await authFetch("/api/orgs/playbooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      const created = await res.json();
      router.push(`/dashboard/playbooks/${created.id}`);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to create playbook");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/playbooks/new" />
      <ApprovalChainQuickCreate open={showChainCreate} onClose={() => { setShowChainCreate(false); setChainCreateForStep(null); }} onCreated={onChainCreated} />

      <Link href="/dashboard/playbooks" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Playbooks
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-slate-100">New Playbook</h1>
        <p className="text-sm text-slate-400 mt-1">
          Define one of your business processes — what it's called, the steps, who approves,
          which systems it uses, and the documents it needs.
        </p>
      </div>

      {/* Guidance banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40">
        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-xs font-medium text-slate-400">How playbooks work</span>
          {showGuide ? <FiChevronUp size={14} className="text-slate-500" /> : <FiChevronDown size={14} className="text-slate-500" />}
        </button>
        {showGuide && (
          <div className="px-5 pb-4 text-xs text-slate-500 space-y-1.5 border-t border-slate-800/50 pt-3">
            <p>A <strong className="text-slate-300">playbook</strong> is a step-by-step recipe for a business process. When you start an objective in the workspace, the agent follows the active playbook.</p>
            <p>Each step can require <strong className="text-slate-300">human approval</strong> before the agent proceeds. You control who approves by linking an approval chain — a sequence of approver roles (people or groups).</p>
            <p><strong className="text-slate-300">Bound systems</strong> restrict which external tools the agent can use. <strong className="text-slate-300">Required documents</strong> define what evidence must be collected.</p>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basics */}
        <div className={sectionCls}>
          <h2 className="text-sm font-medium text-slate-200">Basics</h2>
          <div>
            <label className={labelCls}>Objective</label>
            <select className={`${selectCls} w-full`} value={outcomeTypeId} onChange={(e) => setOutcomeTypeId(e.target.value)}>
              <option value="">(Auto-create new objective)</option>
              {objectives.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <p className="text-[11px] text-slate-600 mt-1">
              Which business objective does this playbook guide? "Auto-create" makes one with the same name.
            </p>
          </div>
          <div>
            <label className={labelCls}>Name</label>
            <input
              className={inputCls}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer onboarding"
            />
          </div>
          <div>
            <label className={labelCls}>Summary</label>
            <textarea
              className={inputCls}
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One or two sentences describing what this process is for."
            />
          </div>
          <div>
            <label className={labelCls}>Status on save</label>
            <select className={`${selectCls} w-full max-w-xs`} value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="active">Active (use immediately)</option>
              <option value="draft">Draft (save for later)</option>
            </select>
            <p className="text-[11px] text-slate-600 mt-1">
              Activating archives any other active playbook for this objective.
            </p>
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
          <p className="text-xs text-slate-500">The agent follows these in order. Mark steps that need human approval.</p>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-6">{i + 1}.</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="Step title"
                    value={s.title}
                    onChange={(e) => updateStep(i, { title: e.target.value })}
                  />
                  <button type="button" onClick={() => removeStep(i)} className="text-slate-600 hover:text-rose-400">
                    <FiTrash2 size={14} />
                  </button>
                </div>
                <textarea
                  className={inputCls}
                  rows={2}
                  placeholder="Description (optional)"
                  value={s.description}
                  onChange={(e) => updateStep(i, { description: e.target.value })}
                />
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={s.requiresApproval}
                    onChange={(e) => updateStep(i, { requiresApproval: e.target.checked, approvalChainId: e.target.checked ? s.approvalChainId : "" })}
                  />
                  Requires approval before continuing
                </label>
                {s.requiresApproval && (
                  <div className="pl-6 flex items-center gap-2">
                    <label className="text-xs text-slate-400">Approval chain:</label>
                    <select
                      className={`${selectCls} flex-1`}
                      value={s.approvalChainId}
                      onChange={(e) => {
                        if (e.target.value === "__create__") { openChainCreate(i); return; }
                        updateStep(i, { approvalChainId: e.target.value });
                      }}
                    >
                      <option value="">None (uses playbook default)</option>
                      {approvalChains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      <option value="__create__">+ Create new chain…</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* System bindings */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-200">Bound systems</h2>
            <button
              type="button"
              onClick={addBinding}
              disabled={connectors.length === 0}
              className="inline-flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 disabled:text-slate-600"
            >
              <FiPlus size={12} /> Add binding
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Pin which connector this playbook uses for each role. The agent will be hard-blocked
            from calling any system that isn't bound here.
          </p>
          {connectors.length === 0 ? (
            <div className="text-xs text-slate-500 italic flex items-center gap-2">
              <span>No connector instances yet.</span>
              <a href="/dashboard/connections" target="_blank" rel="noopener" className="text-fuchsia-400 hover:text-fuchsia-300">
                Add one in Connections
              </a>
              <button type="button" onClick={loadPickers} className="inline-flex items-center gap-1 text-fuchsia-400 hover:text-fuchsia-300">
                <FiRefreshCw size={10} /> Refresh
              </button>
            </div>
          ) : bindings.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No bindings. The agent can use any system.</div>
          ) : (
            <div className="space-y-2">
              {bindings.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className={`${selectCls} w-44`}
                    value={b.role}
                    onChange={(e) => updateBinding(i, { role: e.target.value })}
                  >
                    {BINDING_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <select
                    className={`${selectCls} flex-1`}
                    value={b.connectorInstanceId}
                    onChange={(e) => updateBinding(i, { connectorInstanceId: e.target.value })}
                    required
                  >
                    <option value="">Pick a connector…</option>
                    {connectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" onClick={() => removeBinding(i)} className="text-slate-600 hover:text-rose-400">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document requirements */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-200">Required documents</h2>
            <button
              type="button"
              onClick={addDocReq}
              disabled={docTemplates.length === 0}
              className="inline-flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 disabled:text-slate-600"
            >
              <FiPlus size={12} /> Add document
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Listed documents must be uploaded before an instance can complete.
          </p>
          {docTemplates.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No document templates yet. (Document templates UI coming separately.)</div>
          ) : docReqs.length === 0 ? (
            <div className="text-xs text-slate-500 italic">No required documents.</div>
          ) : (
            <div className="space-y-2">
              {docReqs.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className={`${selectCls} flex-1`}
                    value={d.documentTemplateId}
                    onChange={(e) => updateDocReq(i, { documentTemplateId: e.target.value })}
                    required
                  >
                    <option value="">Pick a document template…</option>
                    {docTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input type="checkbox" checked={d.required} onChange={(e) => updateDocReq(i, { required: e.target.checked })} />
                    Required
                  </label>
                  <button type="button" onClick={() => removeDocReq(i)} className="text-slate-600 hover:text-rose-400">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {saving ? "Saving…" : "Save playbook"}
          </button>
          <Link
            href="/dashboard/playbooks"
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
