"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiTrash2, FiPlay, FiArchive, FiEdit2, FiAlertTriangle, FiChevronRight, FiUserCheck, FiLink } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface Binding {
  id: string;
  role: string;
  connectorInstanceId: string | null;
}

interface DocumentRequirement {
  id: string;
  documentTemplateId: string;
  required: boolean;
}

interface ProcedureStep {
  sequence: number;
  title: string;
  description?: string;
  requiresApproval?: boolean;
  approvalChainId?: string;
}

interface Playbook {
  id: string;
  outcomeTypeId: string;
  outcomeTypeName?: string;
  name: string;
  summary: string | null;
  status: "draft" | "active" | "archived";
  version: number;
  source: string;
  approvalChainId?: string;
  procedureSteps: ProcedureStep[];
  bindings: Binding[];
  documents: DocumentRequirement[];
  createdAt: string;
  updatedAt: string;
}

interface ConnectorInstance { id: string; name: string }
interface DocumentTemplate { id: string; name: string }
interface ApprovalChain { id: string; name: string; description: string | null; stepsExpanded?: Array<{ roleName: string; mode: string }> }

const statusColor: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-950/30 border-emerald-700/40",
  draft: "text-slate-400 bg-slate-800/40 border-slate-700/40",
  archived: "text-slate-600 bg-slate-900/40 border-slate-800/40",
};

