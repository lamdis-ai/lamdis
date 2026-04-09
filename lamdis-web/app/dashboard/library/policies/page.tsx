"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FiShield, FiFilter, FiX, FiPlus, FiRefreshCw } from "react-icons/fi";
import Breadcrumbs from "@/components/base/Breadcrumbs";
import Badge from "@/components/base/Badge";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

type Policy = {
  id: string;
  title: string;
  content?: string;
  status: "draft" | "active" | "archived";
  categoryId?: string;
  categoryName?: string;
  tags?: string[];
  updatedAt: string;
  updatedBy?: string;
};

type Category = {
  id: string;
  name: string;
};

const statusVariant: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  draft: "neutral",
  active: "info",
  archived: "warning",
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [filters, setFilters] = useState({ category: "", status: "" });

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/orgs/policies");
      if (res.ok) {
        const data = await res.json();
        setPolicies(Array.isArray(data) ? data : data?.policies || []);
      }
    } catch (err) {
      if (isAuthError(err)) setShowAuthError(true);
    }
    setLoading(false);
  };

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

  useEffect(() => {
    fetchPolicies();
    fetchCategories();
  }, []);

  const filtered = policies.filter((p) => {
    if (filters.category && p.categoryId !== filters.category && p.categoryName !== filters.category) return false;
    if (filters.status && p.status !== filters.status) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Breadcrumbs items={[{ label: "Policies" }]} />

      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        returnTo="/dashboard/library/policies"
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Policies</h1>
          <p className="text-slate-400 text-sm mt-1">
            Your organization&apos;s policy knowledge base
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPolicies}
            className="flex items-center gap-2 px-3 py-2 border border-slate-700 rounded-lg text-slate-300 hover:border-slate-600 transition-colors"
          >
            <FiRefreshCw /> Refresh
          </button>
          <Link
            href="/dashboard/library/policies/rules"
            className="flex items-center gap-2 px-3 py-2 border border-slate-700 rounded-lg text-slate-300 hover:border-slate-600 transition-colors text-sm"
            title="Manage runtime rules (proof expectations) at any scope"
          >
            <FiShield /> Manage rules
          </Link>
          <Link
            href="/dashboard/library/policies/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <FiPlus /> Create Policy
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="border border-slate-700 rounded-xl bg-slate-900/50 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FiFilter className="text-slate-400" />
          <span className="text-sm text-slate-300">Filters</span>
          {(filters.category || filters.status) && (
            <button
              onClick={() => setFilters({ category: "", status: "" })}
              className="ml-auto text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <FiX className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-slate-400 mb-4">
        Showing {filtered.length} of {policies.length} policies
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading policies...</div>
      ) : filtered.length === 0 ? (
        <div className="border border-slate-700 rounded-xl bg-slate-900/50 p-12 text-center">
          <FiShield className="mx-auto text-4xl text-slate-600 mb-4" />
          <h3 className="text-slate-300 font-medium mb-2">No Policies Found</h3>
          <p className="text-slate-500 text-sm">
            {filters.category || filters.status
              ? "Try adjusting your filters."
              : "Create a policy document to build your knowledge base."}
          </p>
        </div>
      ) : (
        <div className="border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Title</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tags</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Last Updated</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Updated By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/library/policies/${p.id}`}
                      className="text-slate-200 hover:text-violet-300 font-medium text-sm"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-300">{p.categoryName || "\u2014"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[p.status] || "neutral"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                      {(!p.tags || p.tags.length === 0) && (
                        <span className="text-sm text-slate-500">&mdash;</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-400">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-400">{p.updatedBy || "\u2014"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
