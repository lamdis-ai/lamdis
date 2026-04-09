"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FiPlus, FiUsers, FiTrash2, FiEdit2, FiX } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  memberCount: number;
  members: Array<{ memberId: string; email: string | null; role: string | null }>;
  createdAt: string;
}

const COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#3b82f6", "#f97316"];

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline create
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await authFetch("/api/orgs/teams");
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setTeams((await res.json())?.items || []);
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/orgs/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined, color: newColor }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      setCreating(false);
      setNewName(""); setNewDesc(""); setNewColor(COLORS[0]);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(team: Team) {
    if (!confirm(`Delete team "${team.name}"?`)) return;
    try {
      await authFetch(`/api/orgs/teams/${team.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/people/teams" />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Teams</h1>
          <p className="text-sm text-slate-400 mt-1">
            Organize people into teams. Teams show up on member cards and can be referenced
            by approver roles in playbooks.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
          >
            <FiPlus /> New team
          </button>
        )}
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {/* Inline create */}
      {creating && (
        <form onSubmit={handleCreate} className="rounded-xl border border-fuchsia-500/30 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-200">New Team</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
              <input className={inputCls} required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Engineering" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Color</label>
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition ${newColor === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <input className={inputCls} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What this team does (optional)" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
              {saving ? "Creating…" : "Create team"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : teams.length === 0 && !creating ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <FiUsers className="mx-auto text-slate-700 mb-3" size={36} />
          <h2 className="text-base font-medium text-slate-200 mb-1">No teams yet</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Teams are named groups of people — like "Engineering", "Operations", or "Compliance".
            Members can be on multiple teams.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
          >
            <FiPlus /> Create your first team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/dashboard/people/teams/${team.id}`}
              className="block rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-fuchsia-500/40 transition group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                  <h3 className="text-sm font-medium text-slate-100">{team.name}</h3>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(team); }}
                  className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition p-1"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
              {team.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{team.description}</p>}
              <div className="flex items-center gap-2">
                <FiUsers size={12} className="text-slate-600" />
                <span className="text-xs text-slate-500">{team.memberCount} member{team.memberCount !== 1 ? "s" : ""}</span>
              </div>
              {team.members.length > 0 && (
                <div className="mt-2 flex -space-x-1">
                  {team.members.slice(0, 5).map((m, i) => (
                    <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-[9px] text-white font-bold border-2 border-slate-900" title={m.email || undefined}>
                      {m.email?.charAt(0).toUpperCase() || "?"}
                    </div>
                  ))}
                  {team.members.length > 5 && (
                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[9px] text-slate-400 font-bold border-2 border-slate-900">
                      +{team.members.length - 5}
                    </div>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
