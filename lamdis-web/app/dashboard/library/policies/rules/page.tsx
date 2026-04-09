"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FiArrowLeft, FiPlus, FiTrash2 } from "react-icons/fi";
import { authFetch, isAuthError } from "@/lib/authFetch";
import { AuthErrorModal } from "@/components/ui/Modal";

type Scope = "global" | "outcome_type" | "playbook" | "category";

interface Rule {
  id: string;
  name: string;
  description?: string;
  scope: Scope;
  outcomeTypeId: string | null;
  playbookId: string | null;
  categoryId: string | null;
  checkType: string;
  severity: string;
  enabled: boolean;
}

interface OutcomeType { id: string; name: string }
interface Playbook { id: string; name: string; status: string }
interface Category { id: string; name: string }

const SCOPES: Array<{ value: Scope; label: string; help: string }> = [
  { value: "global",       label: "Global",       help: "Applies to every outcome instance in this org." },
  { value: "outcome_type", label: "Outcome type", help: "Applies only to instances of one specific outcome type." },
  { value: "playbook",     label: "Playbook",     help: "Applies only when a specific playbook version is active on the instance." },
  { value: "category",     label: "Category",     help: "Applies to any outcome type tagged with this category." },
];

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none";
const selectCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [outcomeTypes, setOutcomeTypes] = useState<OutcomeType[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthError, setShowAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    scope: "global" as Scope,
    outcomeTypeId: "",
    playbookId: "",
    categoryId: "",
    checkType: "judge",
    severity: "error",
    requiredEvidenceLevel: "A",
    judgeRubric: "",
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [rRes, oRes, pRes, cRes] = await Promise.all([
        authFetch("/api/orgs/proof-expectations"),
        authFetch("/api/orgs/outcomes"),
        authFetch("/api/orgs/playbooks"),
        authFetch("/api/orgs/categories"),
      ]);
      if (!rRes.ok) throw new Error(`rules: ${rRes.status}`);
      const rJson = await rRes.json();
      setRules(Array.isArray(rJson) ? rJson : rJson?.items || []);
      if (oRes.ok) {
        const j = await oRes.json();
        setOutcomeTypes(Array.isArray(j) ? j : j?.outcomes || j?.items || []);
      }
      if (pRes.ok) {
        const j = await pRes.json();
        setPlaybooks(Array.isArray(j) ? j : j?.playbooks || j?.items || []);
      }
      if (cRes.ok) {
        const j = await cRes.json();
        setCategories(Array.isArray(j) ? j : j?.categories || j?.items || []);
      }
      setError(null);
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        scope: form.scope,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        checkType: form.checkType,
        severity: form.severity,
        requiredEvidenceLevel: form.requiredEvidenceLevel,
        config: form.checkType === "judge" ? { rubric: form.judgeRubric } : {},
        enabled: true,
      };
      if (form.scope === "outcome_type") body.outcomeTypeId = form.outcomeTypeId;
      if (form.scope === "playbook") body.playbookId = form.playbookId;
      if (form.scope === "category") body.categoryId = form.categoryId;

      const res = await authFetch("/api/orgs/proof-expectations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${res.status})`);
      }
      setShowForm(false);
      setForm({ ...form, name: "", description: "", judgeRubric: "" });
      await loadAll();
    } catch (e: any) {
      if (isAuthError(e)) setShowAuthError(true);
      else setError(e?.message || "Failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this rule?")) return;
    await authFetch(`/api/orgs/proof-expectations/${id}`, { method: "DELETE" });
    await loadAll();
  }

  function scopeLabel(rule: Rule): string {
    if (rule.scope === "global") return "Global";
    if (rule.scope === "outcome_type") {
      const ot = outcomeTypes.find((o) => o.id === rule.outcomeTypeId);
      return `Outcome: ${ot?.name || rule.outcomeTypeId?.slice(0, 8)}`;
    }
    if (rule.scope === "playbook") {
      const pb = playbooks.find((p) => p.id === rule.playbookId);
      return `Playbook: ${pb?.name || rule.playbookId?.slice(0, 8)}`;
    }
    if (rule.scope === "category") {
      const c = categories.find((c) => c.id === rule.categoryId);
      return `Category: ${c?.name || rule.categoryId?.slice(0, 8)}`;
    }
    return rule.scope;
  }

  const groupedByScope = {
    global:        rules.filter((r) => r.scope === "global"),
    outcome_type:  rules.filter((r) => r.scope === "outcome_type"),
    playbook:      rules.filter((r) => r.scope === "playbook"),
    category:      rules.filter((r) => r.scope === "category"),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} returnTo="/dashboard/library/policies/rules" />

      <Link href="/dashboard/library/policies" className="text-sm text-slate-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
        <FiArrowLeft /> Back to Policies
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Rules</h1>
          <p className="text-sm text-slate-400 mt-1">
            Runtime checks evaluated against outcome instances. Each rule attaches at one of four scopes.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm"
        >
          <FiPlus /> {showForm ? "Cancel" : "New rule"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {showForm && (
        <form onSubmit={createRule} className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
          <div>
            <label className={labelCls}>Scope</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SCOPES.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${form.scope === s.value ? "border-violet-500 bg-violet-950/20" : "border-slate-700 bg-slate-800/30"}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={s.value}
                    checked={form.scope === s.value}
                    onChange={() => setForm({ ...form, scope: s.value })}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm text-slate-100">{s.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.help}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {form.scope === "outcome_type" && (
            <div>
              <label className={labelCls}>Outcome type</label>
              <select className={selectCls} value={form.outcomeTypeId} onChange={(e) => setForm({ ...form, outcomeTypeId: e.target.value })} required>
                <option value="">Select…</option>
                {outcomeTypes.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          {form.scope === "playbook" && (
            <div>
              <label className={labelCls}>Playbook</label>
              <select className={selectCls} value={form.playbookId} onChange={(e) => setForm({ ...form, playbookId: e.target.value })} required>
                <option value="">Select…</option>
                {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name} {p.status !== "active" ? `(${p.status})` : ""}</option>)}
              </select>
            </div>
          )}
          {form.scope === "category" && (
            <div>
              <label className={labelCls}>Category</label>
              <select className={selectCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                <option value="">Select…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Never share PII in transcripts" />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this rule verifies" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Check type</label>
              <select className={selectCls} value={form.checkType} onChange={(e) => setForm({ ...form, checkType: e.target.value })}>
                <option value="judge">judge (LLM)</option>
                <option value="includes">includes</option>
                <option value="regex">regex</option>
                <option value="event_presence">event_presence</option>
                <option value="confirmation_level">confirmation_level</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Severity</label>
              <select className={selectCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="critical">critical</option>
                <option value="error">error</option>
                <option value="warning">warning</option>
                <option value="info">info</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Min evidence level</label>
              <select className={selectCls} value={form.requiredEvidenceLevel} onChange={(e) => setForm({ ...form, requiredEvidenceLevel: e.target.value })}>
                <option value="A">A — intent</option>
                <option value="B">B — attempted</option>
                <option value="C">C — acknowledged</option>
                <option value="D">D — confirmed</option>
                <option value="E">E — completed</option>
              </select>
            </div>
          </div>

          {form.checkType === "judge" && (
            <div>
              <label className={labelCls}>Judge rubric</label>
              <textarea
                rows={4}
                className={inputCls}
                value={form.judgeRubric}
                onChange={(e) => setForm({ ...form, judgeRubric: e.target.value })}
                placeholder="Plain-English criteria the LLM should evaluate against."
              />
            </div>
          )}

          <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm">
            {creating ? "Creating…" : "Create rule"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-sm text-slate-500">No rules yet.</div>
      ) : (
        <div className="space-y-5">
          {(["global", "outcome_type", "playbook", "category"] as Scope[]).map((s) => {
            const list = groupedByScope[s];
            if (list.length === 0) return null;
            const meta = SCOPES.find((x) => x.value === s)!;
            return (
              <div key={s} className="rounded-xl border border-slate-800 bg-slate-900/40">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-100">{meta.label} rules</div>
                    <div className="text-xs text-slate-500">{meta.help}</div>
                  </div>
                  <span className="text-xs text-slate-500">{list.length}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Attached to</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Severity</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800/50 text-slate-300">
                        <td className="px-4 py-2">
                          <div className="text-slate-100">{r.name}</div>
                          {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{scopeLabel(r)}</td>
                        <td className="px-4 py-2 font-mono text-slate-500">{r.checkType}</td>
                        <td className="px-4 py-2">{r.severity}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => deleteRule(r.id)} className="text-slate-500 hover:text-rose-400" title="Delete">
                            <FiTrash2 />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