export default function PlaybookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [connectors, setConnectors] = useState<ConnectorInstance[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocumentTemplate[]>([]);
  const [approvalChains, setApprovalChains] = useState<ApprovalChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [pRes, cRes, dRes, aRes] = await Promise.all([
        authFetch(`/api/orgs/playbooks/${id}`),
        authFetch("/api/orgs/connector-instances"),
        authFetch("/api/orgs/document-templates"),
        authFetch("/api/orgs/approval-chains"),
      ]);
      if (!pRes.ok) throw new Error(`Failed (${pRes.status})`);
      const p = await pRes.json();
      setPlaybook(p);
      if (cRes.ok) setConnectors((await cRes.json())?.items || []);
      if (dRes.ok) setDocTemplates((await dRes.json())?.items || []);
      if (aRes.ok) setApprovalChains((await aRes.json())?.items || []);
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load playbook");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function setStatus(next: "active" | "archived") {
    if (!playbook) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/orgs/playbooks/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  async function deletePlaybook() {
    if (!confirm("Delete this playbook? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/orgs/playbooks/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
      router.push("/dashboard/playbooks");
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
      setBusy(false);
    }
  }

  function connectorName(connId: string | null): string {
    if (!connId) return "(none)";
    return connectors.find((c) => c.id === connId)?.name || connId.slice(0, 8);
  }
  function docTemplateName(tid: string): string {
    return docTemplates.find((t) => t.id === tid)?.name || tid.slice(0, 8);
  }
  function chainName(chainId: string | undefined): string | null {
    if (!chainId) return null;
    return approvalChains.find((c) => c.id === chainId)?.name || null;
  }
  function chainSummary(chainId: string): string {
    const chain = approvalChains.find((c) => c.id === chainId);
    if (!chain?.stepsExpanded?.length) return "";
    return chain.stepsExpanded.map((s) => s.roleName).join(" → ");
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo={`/dashboard/playbooks/${id}`} />

      <Link href="/dashboard/playbooks" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Playbooks
      </Link>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : !playbook ? (
        <div className="text-sm text-slate-500">Playbook not found.</div>
      ) : (
        <>
          {/* Objective breadcrumb */}
          {playbook.outcomeTypeId && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>Objective:</span>
              <Link
                href={`/dashboard/library/objectives/${playbook.outcomeTypeId}`}
                className="text-fuchsia-400 hover:text-fuchsia-300"
              >
                {playbook.outcomeTypeName || "Unnamed objective"}
              </Link>
              <FiChevronRight size={10} className="text-slate-600" />
              <span className="text-slate-400">Playbook v{playbook.version}</span>
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-100">{playbook.name}</h1>
                <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border ${statusColor[playbook.status]}`}>
                  {playbook.status}
                </span>
              </div>
              {playbook.summary && <p className="text-sm text-slate-400 mt-1 max-w-4xl">{playbook.summary}</p>}
              <div className="text-[11px] text-slate-600 mt-2">v{playbook.version} · {playbook.source}</div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/playbooks/${id}/edit`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs"
              >
                <FiEdit2 size={12} /> Edit
              </Link>
              {playbook.status !== "active" && (
                <button
                  onClick={() => setStatus("active")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs"
                >
                  <FiPlay size={12} /> Activate
                </button>
              )}
              {playbook.status === "active" && (
                <button
                  onClick={() => setStatus("archived")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs"
                >
                  <FiArchive size={12} /> Archive
                </button>
              )}
              <button
                onClick={deletePlaybook}
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-white text-xs"
              >
                <FiTrash2 size={12} /> Delete
              </button>
            </div>
          </div>

          {/* Default approval chain */}
          {playbook.approvalChainId && chainName(playbook.approvalChainId) && (
            <div className="rounded-lg border border-sky-700/30 bg-sky-950/20 px-4 py-3 flex items-center gap-2">
              <FiUserCheck size={14} className="text-sky-400" />
              <span className="text-xs text-sky-300">
                Default approval chain:{" "}
                <Link href={`/dashboard/library/approvals/${playbook.approvalChainId}`} className="text-fuchsia-400 hover:text-fuchsia-300 font-medium">
                  {chainName(playbook.approvalChainId)}
                </Link>
              </span>
              {chainSummary(playbook.approvalChainId) && (
                <span className="text-[10px] text-slate-500 ml-2">({chainSummary(playbook.approvalChainId)})</span>
              )}
            </div>
          )}

          {/* Procedure */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="text-sm font-medium text-slate-200 mb-1">Procedure</h2>
            <p className="text-xs text-slate-500 mb-3">Steps the agent follows in order. Steps marked for approval will pause until the designated approvers respond.</p>
            {playbook.procedureSteps?.length ? (
              <ol className="space-y-2">
                {playbook.procedureSteps.map((s, i) => (
                  <li key={i} className="text-sm text-slate-300">
                    <div className="flex items-start gap-3">
                      <span className="text-slate-500 w-5">{s.sequence}.</span>
                      <div className="flex-1">
                        <div className="text-slate-100">{s.title}</div>
                        {s.description && <div className="text-xs text-slate-500 mt-0.5">{s.description}</div>}
                        {s.requiresApproval && (
                          <div className="mt-1">
                            {s.approvalChainId && chainName(s.approvalChainId) ? (
                              <div className="inline-flex items-center gap-1.5 text-[10px] bg-sky-950/30 border border-sky-700/30 rounded px-2 py-0.5">
                                <FiUserCheck size={10} className="text-sky-400" />
                                <span className="text-sky-300">Approved by:</span>
                                <Link href={`/dashboard/library/approvals/${s.approvalChainId}`} className="text-fuchsia-400 hover:text-fuchsia-300 font-medium">
                                  {chainName(s.approvalChainId)}
                                </Link>
                                {chainSummary(s.approvalChainId) && (
                                  <span className="text-slate-500">({chainSummary(s.approvalChainId)})</span>
                                )}
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-[10px] bg-amber-950/30 border border-amber-700/30 rounded px-2 py-0.5">
                                <FiAlertTriangle size={10} className="text-amber-400" />
                                <span className="text-amber-300">Approval required — not configured</span>
                                <Link href={`/dashboard/playbooks/${id}/edit`} className="text-fuchsia-400 hover:text-fuchsia-300 ml-1">
                                  Assign chain
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-xs text-slate-500 italic">No procedure steps defined.</div>
            )}
          </div>

          {/* Bound systems + Required documents side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="text-sm font-medium text-slate-200 mb-1">Bound systems</h2>
              <p className="text-xs text-slate-500 mb-3">External systems the agent is allowed to call. Unbound systems are blocked.</p>
              {playbook.bindings?.length ? (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr><th className="pb-2">Role</th><th className="pb-2">Connector</th></tr>
                  </thead>
                  <tbody>
                    {playbook.bindings.map((b) => (
                      <tr key={b.id} className="text-slate-300 border-t border-slate-800/50">
                        <td className="py-2">{b.role}</td>
                        <td className="py-2">
                          <Link href="/dashboard/connections" className="text-fuchsia-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
                            <FiLink size={10} />
                            {connectorName(b.connectorInstanceId)}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-slate-500 italic">No bound systems. Agent can use any system.</div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="text-sm font-medium text-slate-200 mb-1">Required documents</h2>
              <p className="text-xs text-slate-500 mb-3">Evidence that must be collected before this objective can complete.</p>
              {playbook.documents?.length ? (
                <ul className="space-y-1">
                  {playbook.documents.map((d) => (
                    <li key={d.id} className="text-sm text-slate-300 flex items-center justify-between">
                      <span>{docTemplateName(d.documentTemplateId)}</span>
                      {d.required && <span className="text-[10px] text-amber-400 uppercase">Required</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-slate-500 italic">No required documents.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
