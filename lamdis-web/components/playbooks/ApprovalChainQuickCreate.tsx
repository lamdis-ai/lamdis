"use client";
import { useEffect, useState } from "react";
import { FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { authFetch } from "@/lib/authFetch";

interface ApproverRole { id: string; key: string; displayName: string; members: any[] }

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (chain: { id: string; name: string }) => void;
}

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

export default function ApprovalChainQuickCreate({ open, onClose, onCreated }: Props) {
  const [roles, setRoles] = useState<ApproverRole[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Array<{ roleId: string; mode: "serial" | "parallel" }>>([{ roleId: "", mode: "serial" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline role creation
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleDisplayName, setNewRoleDisplayName] = useState("");
  const [newRoleMemberEmail, setNewRoleMemberEmail] = useState("");
  const [newRoleMembers, setNewRoleMembers] = useState<Array<{ type: "user"; email: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await authFetch("/api/orgs/approver-roles");
        if (res.ok) setRoles((await res.json())?.items || []);
      } catch {}
    })();
  }, [open]);

  function addNewRoleMember() {
    if (!newRoleMemberEmail.trim()) return;
    setNewRoleMembers((m) => [...m, { type: "user", email: newRoleMemberEmail.trim(), name: newRoleMemberEmail.trim().split("@")[0] }]);
    setNewRoleMemberEmail("");
  }

  async function createRole() {
    if (!newRoleKey.trim() || !newRoleDisplayName.trim()) { setError("Role key and display name are required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/orgs/approver-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: newRoleKey.trim(), displayName: newRoleDisplayName.trim(), members: newRoleMembers }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      const created = await res.json();
      setRoles((r) => [...r, created]);
      // Auto-select the new role in the first empty step
      setSteps((s) => {
        const idx = s.findIndex((st) => !st.roleId);
        if (idx >= 0) {
          const arr = [...s];
          arr[idx] = { ...arr[idx], roleId: created.id };
          return arr;
        }
        return s;
      });
      setCreatingRole(false);
      setNewRoleKey(""); setNewRoleDisplayName(""); setNewRoleMembers([]);
    } catch (e: any) {
      setError(e?.message || "Failed to create role");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    const validSteps = steps.filter((s) => s.roleId);
    if (validSteps.length === 0) { setError("At least one step is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/orgs/approval-chains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          steps: validSteps.map((s) => ({ roleId: s.roleId, mode: s.mode })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      const created = await res.json();
      onCreated({ id: created.id, name: created.name });
      // Reset
      setName(""); setDescription(""); setSteps([{ roleId: "", mode: "serial" }]); setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Quick Create: Approval Chain</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><FiX size={18} /></button>
        </div>

        {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">{error}</div>}

        <div>
          <label className={labelCls}>Chain name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Manager Sign-off" />
        </div>
        <div>
          <label className={labelCls}>Description (optional)</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When this chain is used" />
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Steps</label>
            <button type="button" onClick={() => setSteps((s) => [...s, { roleId: "", mode: "serial" }])} className="text-xs text-fuchsia-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
              <FiPlus size={10} /> Add step
            </button>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                <select className={`${selectCls} flex-1`} value={s.roleId} onChange={(e) => setSteps((ss) => ss.map((st, idx) => idx === i ? { ...st, roleId: e.target.value } : st))}>
                  <option value="">Pick approver role…</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
                </select>
                <select className={`${selectCls} w-24`} value={s.mode} onChange={(e) => setSteps((ss) => ss.map((st, idx) => idx === i ? { ...st, mode: e.target.value as any } : st))}>
                  <option value="serial">Serial</option>
                  <option value="parallel">Parallel</option>
                </select>
                {steps.length > 1 && (
                  <button type="button" onClick={() => setSteps((ss) => ss.filter((_, idx) => idx !== i))} className="text-slate-600 hover:text-rose-400"><FiTrash2 size={12} /></button>
                )}
              </div>
            ))}
          </div>
          {roles.length === 0 && (
            <p className="text-xs text-slate-500 mt-2">No approver roles exist yet. Create one below.</p>
          )}
        </div>

        {/* Inline role creation */}
        {!creatingRole ? (
          <button type="button" onClick={() => setCreatingRole(true)} className="text-xs text-fuchsia-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
            <FiPlus size={10} /> Create a new approver role
          </button>
        ) : (
          <div className="rounded-lg border border-fuchsia-500/30 bg-slate-950/40 p-3 space-y-2">
            <div className="text-xs font-medium text-slate-300 mb-1">New Approver Role</div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Key (e.g. manager)" value={newRoleKey} onChange={(e) => setNewRoleKey(e.target.value)} />
              <input className={inputCls} placeholder="Display name" value={newRoleDisplayName} onChange={(e) => setNewRoleDisplayName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                placeholder="Add member email"
                value={newRoleMemberEmail}
                onChange={(e) => setNewRoleMemberEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewRoleMember(); } }}
              />
              <button type="button" onClick={addNewRoleMember} className="px-2 py-1 rounded bg-slate-700 text-xs text-white">Add</button>
            </div>
            {newRoleMembers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {newRoleMembers.map((m, i) => (
                  <span key={i} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                    {m.email}
                    <button type="button" onClick={() => setNewRoleMembers((ms) => ms.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-rose-400"><FiX size={8} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={createRole} disabled={saving} className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-xs">
                {saving ? "Creating…" : "Create role"}
              </button>
              <button type="button" onClick={() => setCreatingRole(false)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-slate-800">
          <button onClick={handleSave} disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? "Saving…" : "Create chain"}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
