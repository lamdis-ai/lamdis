"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FiEdit2, FiChevronDown, FiChevronRight } from "react-icons/fi";
import Breadcrumbs from "@/components/base/Breadcrumbs";
import Badge from "@/components/base/Badge";
import Card from "@/components/base/Card";
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
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  linkedWorkflows?: { id: string; name: string; category?: string }[];
};

type Version = {
  id: string;
  version: number;
  changedBy?: string;
  changeNote?: string;
  content?: string;
  createdAt: string;
};

type WorkflowSuggestion = {
  name: string;
  description: string;
  category: string;
  expectedEventTypes: string[];
  checks: {
    name: string;
    description: string;
    appliesTo: { eventTypes: string[] };
  }[];
};

const statusVariant: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  draft: "neutral",
  active: "info",
  archived: "warning",
};

export default function PolicyDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);

  // Convert to workflows
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WorkflowSuggestion[]>([]);
  const [selectedWorkflows, setSelectedWorkflows] = useState<Set<number>>(new Set());
  const [creatingWorkflows, setCreatingWorkflows] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);

  // Version history
  const [versions, setVersions] = useState<Version[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const fetchPolicy = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/orgs/policies/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPolicy(data);
      }
    } catch (err) {
      if (isAuthError(err)) setShowAuthError(true);
    }
    setLoading(false);
  }, [id]);

  const fetchVersions = useCallback(async () => {
    if (!id) return;
    setLoadingVersions(true);
    try {
      const res = await authFetch(`/api/orgs/policies/${id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(Array.isArray(data) ? data : data?.versions || []);
      }
    } catch (err) {
      if (isAuthError(err)) setShowAuthError(true);
    }
    setLoadingVersions(false);
  }, [id]);

  useEffect(() => {
    fetchPolicy();
    fetchVersions();
  }, [fetchPolicy, fetchVersions]);

  const handleConvert = async () => {
    if (converting) return;
    setConverting(true);
    setConvertError(null);
    setSuggestions([]);
    setSelectedWorkflows(new Set());
    setCreateResult(null);
    try {
      const res = await authFetch(`/api/orgs/policies/${id}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to convert (${res.status})`);
      }
      const data = await res.json();
      const wfs = Array.isArray(data) ? data : data?.workflows || data?.suggestions || [];
      setSuggestions(wfs);
      // Select all by default
      setSelectedWorkflows(new Set(wfs.map((_: any, i: number) => i)));
    } catch (err: any) {
      if (isAuthError(err)) {
        setShowAuthError(true);
      } else {
        setConvertError(err?.message || "Failed to convert policy");
      }
    }
    setConverting(false);
  };

  const toggleWorkflow = (index: number) => {
    setSelectedWorkflows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleCreateWorkflows = async () => {
    if (creatingWorkflows || selectedWorkflows.size === 0) return;
    setCreatingWorkflows(true);
    setCreateResult(null);
    try {
      const selected = suggestions.filter((_, i) => selectedWorkflows.has(i));
      const res = await authFetch(`/api/orgs/policies/${id}/create-workflows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflows: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to create workflows (${res.status})`);
      }
      const data = await res.json();
      setCreateResult(
        `Successfully created ${data?.created?.length || selectedWorkflows.size} workflow(s).`
      );
      // Refresh policy to get updated linkedWorkflows
      fetchPolicy();
    } catch (err: any) {
      if (isAuthError(err)) {
        setShowAuthError(true);
      } else {
        setCreateResult(err?.message || "Failed to create workflows");
      }
    }
    setCreatingWorkflows(false);
  };

  if (loading) return <div className="text-center text-slate-500 py-12">Loading...</div>;
  if (!policy) return <div className="text-center text-slate-500 py-12">Policy not found</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <Breadcrumbs
        items={[
          { label: "Policies", href: "/dashboard/library/policies" },
          { label: policy.title },
        ]}
      />

      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        returnTo={`/dashboard/library/policies/${id}`}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-slate-100">{policy.title}</h1>
            <Badge variant={statusVariant[policy.status] || "neutral"}>{policy.status}</Badge>
          </div>
        </div>
        <Link
          href={`/dashboard/library/policies/${id}/edit`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <FiEdit2 className="w-4 h-4" /> Edit
        </Link>
      </div>

      {/* Metadata */}
      <Card>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="block text-xs font-medium text-slate-400 mb-1">Category</span>
            <span className="text-sm text-slate-200">{policy.categoryName || "\u2014"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-400 mb-1">Tags</span>
            <div className="flex flex-wrap gap-1">
              {(policy.tags || []).length > 0 ? (
                policy.tags!.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-300"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">&mdash;</span>
              )}
            </div>
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-400 mb-1">Created</span>
            <span className="text-sm text-slate-200">
              {new Date(policy.createdAt).toLocaleDateString()}
            </span>
            {policy.createdBy && (
              <span className="block text-xs text-slate-500">{policy.createdBy}</span>
            )}
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-400 mb-1">Last Updated</span>
            <span className="text-sm text-slate-200">
              {new Date(policy.updatedAt).toLocaleDateString()}
            </span>
            {policy.updatedBy && (
              <span className="block text-xs text-slate-500">{policy.updatedBy}</span>
            )}
          </div>
        </div>
      </Card>

      {/* Content */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Content</h2>
        <Card>
          <div className="p-5">
            {policy.content ? (
              <div className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {policy.content}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No content yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Convert to Workflows */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-100">Convert to Workflows</h2>
          <button
            onClick={handleConvert}
            disabled={converting}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {converting ? "Analyzing..." : "Convert to Workflows"}
          </button>
        </div>

        {convertError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300 mb-4">
            {convertError}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((wf, i) => (
              <Card key={i}>
                <div className="p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedWorkflows.has(i)}
                      onChange={() => toggleWorkflow(i)}
                      className="mt-1 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-200">{wf.name}</span>
                        {wf.category && (
                          <Badge variant="neutral">{wf.category}</Badge>
                        )}
                      </div>
                      {wf.description && (
                        <p className="text-xs text-slate-400 mb-2">{wf.description}</p>
                      )}

                      {/* Expected event types */}
                      {wf.expectedEventTypes?.length > 0 && (
                        <div className="mb-2">
                          <span className="text-[11px] font-medium text-slate-500 uppercase">Expected Events</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {wf.expectedEventTypes.map((evt) => (
                              <span
                                key={evt}
                                className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 font-mono"
                              >
                                {evt}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Checks */}
                      {wf.checks?.length > 0 && (
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 uppercase">
                            Checks ({wf.checks.length})
                          </span>
                          <div className="space-y-1.5 mt-1">
                            {wf.checks.map((check, ci) => (
                              <div
                                key={ci}
                                className="rounded-md border border-slate-700/50 bg-slate-900/30 p-2"
                              >
                                <span className="text-xs text-slate-300 font-medium">
                                  {check.name}
                                </span>
                                {check.description && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {check.description}
                                  </p>
                                )}
                                {check.appliesTo?.eventTypes?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    <span className="text-[10px] text-slate-600">Applies to:</span>
                                    {check.appliesTo.eventTypes.map((evt) => (
                                      <span
                                        key={evt}
                                        className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono"
                                      >
                                        {evt}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </Card>
            ))}

            {createResult && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                {createResult}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleCreateWorkflows}
                disabled={creatingWorkflows || selectedWorkflows.size === 0}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {creatingWorkflows
                  ? "Creating..."
                  : `Create ${selectedWorkflows.size} Selected Workflow${selectedWorkflows.size !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={() => {
                  setSuggestions([]);
                  setSelectedWorkflows(new Set());
                  setCreateResult(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:bg-slate-800 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Linked Workflows */}
      {policy.linkedWorkflows && policy.linkedWorkflows.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-100 mb-3">Linked Workflows</h2>
          <div className="space-y-2">
            {policy.linkedWorkflows.map((wf) => (
              <Link key={wf.id} href={`/dashboard/workflows/${wf.id}`}>
                <Card className="hover:border-violet-500/30 transition-colors cursor-pointer">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-200">{wf.name}</span>
                      {wf.category && (
                        <Badge variant="neutral">{wf.category}</Badge>
                      )}
                    </div>
                    <FiChevronRight className="text-slate-500" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Version History */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Version History</h2>
        {loadingVersions ? (
          <p className="text-sm text-slate-500">Loading versions...</p>
        ) : versions.length === 0 ? (
          <Card>
            <div className="p-6 text-center text-slate-500 text-sm">No version history available</div>
          </Card>
        ) : (
          <div className="space-y-2">
            {versions.map((ver) => {
              const isExpanded = expandedVersion === ver.id;
              return (
                <Card key={ver.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedVersion(isExpanded ? null : ver.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono font-medium text-violet-400">
                        v{ver.version}
                      </span>
                      {ver.changeNote && (
                        <span className="text-sm text-slate-300">{ver.changeNote}</span>
                      )}
                      {ver.changedBy && (
                        <span className="text-xs text-slate-500">by {ver.changedBy}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {new Date(ver.createdAt).toLocaleDateString()}
                      </span>
                      {isExpanded ? (
                        <FiChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <FiChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </button>
                  {isExpanded && ver.content && (
                    <div className="px-4 pb-4 border-t border-slate-800">
                      <div className="mt-3 text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed bg-slate-950/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                        {ver.content}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
