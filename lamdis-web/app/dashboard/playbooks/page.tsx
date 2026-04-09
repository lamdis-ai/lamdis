"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FiPlus, FiClipboard, FiArchive, FiCheckCircle } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

interface Playbook {
  id: string;
  outcomeTypeId: string;
  outcomeTypeName?: string;
  name: string;
  summary: string | null;
  status: "draft" | "active" | "archived";
  version: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

const statusColor: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-950/30 border-emerald-700/40",
  draft: "text-slate-400 bg-slate-800/40 border-slate-700/40",
  archived: "text-slate-600 bg-slate-900/40 border-slate-800/40",
};

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/orgs/playbooks");
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const json = await res.json();
        if (!cancelled) {
          setPlaybooks(json?.playbooks || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          if (isAuthError(e)) setShowAuthError(true);
          else setError(e?.message || "Failed to load playbooks");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = {
    active: playbooks.filter((p) => p.status === "active"),
    draft: playbooks.filter((p) => p.status === "draft"),
    archived: playbooks.filter((p) => p.status === "archived"),
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/playbooks" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Playbooks</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Each playbook captures one of your business processes — what systems it uses,
            what documents it requires, who approves what, and the order it happens in.
            Create your playbooks first, then start objectives that follow them.
          </p>
        </div>
        <Link
          href="/dashboard/playbooks/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
        >
          <FiPlus /> New playbook
        </Link>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : playbooks.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <FiClipboard className="mx-auto text-slate-700 mb-3" size={36} />
          <h2 className="text-base font-medium text-slate-200 mb-1">No playbooks yet</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            A playbook is the recipe for one of your business processes. Start by writing the
            most common one your team runs — onboarding a customer, processing a refund,
            selling a product.
          </p>
          <Link
            href="/dashboard/playbooks/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium"
          >
            <FiPlus /> Create your first playbook
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {(["active", "draft", "archived"] as const).map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;
            return (
              <div key={status} className="space-y-2">
                <h2 className="text-xs uppercase tracking-wide text-slate-500 font-medium">{status} ({list.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {list.map((p) => (
                    <Link
                      key={p.id}
                      href={`/dashboard/playbooks/${p.id}`}
                      className="block rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-fuchsia-500/40 transition"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="text-sm font-medium text-slate-100">{p.name}</h3>
                        <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border ${statusColor[p.status]}`}>
                          {p.status === "active" && <FiCheckCircle className="inline mr-1" size={10} />}
                          {p.status === "archived" && <FiArchive className="inline mr-1" size={10} />}
                          {p.status}
                        </span>
                      </div>
                      {p.outcomeTypeName && (
                        <div className="text-[10px] text-slate-500 mb-1">
                          For: <span className="text-fuchsia-400/70">{p.outcomeTypeName}</span>
                        </div>
                      )}
                      {p.summary && <p className="text-xs text-slate-500 line-clamp-2">{p.summary}</p>}
                      <div className="mt-2 text-[11px] text-slate-600">
                        v{p.version} · {p.source} · updated {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
