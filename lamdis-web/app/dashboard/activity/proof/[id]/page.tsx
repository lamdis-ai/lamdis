"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const decisionTypeVariant: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  automated: 'info',
  human: 'neutral',
  escalated: 'warning',
  override: 'danger',
};

export default function DossierDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [dossier, setDossier] = useState<any>(null);
  const [instance, setInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orgs/dossiers/${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setDossier(data);
        if (data?.outcomeInstanceId) {
          fetch(`/api/orgs/outcome-instances/${data.outcomeInstanceId}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(inst => setInstance(inst))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center text-slate-500 py-12">Loading dossier...</div>;
  }

  if (!dossier) {
    return <div className="text-center text-slate-400 py-16">Dossier not found</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Badge variant={decisionTypeVariant[dossier.decisionType] || 'neutral'}>
          {dossier.decisionType || 'unknown'}
        </Badge>
        {dossier.confidence != null && (
          <span className="text-lg font-mono font-bold text-fuchsia-400">
            {Math.round(dossier.confidence * 100)}% confidence
          </span>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Link href="/dashboard/activity/proof" className="hover:text-slate-200">Decisions</Link>
          <span>/</span>
          <span className="font-mono text-slate-300">{id?.slice(0, 12)}...</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Decision Record</h1>
      </div>

      {/* Related context */}
      {dossier.outcomeInstanceId && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Related to</span>
            <div className="text-sm text-slate-200 mt-0.5">
              {(instance?.outcome?.name || instance?.workflow?.name) ? (
                <>{instance.outcome?.name || instance.workflow?.name} — </>
              ) : null}
              <span className="font-mono text-slate-400">Instance {dossier.outcomeInstanceId.slice(0, 10)}...</span>
            </div>
          </div>
          <Link
            href={`/dashboard/activity/instances/${dossier.outcomeInstanceId}`}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            View Instance
          </Link>
        </div>
      )}

      {/* Summary */}
      {dossier.summary && (
        <Card>
          <div className="p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Summary</h2>
            <p className="text-sm text-slate-300">{dossier.summary}</p>
          </div>
        </Card>
      )}

      {/* Facts Considered */}
      {dossier.factsConsidered && dossier.factsConsidered.length > 0 && (
        <Card>
          <div className="p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Facts Considered</h2>
            <div className="space-y-2">
              {dossier.factsConsidered.map((fact: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded bg-slate-800/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300">{fact.description || fact.fact || JSON.stringify(fact)}</p>
                    {fact.source && (
                      <span className="text-xs text-slate-500">Source: {fact.source}</span>
                    )}
                  </div>
                  {fact.weight != null && (
                    <span className="text-xs font-mono text-fuchsia-400 shrink-0">
                      w:{fact.weight}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Proof Chain */}
      {dossier.proofChain && dossier.proofChain.length > 0 && (
        <Card>
          <div className="p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Proof Chain</h2>
            <div className="space-y-2">
              {dossier.proofChain.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded bg-slate-800/50">
                  <Badge variant={item.passed ? 'success' : item.passed === false ? 'danger' : 'neutral'}>
                    {item.passed ? 'pass' : item.passed === false ? 'fail' : 'n/a'}
                  </Badge>
                  <span className="text-sm text-slate-300 flex-1">
                    {item.expectation || item.checkName || JSON.stringify(item)}
                  </span>
                  {item.result && (
                    <span className="text-xs text-slate-500">{item.result}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Risk Assessment */}
      {dossier.riskAssessment && (
        <Card>
          <div className="p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Risk Assessment</h2>
            {typeof dossier.riskAssessment === 'string' ? (
              <p className="text-sm text-slate-300">{dossier.riskAssessment}</p>
            ) : (
              <pre className="text-xs text-slate-300 bg-slate-900/50 rounded p-3 overflow-x-auto">
                {JSON.stringify(dossier.riskAssessment, null, 2)}
              </pre>
            )}
          </div>
        </Card>
      )}

      {/* Boundary Applied */}
      {dossier.boundaryApplied && (
        <Card>
          <div className="p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Boundary Applied</h2>
            {typeof dossier.boundaryApplied === 'string' ? (
              <p className="text-sm text-slate-300">{dossier.boundaryApplied}</p>
            ) : (
              <div className="text-sm text-slate-300 space-y-1">
                {dossier.boundaryApplied.name && <p className="font-medium">{dossier.boundaryApplied.name}</p>}
                {dossier.boundaryApplied.description && <p className="text-xs text-slate-400">{dossier.boundaryApplied.description}</p>}
                {dossier.boundaryApplied.boundaryType && (
                  <Badge variant="neutral">{dossier.boundaryApplied.boundaryType}</Badge>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Evidence IDs */}
      {dossier.evidenceIds && dossier.evidenceIds.length > 0 && (
        <Card>
          <div className="p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Evidence Referenced</h2>
            <div className="flex flex-wrap gap-2">
              {dossier.evidenceIds.map((eid: string, i: number) => (
                <span key={i} className="px-2 py-1 rounded bg-slate-800 text-xs text-slate-300 font-mono">
                  {eid}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Metadata footer */}
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
        {dossier.actor && <span>Actor: {dossier.actor}</span>}
        {dossier.createdAt && <span>Created: {new Date(dossier.createdAt).toLocaleString()}</span>}
      </div>
    </div>
  );
}
