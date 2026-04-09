"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumbs from "@/components/base/Breadcrumbs";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

type Category = {
  id: string;
  name: string;
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const selectCls =
  "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

export default function NewPolicyPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAuthError, setShowAuthError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    categoryId: "",
    content: "",
    status: "draft" as "draft" | "active",
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await authFetch("/api/orgs/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(Array.isArray(data) ? data : data?.categories || []);
        }
      } catch (err) {
        if (isAuthError(err)) setShowAuthError(true);
      }
    };
    fetchCategories();
  }, []);

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = tagInput.trim();
      if (value && !tags.includes(value)) {
        setTags((prev) => [...prev, value]);
      }
      setTagInput("");
    }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/orgs/policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          categoryId: form.categoryId || undefined,
          content: form.content,
          status: form.status,
          tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to create policy (${res.status})`);
      }

      const created = await res.json();
      router.push(`/dashboard/library/policies/${created.id}`);
    } catch (err: any) {
      if (isAuthError(err)) {
        setShowAuthError(true);
      } else {
        setError(err?.message || "Failed to create policy");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Policies", href: "/dashboard/library/policies" },
          { label: "New Policy" },
        ]}
      />

      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        returnTo="/dashboard/library/policies/new"
      />

      <h1 className="text-2xl font-semibold text-slate-100 mb-6">New Policy</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className={labelCls}>Title</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g., Data Retention Policy"
            className={inputCls}
          />
        </div>

        {/* Category */}
        <div>
          <label className={labelCls}>Category</label>
          <select
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className={`${selectCls} w-full`}
          >
            <option value="">Select a category...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className={labelCls}>Tags</label>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-2 min-h-[42px]">
            <div className="flex flex-wrap gap-1.5 mb-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-slate-500 hover:text-slate-200 ml-0.5"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder={tags.length === 0 ? "Type a tag and press Enter or comma to add" : "Add more..."}
              className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none px-1 py-0.5"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">Press Enter or comma to add. Backspace to remove last.</p>
        </div>

        {/* Content */}
        <div>
          <label className={labelCls}>Content (Markdown)</label>
          <textarea
            rows={20}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Write your policy content here using Markdown..."
            className={`${inputCls} font-mono`}
          />
        </div>

        {/* Status */}
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "draft" | "active" }))}
            className={`${selectCls} w-full`}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !form.title.trim()}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save Policy"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
