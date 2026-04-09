"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiTrash2, FiSave, FiPlus, FiArrowUp, FiArrowDown, FiEdit2, FiUsers } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface ApproverRole { id: string; key: string; displayName: string; members: any[] }

interface ChainStep {
  roleId: string;
  mode: "serial" | "parallel";
  parallelMode?: "unanimous" | "quorum" | "first_responder";
  quorumCount?: number;
  escalationAfterMins?: number;
  fallbackRoleId?: string;
  notes?: string;
}

interface ExpandedStep extends ChainStep {
  roleName: string;
  roleMembers?: Array<{ type: string; email?: string; name?: string; groupKey?: string }>;
  fallbackRoleName?: string;
}

interface ApprovalChain {
  id: string;
  name: string;
  description: string | null;
  steps: ChainStep[];
  stepsExpanded?: ExpandedStep[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

export default function ApprovalChainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [chain, setChain] = useState<ApprovalChain | null>(null);
  const [roles, setRoles] = useState<ApproverRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Editable state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSteps, setEditSteps] = useState<ChainStep[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        authFetch(`/api/orgs/approval-chains/${id}`),
        authFetch("/api/orgs/approver-roles"),
      ]);
      if (!cRes.ok) throw new Error(`Failed (${cRes.status})`);
      const c = await cRes.json();
      setChain(c);
      setEditName(c.name);
      setEditDesc(c.description || "");
      setEditSteps(c.steps || []);
      if (rRes.ok) setRoles((await rRes.json())?.items || []);
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function roleName(roleId: string) {
    return roles.find((r) => r.id === roleId)?.displayName || roleId.slice(0, 8);
  }

  function addStep() {
    setEditSteps((s) => [...s, { roleId: "", mode: "serial" }]);
  }
  function updateStep(i: number, patch: Partial<ChainStep>) {
    setEditSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));
  }
  function removeStep(i: number) {
    setEditSteps((s) => s.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setEditSteps((s) => {
      const arr = [...s];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/orgs/approval-chains/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          steps: editSteps.filter((s) => s.roleId),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      setEditing(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this approval chain? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/orgs/approval-chains/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      router.push("/dashboard/library/approvals");
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo={`/dashboard/library/approvals/${id}`} />

      <Link href="/dashboard/library/approvals" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Approval Chains
      </Link>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : !chain ? (
        <div className="text-sm text-slate-500">Approval chain not found.</div>
      ) : editing ? (
        /* ── Edit Mode ────────────────────────────────────────── */
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-medium text-slate-200">Basics</h2>
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea className={inputCls} rows={2} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-200">Steps</h2>
              <button type="button" onClick={addStep} className="inline-flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300">
                <FiPlus size={12} /> Add step
              </button>
            </div>
            <div className="space-y-3">
              {editSteps.map((s, i) => (
                <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-6">{i + 1}.</span>
                    <select className={`${selectCls} flex-1`} value={s.roleId} onChange={(e) => updateStep(i, { roleId: e.target.value })}>
                      <option value="">Pick an approver role…</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
                    </select>
                    <select className={`${selectCls} w-28`} value={s.mode} onChange={(e) => updateStep(i, { mode: e.target.value as any })}>
                      <option value="serial">Serial</option>
                      <option value="parallel">Parallel</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-slate-600 hover:text-slate-300 disabled:opacity-30"><FiArrowUp size={14} /></button>
                      <button type="button" onClick={() => moveStep(i, 1)} disabled={i === editSteps.length - 1} className="text-slate-600 hover:text-slate-300 disabled:opacity-30"><FiArrowDown size={14} /></button>
                      <button type="button" onClick={() => removeStep(i)} className="text-slate-600 hover:text-rose-400 ml-1"><FiTrash2 size={14} /></button>
                    </div>
                  </div>
                  {s.mode === "parallel" && (
                    <div className="flex items-center gap-3 pl-6">
                      <label className="text-xs text-slate-400">Resolution:</label>
                      <select className={`${selectCls} text-xs`} value={s.parallelMode || "unanimous"} onChange={(e) => updateStep(i, { parallelMode: e.target.value as any })}>
                        <option value="unanimous">Unanimous</option>
                        <option value="quorum">Quorum</option>
                        <option value="first_responder">First responder</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
              <FiSave size={14} /> {busy ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => { setEditing(false); setEditName(chain.name); setEditDesc(chain.description || ""); setEditSteps(chain.steps || []); }} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── View Mode ────────────────────────────────────────── */
        <>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-100">{chain.name}</h1>
              {chain.description && <p className="text-sm text-slate-400 mt-1 max-w-2xl">{chain.description}</p>}
              <div className="text-[11px] text-slate-600 mt-2">
                Created {new Date(chain.createdAt).toLocaleDateString()}
                {chain.createdBy && <> · by {chain.createdBy}</>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs">
                <FiEdit2 size={12} /> Edit
              </button>
              <button onClick={handleDelete} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-white text-xs">
                <FiTrash2 size={12} /> Delete
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="text-sm font-medium text-slate-200 mb-1">Steps</h2>
            <p className="text-xs text-slate-500 mb-3">Executed top-to-bottom. Each step must complete before the next begins.</p>
            {(chain.stepsExpanded || chain.steps || []).length === 0 ? (
              <div className="text-xs text-slate-500 italic">No steps defined.</div>
            ) : (
              <ol className="space-y-3">
                {(chain.stepsExpanded || chain.steps || []).map((s: any, i: number) => (
                  <li key={i} className="rounded-lg border border-slate-800/50 bg-slate-950/30 p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-5">{i + 1}.</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/library/approvals/roles`} className="text-sm text-fuchsia-400 hover:text-fuchsia-300 font-medium">
                            {s.roleName || roleName(s.roleId)}
                          </Link>
                          <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${s.mode === "parallel" ? "text-amber-400 bg-amber-950/30 border-amber-700/40" : "text-sky-400 bg-sky-950/30 border-sky-700/40"}`}>
                            {s.mode}
                          </span>
                          {s.mode === "parallel" && s.parallelMode && (
                            <span className="text-[9px] text-slate-500">({s.parallelMode})</span>
                          )}
                        </div>
                        {s.roleMembers && s.roleMembers.length > 0 && (
                          <div className="mt-1 flex items-center gap-1">
                            <FiUsers size={10} className="text-slate-600" />
                            <span className="text-[10px] text-slate-500">
                              {s.roleMembers.slice(0, 3).map((m: any) => m.name || m.email || m.groupKey).join(", ")}
                              {s.roleMembers.length > 3 && ` +${s.roleMembers.length - 3} more`}
                            </span>
                          </div>
                        )}
                        {s.escalationAfterMins && (
                          <div className="text-[10px] text-slate-500 mt-0.5">Escalates after {s.escalationAfterMins} min</div>
                        )}
                        {s.notes && <div className="text-xs text-slate-500 mt-1 italic">{s.notes}</div>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
