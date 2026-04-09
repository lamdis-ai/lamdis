"use client";
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const levelMeta: Record<string, { label: string; color: string; bg: string; border: string }> = {
  A: { label: 'Observed Intent', color: 'text-slate-300', bg: 'bg-slate-800', border: 'border-slate-600' },
  B: { label: 'Attempted Action', color: 'text-blue-300', bg: 'bg-blue-950/40', border: 'border-blue-700/50' },
  C: { label: 'Acknowledged', color: 'text-cyan-300', bg: 'bg-cyan-950/40', border: 'border-cyan-700/50' },
  D: { label: 'State Confirmed', color: 'text-emerald-300', bg: 'bg-emerald-950/40', border: 'border-emerald-700/50' },
  E: { label: 'End-to-End', color: 'text-green-200', bg: 'bg-green-950/40', border: 'border-green-700/50' },
};

const proofStatusMeta: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' | 'info' }> = {
  proven: { label: 'Proven', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  unproven: { label: 'Unproven', variant: 'neutral' },
  disproven: { label: 'Disproven', variant: 'danger' },
  pending: { label: 'Pending', variant: 'info' },
};

const reviewStatusMeta: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' | 'info' }> = {
  pending_review: { label: 'Pending Review', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  needs_investigation: { label: 'Needs Investigation', variant: 'warning' },
  false_positive: { label: 'False Positive', variant: 'neutral' },
  acknowledged: { label: 'Acknowledged', variant: 'info' },
};

const reviewActions = [
  { value: 'approved', label: 'Approve', color: 'bg-emerald-600 hover:bg-emerald-500' },
  { value: 'rejected', label: 'Reject', color: 'bg-rose-600 hover:bg-rose-500' },
  { value: 'needs_investigation', label: 'Investigate', color: 'bg-amber-600 hover:bg-amber-500' },
  { value: 'acknowledged', label: 'Acknowledge', color: 'bg-slate-600 hover:bg-slate-500' },
  { value: 'false_positive', label: 'False Positive', color: 'bg-slate-600 hover:bg-slate-500' },
];

