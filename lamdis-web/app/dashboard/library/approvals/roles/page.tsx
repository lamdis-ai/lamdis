"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FiArrowLeft, FiPlus, FiTrash2, FiEdit2, FiUsers, FiSave, FiX } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface ApproverMember {
  type: "user" | "group";
  userSub?: string;
  email?: string;
  name?: string;
  groupKey?: string;
}

interface ApproverRole {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  members: ApproverMember[];
  sourceBindingId: string | null;
  createdAt: string;
  updatedAt: string;
}

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

export default function ApproverRolesPage() {
  const [roles, setRoles] = useState<ApproverRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline create form
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMembers, setNewMembers] = useState<ApproverMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMembers, setEditMembers] = useState<ApproverMember[]>([]);
  const [editMemberEmail, setEditMemberEmail] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await authFetch("/api/orgs/approver-roles");
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setRoles(data?.items || []);
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function addNewMember() {
    if (!newMemberEmail.trim()) return;
    setNewMembers((m) => [...m, { type: "user", email: newMemberEmail.trim(), name: newMemberEmail.trim().split("@")[0] }]);
    setNewMemberEmail("");
  }

  function addEditMember() {
    if (!editMemberEmail.trim()) return;
    setEditMembers((m) => [...m, { type: "user", email: editMemberEmail.trim(), name: editMemberEmail.trim().split("@")[0] }]);
    setEditMemberEmail("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newDisplayName.trim()) { setError("Key and display name are required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/orgs/approver-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: newKey.trim(),
          displayName: newDisplayName.trim(),
          description: newDescription.trim() || undefined,
          members: newMembers,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      setCreating(false);
      setNewKey(""); setNewDisplayName(""); setNewDescription(""); setNewMembers([]);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(roleId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/orgs/approver-roles/${roleId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          description: editDescription.trim() || null,
          members: editMembers,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(roleId: string) {
    if (!confirm("Delete this approver role?")) return;
    try {
      const res = await authFetch(`/api/orgs/approver-roles/${roleId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
    }
  }

  function startEdit(role: ApproverRole) {
    setEditingId(role.id);
    setEditDisplayName(role.displayName);
    setEditDescription(role.description || "");
    setEditMembers([...(role.members || [])]);
  }

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/library/approvals/roles" />

      <Link href="/dashboard/library/approvals" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Approval Chains
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Approver Roles</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            An approver role is a named group of people who can approve actions — e.g. "Compliance Officer"
            or "Team Lead". Approval chain steps reference these roles.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
          >
            <FiPlus /> New role
          </button>
        )}
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {/* Inline create form */}
      {creating && (
        <form onSubmit={handleCreate} className="rounded-xl border border-fuchsia-500/30 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-200">New Approver Role</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Key (unique identifier)</label>
              <input className={inputCls} required value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. compliance_officer" />
            </div>
            <div>
              <label className={labelCls}>Display name</label>
              <input className={inputCls} required value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="e.g. Compliance Officer" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="What this role approves (optional)" />
          </div>
          <div>
            <label className={labelCls}>Members</label>
            <div className="flex gap-2 mb-2">
              <input
                className={`${inputCls} flex-1`}
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="Email address"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewMember(); } }}
              />
              <button type="button" onClick={addNewMember} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-white">
                Add
              </button>
            </div>
            {newMembers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {newMembers.map((m, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">
                    {m.email || m.name}
                    <button type="button" onClick={() => setNewMembers((ms) => ms.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-rose-400">
                      <FiX size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
              {saving ? "Saving…" : "Create role"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : roles.length === 0 && !creating ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <FiUsers className="mx-auto text-slate-700 mb-3" size={36} />
          <h2 className="text-base font-medium text-slate-200 mb-1">No approver roles yet</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Create your first approver role — for example "Manager", "Compliance Officer", or
            "Legal Team". Then use these roles in approval chains.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
          >
            <FiPlus /> Create your first role
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              {editingId === role.id ? (
                /* Inline edit */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Display name</label>
                      <input className={inputCls} value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Key</label>
                      <input className={inputCls} value={role.key} disabled title="Key cannot be changed" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Description</label>
                    <input className={inputCls} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Members</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        className={`${inputCls} flex-1`}
                        value={editMemberEmail}
                        onChange={(e) => setEditMemberEmail(e.target.value)}
                        placeholder="Email address"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEditMember(); } }}
                      />
                      <button type="button" onClick={addEditMember} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-white">
                        Add
                      </button>
                    </div>
                    {editMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {editMembers.map((m, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">
                            {m.email || m.name || m.groupKey}
                            <button type="button" onClick={() => setEditMembers((ms) => ms.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-rose-400">
                              <FiX size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(role.id)} disabled={saving} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-xs">
                      <FiSave size={12} /> {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View */
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-slate-100">{role.displayName}</h3>
                      <span className="text-[10px] text-slate-600 font-mono">{role.key}</span>
                    </div>
                    {role.description && <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>}
                    <div className="mt-1 flex items-center gap-1">
                      <FiUsers size={10} className="text-slate-600" />
                      <span className="text-[10px] text-slate-500">
                        {role.members.length === 0 ? "No members" : role.members.map((m) => m.email || m.name || m.groupKey).join(", ")}
                      </span>
                    </div>
                    {role.sourceBindingId && (
                      <div className="text-[10px] text-sky-400 mt-0.5">Members resolved from system binding</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(role)} className="text-slate-600 hover:text-slate-300 p-1">
                      <FiEdit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(role.id)} className="text-slate-600 hover:text-rose-400 p-1">
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
