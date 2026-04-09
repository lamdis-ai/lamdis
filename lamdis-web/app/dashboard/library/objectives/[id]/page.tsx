"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';
import { getProofTypeLabel } from '@/lib/proofTypes';
import { FiClipboard, FiCheckCircle, FiArchive } from 'react-icons/fi';
import { authFetch } from '@/lib/authFetch';

export const dynamic = 'force-dynamic';

const riskClassVariant: Record<string, string> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
  minimal: 'neutral',
};

const proofStatusVariant: Record<string, string> = {
  proven: 'success',
  partial: 'warning',
  unproven: 'neutral',
  disproven: 'danger',
};

export default function OutcomeDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [outcome, setOutcome] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/orgs/outcomes/${id}`, { cache: 'no-store' }).then(r => r.json()),
    ])
      .then(([outcomeData]) => {
        setOutcome(outcomeData);
        setStats(outcomeData?.stats || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const res = await fetch(`/api/orgs/outcomes/${id}?format=${format}&export=true`, { cache: 'no-store' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `outcome-export-${id.slice(0, 8)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setExporting(false);
  };

  if (loading) return <div className="text-center text-slate-500 py-12">Loading...</div>;
  if (!outcome) return <div className="text-center text-slate-500 py-12">Objective not found</div>;

  const successCriteria = outcome.successCriteria || [];
  const keyDecisions = outcome.keyDecisions || [];
  const connectedSystems = outcome.connectedSystems || [];
  const proofExpectations = outcome.proofExpectations || [];
  const recentInstances = outcome.recentInstances || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Link href="/dashboard/library/objectives" className="hover:text-slate-200">Objectives</Link>
            <span>/</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{outcome.name}</h1>
          {outcome.description && <p className="text-sm text-slate-400 mt-1">{outcome.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/library/objectives/${id}/edit`}
            className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Edit
          </Link>
          <Badge variant={(riskClassVariant[outcome.riskClass] || 'neutral') as any}>
            {outcome.riskClass || 'unclassified'}
          </Badge>
          {outcome.disabled && <Badge variant="warning">Disabled</Badge>}
        </div>
      </div>

      {/* Playbooks for this objective */}
      <PlaybooksSection outcomeTypeId={id} />

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-fuchsia-400">{successCriteria.length}</div>
            <div className="text-xs text-slate-400 mt-1">Success Criteria</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-cyan-400">{keyDecisions.length}</div>
            <div className="text-xs text-slate-400 mt-1">Key Decisions</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-violet-400">{connectedSystems.length}</div>
            <div className="text-xs text-slate-400 mt-1">Connected Systems</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats?.proven || 0}</div>
            <div className="text-xs text-slate-400 mt-1">Proven</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-2xl font-bold text-rose-400">{stats?.disproven || 0}</div>
            <div className="text-xs text-slate-400 mt-1">Disproven</div>
          </div>
        </Card>
      </div>

      {/* Export/Stats buttons */}
      <div className="flex gap-2">
        <button onClick={() => handleExport('csv')} disabled={exporting} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors">
          Export CSV
        </button>
        <button onClick={() => handleExport('json')} disabled={exporting} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors">
          Export JSON
        </button>
      </div>

      {/* Success Criteria */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Success Criteria</h2>
        {successCriteria.length === 0 ? (
          <Card><div className="p-6 text-center text-slate-500">No success criteria defined</div></Card>
        ) : (
          <div className="space-y-3">
            {successCriteria.map((criterion: any, idx: number) => (
              <Card key={criterion.id || idx}>
                <div className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-100">{criterion.name}</span>
                    {criterion.description && <p className="text-xs text-slate-400 mt-1">{criterion.description}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-mono font-bold text-fuchsia-400">
                      {criterion.threshold != null ? `${(criterion.threshold * 100).toFixed(0)}${criterion.unit || '%'}` : '--'}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Key Decisions */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Key Decisions</h2>
        {keyDecisions.length === 0 ? (
          <Card><div className="p-6 text-center text-slate-500">No key decisions defined</div></Card>
        ) : (
          <div className="space-y-3">
            {keyDecisions.map((decision: any, idx: number) => (
              <Card key={decision.id || idx}>
                <div className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-100">{decision.name}</span>
                      <Badge variant={decision.automationMode === 'autonomous' ? 'info' : decision.automationMode === 'manual' ? 'neutral' : 'warning'}>
                        {decision.automationMode}
                      </Badge>
                      {decision.requiresHumanApproval && <Badge variant="danger">Human Required</Badge>}
                    </div>
                    {decision.description && <p className="text-xs text-slate-400 mt-1">{decision.description}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Proof Expectations */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Proof Expectations</h2>
        {proofExpectations.length === 0 ? (
          <Card><div className="p-6 text-center text-slate-500">No proof expectations defined</div></Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 uppercase">Name</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 uppercase">Type</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 uppercase">Required</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 uppercase">Description</th>
                </tr>
              </thead>
              <tbody>
                {proofExpectations.map((proof: any, idx: number) => (
                  <tr key={proof.id || idx} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="py-3 px-4 text-slate-200">{proof.name}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                        {getProofTypeLabel(proof.checkType || proof.proofType || '')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={proof.required ? 'danger' : 'neutral'}>
                        {proof.required ? 'Required' : 'Optional'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 max-w-xs truncate">{proof.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Connected Systems */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Connected Systems</h2>
        {connectedSystems.length === 0 ? (
          <Card><div className="p-6 text-center text-slate-500">No connected systems</div></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {connectedSystems.map((system: any, idx: number) => (
              <Card key={system.id || idx}>
                <div className="p-4">
                  <h3 className="text-sm font-medium text-slate-100">{system.name}</h3>
                  {system.role && <div className="text-xs text-slate-400 mt-1">{system.role}</div>}
                  {system.endpoint && <div className="text-xs text-slate-500 font-mono mt-1 truncate">{system.endpoint}</div>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Continuous Evaluation */}
      <EvaluationScheduleSection objectiveTypeId={id} />

      {/* Recent Instances */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Recent Instances</h2>
          <Link href={`/dashboard/activity/instances?outcomeId=${id}`} className="text-sm text-fuchsia-400 hover:text-fuchsia-300">
            View all
          </Link>
        </div>
        {recentInstances.length === 0 ? (
          <Card><div className="p-6 text-center text-slate-500">No instances yet</div></Card>
        ) : (
          <div className="space-y-2">
            {recentInstances.map((inst: any) => (
              <Link key={inst.id} href={`/dashboard/activity/instances/${inst.id}`}>
                <Card className="hover:border-fuchsia-500/30 transition-colors cursor-pointer">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={(proofStatusVariant[inst.proofStatus] || 'neutral') as any}>
                        {inst.proofStatus || inst.status}
                      </Badge>
                      <span className="text-sm text-slate-300 font-mono">{inst.id?.slice(0, 8)}...</span>
                      <span className="text-xs text-slate-500">{inst.environment}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {inst.confidence != null && (
                        <span className="text-fuchsia-400 font-mono">{(inst.confidence * 100).toFixed(0)}%</span>
                      )}
                      <span>{inst.automationMode}</span>
                      <span>{new Date(inst.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const playbookStatusColor: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-950/30 border-emerald-700/40",
  draft: "text-slate-400 bg-slate-800/40 border-slate-700/40",
  archived: "text-slate-600 bg-slate-900/40 border-slate-800/40",
};

function PlaybooksSection({ outcomeTypeId }: { outcomeTypeId: string }) {
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`/api/orgs/playbooks?outcomeTypeId=${outcomeTypeId}`)
      .then(r => r.json())
      .then(data => setPlaybooks(data?.playbooks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [outcomeTypeId]);

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">Playbooks</h2>
        <Link href="/dashboard/playbooks/new" className="text-sm text-fuchsia-400 hover:text-fuchsia-300">
          + New playbook
        </Link>
      </div>
      {playbooks.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <FiClipboard className="mx-auto text-slate-700 mb-2" size={24} />
            <p className="text-sm text-slate-500">No playbooks for this objective yet.</p>
            <Link href="/dashboard/playbooks/new" className="text-sm text-fuchsia-400 hover:text-fuchsia-300 mt-1 inline-block">
              Create one
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {playbooks.map((p: any) => (
            <Link key={p.id} href={`/dashboard/playbooks/${p.id}`}>
              <Card className="hover:border-fuchsia-500/30 transition-colors cursor-pointer">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-100">{p.name}</span>
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border ${playbookStatusColor[p.status] || playbookStatusColor.draft}`}>
                      {p.status === "active" && <FiCheckCircle className="inline mr-1" size={10} />}
                      {p.status === "archived" && <FiArchive className="inline mr-1" size={10} />}
                      {p.status}
                    </span>
                  </div>
                  {p.summary && <p className="text-xs text-slate-500 line-clamp-2">{p.summary}</p>}
                  <div className="text-[11px] text-slate-600 mt-1">v{p.version} · {p.source}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EvaluationScheduleSection({ objectiveTypeId }: { objectiveTypeId: string }) {
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [interval, setLocalInterval] = useState(60);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch(`/api/orgs/objectives/${objectiveTypeId}/evaluation-schedule`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.id) {
          setSchedule(data);
          setLocalInterval(data.intervalMinutes || 60);
          setEnabled(data.enabled ?? false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [objectiveTypeId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/objectives/${objectiveTypeId}/evaluation-schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: interval, enabled }),
      });
      const data = await res.json();
      if (data?.id) setSchedule(data);
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading) return null;

  const intervalOptions = [
    { value: 5, label: 'Every 5 minutes' },
    { value: 15, label: 'Every 15 minutes' },
    { value: 30, label: 'Every 30 minutes' },
    { value: 60, label: 'Every hour' },
    { value: 360, label: 'Every 6 hours' },
    { value: 1440, label: 'Every 24 hours' },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Continuous Evaluation</h2>
      <Card>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-400">
            Enable continuous evaluation to periodically re-evaluate all active instances of this objective, checking proof expectations and proposing actions automatically.
          </p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 text-fuchsia-500"
              />
              <span className="text-sm text-slate-200">Enable scheduled evaluation</span>
            </label>
            <select
              value={interval}
              onChange={e => setLocalInterval(parseInt(e.target.value))}
              disabled={!enabled}
              className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
            >
              {intervalOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {schedule?.lastRunResult && (
            <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-800">
              <p className="font-medium text-slate-400">Last run:</p>
              <div className="flex items-center gap-4">
                <span>{schedule.lastRunResult.instancesEvaluated} instances evaluated</span>
                <span>{schedule.lastRunResult.proofsUpdated} proofs updated</span>
                <span>{schedule.lastRunResult.actionsProposed} actions proposed</span>
                <span>{schedule.lastRunResult.durationMs}ms</span>
              </div>
              {schedule.lastRunAt && (
                <p>Ran at: {new Date(schedule.lastRunAt).toLocaleString()}</p>
              )}
              {schedule.nextRunAt && (
                <p>Next run: {new Date(schedule.nextRunAt).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
