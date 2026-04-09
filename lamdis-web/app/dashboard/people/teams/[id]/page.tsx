"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiPlus, FiTrash2, FiEdit2, FiSave, FiUsers, FiX } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface TeamMember {
  id: string;
  memberId: string;
  role: string | null;
  email: string | null;
  memberRole: string | null;
  status: string | null;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

interface OrgMember {
  _id: string;
  email: string;
  role: string;
  status: string;
}

const COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#3b82f6", "#f97316"];
const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500 focus:outline-none";

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [busy, setBusy] = useState(false);

  // Add member
  const [addMemberId, setAddMemberId] = useState("");
  const [addRole, setAddRole] = useState<"member" | "lead">("member");

  async function load() {
    setLoading(true);
    try {
      const [tRes, mRes] = await Promise.all([
        authFetch(`/api/orgs/teams/${id}`),
        authFetch("/api/orgs/members"),
      ]);
      if (!tRes.ok) throw new Error(`Failed (${tRes.status})`);
      const t = await tRes.json();
      setTeam(t);
      setEditName(t.name);
      setEditDesc(t.description || "");
      setEditColor(t.color || COLORS[0]);
      if (mRes.ok) setOrgMembers((await mRes.json())?.members || []);
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  // Members not yet on this team
  const availableMembers = orgMembers.filter(
    (m) => !team?.members?.some((tm) => tm.memberId === m._id)
  );

  async function handleSave() {
    setBusy(true);
    try {
      const res = await authFetch(`/api/orgs/teams/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null, color: editColor }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditing(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this team?")) return;
    setBusy(true);
    try {
      await authFetch(`/api/orgs/teams/${id}`, { method: "DELETE" });
      router.push("/dashboard/people/teams");
    } catch (e: any) {
      setError(e?.message || "Failed");
      setBusy(false);
    }
  }

  async function handleAddMember() {
    if (!addMemberId) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/orgs/teams/${id}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: addMemberId, role: addRole }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed");
      }
      setAddMemberId("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    setBusy(true);
    try {
      await authFetch(`/api/orgs/teams/${id}/members/${memberId}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeRole(memberId: string, role: string) {
    try {
      await authFetch(`/api/orgs/teams/${id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await load();
    } catch {}
  }

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo={`/dashboard/people/teams/${id}`} />

      <Link href="/dashboard/people/teams" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Teams
      </Link>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : !team ? (
        <div className="text-sm text-slate-500">Team not found.</div>
      ) : editing ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-200">Edit Team</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
              <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Color</label>
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setEditColor(c)} className={`w-7 h-7 rounded-full border-2 transition ${editColor === c ? "border-white scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <input className={inputCls} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium"><FiSave size={14} /> Save</button>
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }} />
              <div>
                <h1 className="text-2xl font-semibold text-slate-100">{team.name}</h1>
                {team.description && <p className="text-sm text-slate-400 mt-0.5">{team.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs"><FiEdit2 size={12} /> Edit</button>
              <button onClick={handleDelete} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-white text-xs"><FiTrash2 size={12} /> Delete</button>
            </div>
          </div>

          {/* Add member */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="text-sm font-medium text-slate-200 mb-3">Add member</h2>
            {availableMembers.length === 0 ? (
              <div className="text-xs text-slate-500 italic">All org members are already on this team.</div>
            ) : (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <select className={`${selectCls} w-full`} value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)}>
                    <option value="">Select a member…</option>
                    {availableMembers.map((m) => <option key={m._id} value={m._id}>{m.email} ({m.role})</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <select className={`${selectCls} w-full`} value={addRole} onChange={(e) => setAddRole(e.target.value as any)}>
                    <option value="member">Member</option>
                    <option value="lead">Lead</option>
                  </select>
                </div>
                <button onClick={handleAddMember} disabled={!addMemberId || busy} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Members list */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="text-sm font-medium text-slate-200 mb-1">Members</h2>
            <p className="text-xs text-slate-500 mb-3">{team.members.length} member{team.members.length !== 1 ? "s" : ""} on this team</p>
            {team.members.length === 0 ? (
              <div className="text-xs text-slate-500 italic">No members yet. Add someone above.</div>
            ) : (
              <div className="space-y-2">
                {team.members.map((m) => (
                  <div key={m.memberId} className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-slate-950/30 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-white text-xs font-bold">
                        {m.email?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <div className="text-sm text-slate-100">{m.email || "Unknown"}</div>
                        <div className="text-[10px] text-slate-600">{m.memberRole} · {m.status}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={m.role || "member"}
                        onChange={(e) => handleChangeRole(m.memberId, e.target.value)}
                        className="text-xs bg-transparent border border-slate-700 rounded px-2 py-1 text-slate-300"
                      >
                        <option value="member">Member</option>
                        <option value="lead">Lead</option>
                      </select>
                      <button onClick={() => handleRemoveMember(m.memberId)} className="text-slate-600 hover:text-rose-400 p-1">
                        <FiX size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