export default function OutcomeInstanceDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [instance, setInstance] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewReason, setReviewReason] = useState('');
  const [showReasonModal, setShowReasonModal] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/orgs/outcome-instances/${id}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/orgs/outcome-instances/${id}/timeline`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ timeline: [] })),
      fetch(`/api/orgs/outcome-instances/${id}/history`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ])
      .then(([instData, timelineData, historyData]) => {
        setInstance(instData);
        setTimeline(timelineData?.timeline || []);
        setHistory(historyData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatusChange = async (newStatus: string) => {
    setSubmitting(true);
    try {
      await fetch(`/api/orgs/outcome-instances/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewStatus: newStatus, reason: reviewReason || undefined }),
      });
      setShowReasonModal(null);
      setReviewReason('');
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/orgs/outcome-instances/${id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: commentText }),
      });
      setCommentText('');
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center text-slate-500 py-12">Loading...</div>;
  if (!instance) return <div className="text-center text-slate-500 py-12">Instance not found</div>;

  const checkResults = instance.checkResults || [];
  const outcome = instance.outcome || instance.workflow;
  const proofMeta = proofStatusMeta[instance.proofStatus] || null;
  const reviewMeta = reviewStatusMeta[instance.reviewStatus] || null;
  const comments = history?.comments || instance.comments || [];
  const statusHistory = history?.statusHistory || instance.statusHistory || [];
  const isDemo = instance.environment === 'demo';
  const passedChecks = checkResults.filter((c: any) => c.status === 'passed').length;
  const pendingChecks = checkResults.filter((c: any) => c.status === 'pending').length;

  return (
    <div className="space-y-8">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Link href="/dashboard/activity/instances" className="hover:text-slate-200">Objective Instances</Link>
          <span>/</span>
          <span className="font-mono text-slate-300">{id?.slice(0, 12)}...</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-100">
            {outcome?.name || 'Instance'}
          </h1>
          <Badge variant={
            instance.status === 'passed' ? 'success' :
            instance.status === 'failed' ? 'danger' :
            instance.status === 'open' ? 'neutral' : 'warning'
          }>
            {instance.status}
          </Badge>
          {proofMeta && (
            <Badge variant={proofMeta.variant}>{proofMeta.label}</Badge>
          )}
          {reviewMeta && (
            <Badge variant={reviewMeta.variant}>{reviewMeta.label}</Badge>
          )}
          {instance.confidence != null && (
            <span className="text-sm font-mono font-bold text-fuchsia-400">
              {(instance.confidence * 100).toFixed(0)}% confidence
            </span>
          )}
          {instance.agentEnabled ? (
            <Link href={`/dashboard/activity/instances/${id}/agent`}
              className="ml-2 px-3 py-1 text-sm bg-cyan-800 hover:bg-cyan-700 text-cyan-100 rounded-md border border-cyan-700/50">
              Agent View {instance.agentStatus && `(${instance.agentStatus})`}
            </Link>
          ) : (
            <AgentStartButton instanceId={id} onStarted={loadData} />
          )}
        </div>
      </div>

      {/* Demo context banner */}
      {isDemo && (
        <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/10 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fuchsia-300">Demo Simulation{outcome?.name ? `: ${outcome.name}` : ''}</span>
          </div>
          <p className="text-sm text-slate-400">
            This simulated instance shows how Lamdis processes
            {outcome?.name ? ` a ${outcome.name.toLowerCase()} request` : ' a business objective'}.
            It received <span className="text-slate-200">{instance.eventCount || 0}</span> evidence events
            {checkResults.length > 0 && <>, evaluated <span className="text-slate-200">{checkResults.length}</span> proof expectations ({passedChecks} passed, {pendingChecks} pending)</>}
            {timeline.length > 0 && <>, and processed events from {new Set(timeline.map((e: any) => e.source || e.eventSource)).size} different sources</>}.
          </p>
          <div className="text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-400">What you&#39;re seeing:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><span className="text-slate-300">Event Timeline</span> — evidence arriving from connected systems</li>
              <li><span className="text-slate-300">Check Results</span> — proof expectations evaluated against evidence</li>
              <li><span className="text-slate-300">Actions</span> — what Lamdis proposed or automatically executed</li>
            </ul>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Link href="/dashboard" className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
              Back to Dashboard
            </Link>
            {outcome?.id && (
              <Link href={`/dashboard/library/objectives/${outcome.id}`} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
                View Objective Definition
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-slate-100">{instance.eventCount || 0}</div>
            <div className="text-xs text-slate-400">Events</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-slate-100">{instance.environment}</div>
            <div className="text-xs text-slate-400">Environment</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-cyan-400">{instance.automationMode || 'N/A'}</div>
            <div className="text-xs text-slate-400">Automation Mode</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-emerald-400">{instance.totals?.passed || 0}</div>
            <div className="text-xs text-slate-400">Checks Passed</div>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <div className="text-lg font-bold text-rose-400">{instance.totals?.failed || 0}</div>
            <div className="text-xs text-slate-400">Checks Failed</div>
          </div>
        </Card>
      </div>

      {/* Review Panel */}
      <Card>
        <div className="p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Review</h2>
          <div className="flex flex-wrap gap-2">
            {reviewActions.map(action => (
              <button
                key={action.value}
                onClick={() => { setShowReasonModal(action.value); setReviewReason(''); }}
                disabled={submitting || instance.reviewStatus === action.value}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-40 ${action.color}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Reason modal */}
      {showReasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              Reason for {reviewActions.find(a => a.value === showReasonModal)?.label}
            </h3>
            <textarea
              value={reviewReason}
              onChange={e => setReviewReason(e.target.value)}
              placeholder="Optional reason..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200 placeholder:text-slate-500 mb-4"
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowReasonModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              <button
                onClick={() => handleStatusChange(showReasonModal)}
                disabled={submitting}
                className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Event Timeline (2/3 width) */}
        <div className="lg:col-span-2 space-y-8">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">Event Timeline</h2>
            {timeline.length === 0 ? (
              <Card><div className="p-6 text-center text-slate-500">No events recorded</div></Card>
            ) : (
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-700/50" />
                <div className="space-y-1">
                  {timeline.map((event: any, idx: number) => {
                    const level = event.confirmationLevel || 'A';
                    const meta = levelMeta[level] || levelMeta.A;
                    return (
                      <div key={event.id || idx} className="relative flex items-start gap-4 pl-2">
                        <div className={`relative z-10 mt-3 w-3 h-3 rounded-full border-2 ${meta.border} ${meta.bg}`} />
                        <div className={`flex-1 rounded-lg border ${meta.border} ${meta.bg} p-3 min-w-0`}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-mono font-medium text-slate-200 truncate">{event.eventType}</span>
                              <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${meta.bg} ${meta.color} border ${meta.border}`}>{level}</span>
                            </div>
                            <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(event.emittedAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{event.source}</span>
                            <span className="text-slate-600">{meta.label}</span>
                          </div>
                          {event.payload && (
                            <details className="mt-2">
                              <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-400">View payload</summary>
                              <pre className="mt-1 text-[11px] text-slate-400 bg-slate-900/50 rounded p-2 overflow-x-auto max-h-32">{JSON.stringify(event.payload, null, 2)}</pre>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">Comments</h2>
            <div className="space-y-3">
              {comments.map((c: any) => (
                <Card key={c.id}>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-300">{c.authorName || c.authorEmail || c.authorSub}</span>
                      <div className="flex items-center gap-2">
                        {c.edited && <span className="text-xs text-slate-600">(edited)</span>}
                        <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.text}</p>
                  </div>
                </Card>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
                onKeyDown={e => e.key === 'Enter' && handleAddComment()}
              />
              <button
                onClick={handleAddComment}
                disabled={submitting || !commentText.trim()}
                className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm rounded-lg disabled:opacity-50"
              >
                Post
              </button>
            </div>
          </div>

          {/* Status History */}
          {statusHistory.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-100">Status History</h2>
              <div className="space-y-2">
                {statusHistory.map((entry: any, idx: number) => (
                  <Card key={idx}>
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{entry.previousStatus || 'none'}</span>
                        <span className="text-xs text-slate-600">&rarr;</span>
                        <Badge variant={reviewStatusMeta[entry.newStatus]?.variant || 'neutral'}>
                          {reviewStatusMeta[entry.newStatus]?.label || entry.newStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400">{entry.changedByName || entry.changedByEmail || entry.changedBy}</span>
                        {entry.reason && <span className="text-slate-500 italic max-w-48 truncate">{entry.reason}</span>}
                        <span className="text-slate-600">{new Date(entry.changedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Check Results (1/3 width) */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Check Results</h2>
          {checkResults.length === 0 ? (
            <Card><div className="p-6 text-center text-slate-500">No checks evaluated</div></Card>
          ) : (
            <div className="space-y-2">
              {checkResults.map((cr: any, idx: number) => (
                <Card key={cr.checkId || idx}>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200 truncate">{cr.checkName || cr.checkId?.slice(0, 8)}</span>
                      <Badge variant={
                        cr.status === 'passed' ? 'success' :
                        cr.status === 'failed' ? 'danger' :
                        cr.status === 'skipped' ? 'neutral' : 'warning'
                      }>
                        {cr.status}
                      </Badge>
                    </div>
                    {cr.reasoning && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-3">{cr.reasoning}</p>
                    )}
                    {cr.evidenceLevel && (
                      <div className="mt-2 text-xs text-slate-500">
                        Evidence: Level {cr.evidenceLevel}
                        {cr.score != null && <span className="ml-2">Score: {(cr.score * 100).toFixed(0)}%</span>}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Instance metadata */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Details</h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Instance ID</dt>
                <dd className="text-slate-300 font-mono">{id?.slice(0, 16)}...</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Proof Status</dt>
                <dd className="text-slate-300">{instance.proofStatus || 'pending'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Automation Mode</dt>
                <dd className="text-slate-300">{instance.automationMode || 'N/A'}</dd>
              </div>
              {instance.confidence != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Confidence</dt>
                  <dd className="text-fuchsia-400 font-mono">{(instance.confidence * 100).toFixed(1)}%</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Environment</dt>
                <dd className="text-slate-300">{instance.environment}</dd>
              </div>
              {outcome?.id && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Objective</dt>
                  <dd>
                    <Link href={`/dashboard/library/objectives/${outcome.id}`} className="text-fuchsia-400 hover:text-fuchsia-300">
                      {outcome.name || outcome.id.slice(0, 8)}...
                    </Link>
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-300">{new Date(instance.createdAt).toLocaleString()}</dd>
              </div>
              {instance.completedAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Completed</dt>
                  <dd className="text-slate-300">{new Date(instance.completedAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Start Button — inline component for starting the agent
// ---------------------------------------------------------------------------

function AgentStartButton({ instanceId, onStarted }: { instanceId: string; onStarted: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async () => {
    if (!goal.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/orgs/instances/${instanceId}/agent/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      setShowModal(false);
      onStarted();
    } finally {
      setSubmitting(false);
    }
  };

  if (!showModal) {
    return (
      <button onClick={() => setShowModal(true)}
        className="ml-2 px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md">
        Start Agent
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowModal(false)}>
      <div className="bg-slate-800 rounded-xl border border-slate-600 p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">Start Autonomous Agent</h3>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Goal</label>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g., Sell my Vespa for $4,500"
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowModal(false)} className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-md">
            Cancel
          </button>
          <button onClick={handleStart} disabled={submitting || !goal.trim()}
            className="px-3 py-1.5 text-sm bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-md">
            Start Agent
          </button>
        </div>
      </div>
    </div>
  );
}
