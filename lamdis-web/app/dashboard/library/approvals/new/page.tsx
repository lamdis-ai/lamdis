"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiPlus, FiTrash2, FiArrowUp, FiArrowDown } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface ApproverRole {
  id: string;
  key: string;
  displayName: string;
  members: any[];
}

interface StepDraft {
  roleId: string;
  mode: "serial" | "parallel";
  parallelMode: "unanimous" | "quorum" | "first_responder";
  quorumCount?: number;
  escalationAfterMins?: number;
  notes: string;
}

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";
const sectionCls = "rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4";

export default function NewApprovalChainPage() {
  const router = useRouter();
  const [showAuthError, setShowAuthError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<ApproverRole[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([
    { roleId: "", mode: "serial", parallelMode: "unanimous", notes: "" },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/orgs/approver-roles");
        if (res.ok) {
          const data = await res.json();
          setRoles(data?.items || []);
        }
      } catch (e) {
        if (isAuthError(e)) setShowAuthError(true);
      }
    })();
  }, []);

  function addStep() {
    setSteps((s) => [...s, { roleId: "", mode: "serial", parallelMode: "unanimous", notes: "" }]);
  }
  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const arr = [...s];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    const validSteps = steps.filter((s) => s.roleId);
    if (validSteps.length === 0) { setError("At least one step with an approver role is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/orgs/approval-chains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          steps: validSteps.map((s) => ({
            roleId: s.roleId,
            mode: s.mode,
            parallelMode: s.mode === "parallel" ? s.parallelMode : undefined,
            quorumCount: s.mode === "parallel" && s.parallelMode === "quorum" ? s.quorumCount : undefined,
            escalationAfterMins: s.escalationAfterMins || undefined,
            notes: s.notes.trim() || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      const created = await res.json();
      router.push(`/dashboard/library/approvals/${created.id}`);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to create");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/library/approvals/new" />

      <Link href="/dashboard/library/approvals" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Approval Chains
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-slate-100">New Approval Chain</h1>
        <p className="text-sm text-slate-400 mt-1">
          An approval chain is an ordered sequence of approver roles. When a playbook step requires
          approval, the chain runs top-to-bottom — each role must approve before the next is asked.
        </p>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basics */}
        <div className={sectionCls}>
          <h2 className="text-sm font-medium text-slate-200">Basics</h2>
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Manager Sign-off" />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When this chain is used and why." />
          </div>
        </div>

        {/* Steps */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-slate-200">Steps</h2>
              <p className="text-xs text-slate-500 mt-0.5">Steps run in order from top to bottom. Each step references an approver role — a named group of people.</p>
            </div>
            <button type="button" onClick={addStep} className="inline-flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300">
              <FiPlus size={12} /> Add step
            </button>
          </div>

          {roles.length === 0 && (
            <div className="text-xs text-slate-500 italic">
              No approver roles yet.{" "}
              <Link href="/dashboard/library/approvals/roles" className="text-fuchsia-400 hover:text-fuchsia-300">
                Create approver roles first
              </Link>
              {" "}to define who can approve.
            </div>
          )}

          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-6">{i + 1}.</span>
                  <select
                    className={`${selectCls} flex-1`}
                    value={s.roleId}
                    onChange={(e) => updateStep(i, { roleId: e.target.value })}
                    required
                  >
                    <option value="">Pick an approver role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.displayName} ({r.members?.length || 0} member{r.members?.length !== 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                  <select className={`${selectCls} w-28`} value={s.mode} onChange={(e) => updateStep(i, { mode: e.target.value as any })}>
                    <option value="serial">Serial</option>
                    <option value="parallel">Parallel</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-slate-600 hover:text-slate-300 disabled:opacity-30">
                      <FiArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-slate-600 hover:text-slate-300 disabled:opacity-30">
                      <FiArrowDown size={14} />
                    </button>
                    <button type="button" onClick={() => removeStep(i)} className="text-slate-600 hover:text-rose-400 ml-1">
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>

                {s.mode === "parallel" && (
                  <div className="flex items-center gap-3 pl-6">
                    <label className="text-xs text-slate-400">Resolution:</label>
                    <select className={`${selectCls} text-xs`} value={s.parallelMode} onChange={(e) => updateStep(i, { parallelMode: e.target.value as any })}>
                      <option value="unanimous">Unanimous (all must approve)</option>
                      <option value="quorum">Quorum (N must approve)</option>
                      <option value="first_responder">First responder wins</option>
                    </select>
                    {s.parallelMode === "quorum" && (
                      <input
                        type="number"
                        min={1}
                        className={`${inputCls} w-20`}
                        placeholder="N"
                        value={s.quorumCount || ""}
                        onChange={(e) => updateStep(i, { quorumCount: parseInt(e.target.value) || undefined })}
                      />
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 pl-6">
                  <label className="text-xs text-slate-400">Escalate after (mins):</label>
                  <input
                    type="number"
                    min={1}
                    className={`${inputCls} w-24`}
                    placeholder="Optional"
                    value={s.escalationAfterMins || ""}
                    onChange={(e) => updateStep(i, { escalationAfterMins: parseInt(e.target.value) || undefined })}
                  />
                </div>

                <div className="pl-6">
                  <input
                    className={inputCls}
                    placeholder="Notes for this step (optional)"
                    value={s.notes}
                    onChange={(e) => updateStep(i, { notes: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {saving ? "Saving…" : "Save approval chain"}
          </button>
          <Link href="/dashboard/library/approvals" className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
