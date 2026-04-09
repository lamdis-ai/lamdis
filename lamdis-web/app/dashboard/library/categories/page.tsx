"use client";
import { useEffect, useState } from "react";
import { FiFolder, FiPlus, FiEdit2, FiTrash2, FiChevronRight } from "react-icons/fi";
import Breadcrumbs from "@/components/base/Breadcrumbs";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  entityType: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
};

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", entityType: "all", parentId: "", color: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/orgs/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (isAuthError(err)) setShowAuthError(true);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const rootCategories = categories.filter(c => !c.parentId);
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId);

  const openCreate = (parentId?: string) => {
    setEditing(null);
    setForm({ name: "", entityType: "all", parentId: parentId || "", color: "" });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({ name: cat.name, entityType: cat.entityType, parentId: cat.parentId || "", color: cat.color || "" });
    setShowForm(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        entityType: form.entityType,
        parentId: form.parentId || undefined,
        color: form.color || undefined,
      };
      let res;
      if (editing) {
        res = await authFetch(`/api/orgs/categories/${editing.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch("/api/orgs/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `Failed (${res.status})`);
      }
      setShowForm(false);
      fetchCategories();
    } catch (err: any) {
      setError(err?.message || "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      const res = await authFetch(`/api/orgs/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Failed to delete");
        return;
      }
      fetchCategories();
    } catch {}
  };

  const renderCategory = (cat: Category, depth: number = 0) => {
    const children = getChildren(cat.id);
    return (
      <div key={cat.id}>
        <div
          className="flex items-center gap-2 px-4 py-3 hover:bg-slate-800/30 transition-colors border-b border-slate-800/50"
          style={{ paddingLeft: `${16 + depth * 24}px` }}
        >
          {children.length > 0 && <FiChevronRight className="text-slate-500 w-3 h-3" />}
          {cat.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />}
          <FiFolder className="text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-200 flex-1">{cat.name}</span>
          <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
            {cat.entityType}
          </span>
          <button onClick={() => openCreate(cat.id)} className="p-1 text-slate-500 hover:text-slate-300" title="Add subcategory">
            <FiPlus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => openEdit(cat)} className="p-1 text-slate-500 hover:text-slate-300" title="Edit">
            <FiEdit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleDelete(cat.id)} className="p-1 text-slate-500 hover:text-rose-400" title="Delete">
            <FiTrash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {children.map(child => renderCategory(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumbs items={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Categories" }]} />
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/library/categories" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Categories</h1>
          <p className="text-slate-400 text-sm mt-1">Organize policies and workflows into a hierarchy.</p>
        </div>
        <button
          onClick={() => openCreate()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <FiPlus /> New Category
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="border border-slate-700 rounded-xl bg-slate-900/50 p-5 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">
            {editing ? "Edit Category" : form.parentId ? "New Subcategory" : "New Category"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Data Privacy"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Applies To</label>
              <select
                value={form.entityType}
                onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))}
                className={`${selectCls} w-full`}
              >
                <option value="all">All (Policies & Workflows)</option>
                <option value="policy">Policies only</option>
                <option value="workflow">Workflows only</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Color (optional)</label>
            <input
              type="text"
              value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              placeholder="#8b5cf6"
              className={`${inputCls} w-48`}
            />
          </div>
          {error && <div className="text-xs text-rose-400">{error}</div>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category tree */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading categories...</div>
      ) : categories.length === 0 ? (
        <div className="border border-slate-700 rounded-xl bg-slate-900/50 p-12 text-center">
          <FiFolder className="mx-auto text-4xl text-slate-600 mb-4" />
          <h3 className="text-slate-300 font-medium mb-2">No Categories</h3>
          <p className="text-slate-500 text-sm">Create categories to organize your policies and workflows.</p>
        </div>
      ) : (
        <div className="border border-slate-700 rounded-xl overflow-hidden">
          {rootCategories.map(cat => renderCategory(cat))}
        </div>
      )}
    </div>
  );
}
