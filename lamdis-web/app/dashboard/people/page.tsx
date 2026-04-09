"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FiPlus, FiUsers, FiShield, FiMail, FiCheck, FiTrash2, FiX, FiToggleLeft, FiToggleRight } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface Member {
  _id: string;
  email?: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited";
  licensed: boolean;
  createdAt: string;
}

interface Team {
  id: string;
  name: string;
  color: string;
  members: Array<{ memberId: string }>;
}

interface AssignedRole {
  roleSlug: string;
  roleName?: string;
}

const roleBadge: Record<string, string> = {
  owner: "text-fuchsia-300 bg-fuchsia-950/30 border-fuchsia-700/40",
  admin: "text-amber-300 bg-amber-950/30 border-amber-700/40",
  member: "text-slate-300 bg-slate-800/40 border-slate-700/40",
};

export default function PeopleMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [mRes, tRes] = await Promise.all([
        authFetch("/api/orgs/members"),
        authFetch("/api/orgs/teams"),
      ]);
      if (mRes.ok) setMembers((await mRes.json())?.members || []);
      if (tRes.ok) setTeams((await tRes.json())?.items || []);
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
  }, [success]);

  function teamsForMember(memberId: string) {
    return teams.filter(t => t.members?.some(m => m.memberId === memberId));
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const res = await authFetch("/api/orgs/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, licensed: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      setSuccess(`Invited ${inviteEmail}`);
      setInviteEmail("");
      setShowInvite(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleToggleLicense(member: Member) {
    try {
      const res = await authFetch(`/api/orgs/members/${member._id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ licensed: !member.licensed }),
      });
      if (!res.ok) throw new Error("Failed");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    }
  }

  async function handleUpdateRole(member: Member, newRole: string) {
    try {
      const res = await authFetch(`/api/orgs/members/${member._id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    }
  }

  async function handleRemove(member: Member) {
    if (!confirm(`Remove ${member.email}?`)) return;
    try {
      await authFetch(`/api/orgs/members/${member._id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";
  const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500 focus:outline-none";

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/people" />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Members</h1>
          <p className="text-sm text-slate-400 mt-1">
            {members.length} member{members.length !== 1 ? "s" : ""} · {teams.length} team{teams.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
        >
          <FiPlus /> Invite
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 flex items-center justify-between">{error}<button onClick={() => setError(null)}><FiX size={14} /></button></div>}
      {success && <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2"><FiCheck size={14} />{success}</div>}

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="rounded-xl border border-fuchsia-500/30 bg-slate-900/40 p-5 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
            <input className={inputCls} type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" />
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
            <select className={`${selectCls} w-full`} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={inviting} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
            {inviting ? "Sending…" : "Send invite"}
          </button>
          <button type="button" onClick={() => setShowInvite(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : members.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <FiUsers className="mx-auto text-slate-700 mb-3" size={36} />
          <h2 className="text-base font-medium text-slate-200 mb-1">No members yet</h2>
          <p className="text-sm text-slate-500 mb-4">Invite your team to get started.</p>
          <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium">
            <FiPlus /> Invite your first member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map((m) => {
            const memberTeams = teamsForMember(m._id);
            return (
              <div key={m._id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 transition">
                {/* Avatar + name */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {m.email?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{m.email || "Unknown"}</div>
                      <div className="text-[10px] text-slate-600">Joined {new Date(m.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  {m.role !== "owner" && (
                    <button onClick={() => handleRemove(m)} className="text-slate-600 hover:text-rose-400 p-1" title="Remove">
                      <FiTrash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Role + Status badges */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {m.role === "owner" ? (
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${roleBadge.owner}`}>
                      <FiShield size={9} /> Owner
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => handleUpdateRole(m, e.target.value)}
                      className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border bg-transparent cursor-pointer border-slate-700 text-slate-300"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  )}
                  {m.status === "invited" ? (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border text-amber-400 bg-amber-950/30 border-amber-700/40 inline-flex items-center gap-1">
                      <FiMail size={9} /> Invited
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border text-emerald-400 bg-emerald-950/30 border-emerald-700/40 inline-flex items-center gap-1">
                      <FiCheck size={9} /> Active
                    </span>
                  )}
                </div>

                {/* Teams */}
                {memberTeams.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {memberTeams.map((t) => (
                      <Link key={t.id} href={`/dashboard/people/teams/${t.id}`} className="text-[10px] px-2 py-0.5 rounded-full border hover:border-fuchsia-500/40 transition" style={{ borderColor: `${t.color}40`, backgroundColor: `${t.color}15`, color: t.color }}>
                        {t.name}
                      </Link>
                    ))}
                  </div>
                )}

                {/* License toggle */}
                {m.role !== "owner" && (
                  <button
                    onClick={() => handleToggleLicense(m)}
                    className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded transition ${
                      m.licensed
                        ? "text-emerald-400 hover:bg-emerald-950/30"
                        : "text-slate-500 hover:bg-slate-800"
                    }`}
                  >
                    {m.licensed ? <FiToggleRight size={14} /> : <FiToggleLeft size={14} />}
                    {m.licensed ? "Licensed" : "Unlicensed"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
