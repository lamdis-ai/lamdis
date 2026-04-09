"use client";
import { useEffect, useState } from "react";
import { FiPlus, FiEdit2, FiTrash2, FiShield, FiX, FiUsers, FiChevronDown, FiChevronRight } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
}

interface Category {
  key: string;
  label: string;
  description: string;
  permissions: Array<{ permission: string; description: string }>;
}

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none";

export default function PeopleRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPerms, setFormPerms] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([
        authFetch("/api/orgs/roles"),
        authFetch("/api/orgs/permissions"),
      ]);
      if (rRes.ok) setRoles((await rRes.json())?.roles || []);
      if (pRes.ok) setCategories((await pRes.json())?.categories || []);
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingRole(null); setFormName(""); setFormDesc(""); setFormPerms(new Set()); setShowModal(true);
  }
  function openEdit(role: Role) {
    setEditingRole(role); setFormName(role.name); setFormDesc(role.description || ""); setFormPerms(new Set(role.permissions)); setShowModal(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const url = editingRole ? `/api/orgs/roles/${editingRole.id}` : "/api/orgs/roles";
      const method = editingRole ? "PATCH" : "POST";
      const res = await authFetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || undefined, permissions: [...formPerms] }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: Role) {
    if (role.isSystem) return;
    if (!confirm(`Delete "${role.name}"?`)) return;
    try {
      await authFetch(`/api/orgs/roles/${role.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed");
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/people/roles" />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Roles & Permissions</h1>
          <p className="text-sm text-slate-400 mt-1">
            Roles control what members can see and do. System roles are built-in; create custom
            roles for specific needs.
          </p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium">
          <FiPlus /> New role
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 transition">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${role.isSystem ? "bg-fuchsia-500/20" : "bg-slate-800"}`}>
                    <FiShield size={14} className={role.isSystem ? "text-fuchsia-300" : "text-slate-400"} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-100">{role.name}</h3>
                    {role.isSystem && <span className="text-[9px] text-fuchsia-400 uppercase">System</span>}
                  </div>
                </div>
                {!role.isSystem && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(role)} className="text-slate-600 hover:text-slate-300 p-1"><FiEdit2 size={12} /></button>
                    <button onClick={() => handleDelete(role)} className="text-slate-600 hover:text-rose-400 p-1"><FiTrash2 size={12} /></button>
                  </div>
                )}
              </div>
              {role.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{role.description}</p>}
              <div className="text-[10px] text-slate-600">
                {role.permissions?.length || 0} permission{role.permissions?.length !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">{editingRole ? "Edit Role" : "New Role"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300"><FiX size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                  <input className={inputCls} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. QA Engineer" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <input className={inputCls} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="What this role is for" />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium text-slate-400 mb-2">Permissions</h3>
                <div className="space-y-1">
                  {categories.map((cat) => {
                    const expanded = expandedCats.has(cat.key);
                    const count = cat.permissions.filter((p) => formPerms.has(p.permission)).length;
                    return (
                      <div key={cat.key} className="border border-slate-800 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedCats((s) => { const n = new Set(s); n.has(cat.key) ? n.delete(cat.key) : n.add(cat.key); return n; })}
                          className="w-full px-3 py-2 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition text-left"
                        >
                          <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
                            {expanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                            {cat.label}
                            {count > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300">{count}</span>}
                          </span>
                        </button>
                        {expanded && (
                          <div className="px-3 py-2 space-y-0.5">
                            {cat.permissions.map((p) => (
                              <label key={p.permission} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/30 cursor-pointer">
                                <input type="checkbox" checked={formPerms.has(p.permission)} onChange={() => setFormPerms((s) => { const n = new Set(s); n.has(p.permission) ? n.delete(p.permission) : n.add(p.permission); return n; })} className="rounded border-slate-600 bg-slate-700 text-fuchsia-500" />
                                <span className="text-[11px] text-slate-300 font-mono">{p.permission}</span>
                                <span className="text-[10px] text-slate-500">{p.description}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formName.trim()} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium">
                {saving ? "Saving…" : editingRole ? "Save changes" : "Create role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
