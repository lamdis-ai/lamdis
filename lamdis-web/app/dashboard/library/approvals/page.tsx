"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FiPlus, FiUserCheck, FiUsers, FiArrowRight } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface ApprovalChainStep {
  roleId: string;
  mode: "serial" | "parallel";
  parallelMode?: "unanimous" | "quorum" | "first_responder";
  roleName?: string;
}

interface ApprovalChain {
  id: string;
  name: string;
  description: string | null;
  steps: ApprovalChainStep[];
  stepsExpanded?: Array<ApprovalChainStep & { roleName: string }>;
  createdAt: string;
  updatedAt: string;
}

const modeBadge: Record<string, string> = {
  serial: "text-sky-400 bg-sky-950/30 border-sky-700/40",
  parallel: "text-amber-400 bg-amber-950/30 border-amber-700/40",
};

export default function ApprovalsPage() {
  const [chains, setChains] = useState<ApprovalChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/orgs/approval-chains");
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = await res.json();
        if (!cancelled) setChains(data?.items || []);
      } catch (e: any) {
        if (!cancelled) {
          if (isAuthError(e)) setShowAuthError(true);
          else setError(e?.message || "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-6xl space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/library/approvals" />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Approval Chains</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Define who must approve actions at each step of a playbook. Each chain is an ordered
            sequence of approver roles — people or groups who review and sign off before the agent
            can proceed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/library/approvals/roles"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
          >
            <FiUsers size={14} /> Approver Roles
          </Link>
          <Link
            href="/dashboard/library/approvals/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
          >
            <FiPlus /> New chain
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : chains.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <FiUserCheck className="mx-auto text-slate-700 mb-3" size={36} />
          <h2 className="text-base font-medium text-slate-200 mb-1">No approval chains yet</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Approval chains define who must approve before the agent can proceed with a step.
            Start by creating your first chain — for example, a "Manager sign-off" or
            "Compliance review" chain.
          </p>
          <Link
            href="/dashboard/library/approvals/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
          >
            <FiPlus /> Create your first chain
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {chains.map((chain) => {
            const steps = chain.stepsExpanded || chain.steps || [];
            return (
              <Link
                key={chain.id}
                href={`/dashboard/library/approvals/${chain.id}`}
                className="block rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-fuchsia-500/40 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium text-slate-100">{chain.name}</h3>
                  <span className="text-[10px] text-slate-500">{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
                </div>
                {chain.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">{chain.description}</p>
                )}
                {steps.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {steps.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span className="text-[10px] text-slate-300 bg-slate-800/60 px-1.5 py-0.5 rounded">
                          {(s as any).roleName || "Role"}
                        </span>
                        <span className={`text-[9px] uppercase tracking-wide px-1 py-0.5 rounded border ${modeBadge[s.mode] || modeBadge.serial}`}>
                          {s.mode}
                        </span>
                        {i < steps.length - 1 && <FiArrowRight size={10} className="text-slate-600 mx-0.5" />}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[11px] text-slate-600">
                  Updated {new Date(chain.updatedAt).toLocaleDateString()}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
