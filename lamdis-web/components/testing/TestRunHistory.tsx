"use client";
import React, { useEffect, useState } from 'react';
import { formatDurationBetween } from '@/lib/format';
import Pagination from '@/components/base/Pagination';
import Badge from '@/components/base/Badge';
import Table from '@/components/base/Table';
import Link from 'next/link';
import Card from '@/components/base/Card';
import AiLoader from '@/components/base/AiLoader';
import Modal from '@/components/base/Modal';
import Button from '@/components/base/Button';

interface TestRunItem {
  testId: string;
  testName?: string;
  status: string;
  transcript?: any[];
  assertions?: any[];
  confirmations?: any[];
  timings?: { avgMs?: number; p50Ms?: number; p95Ms?: number; maxMs?: number };
  error?: { message?: string };
}

interface TestRun {
  _id: string;
  id?: string;
  suiteId?: string;
  status?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  totals?: { total?: number; passed?: number; failed?: number; skipped?: number };
  testItem?: TestRunItem;
  connectionKey?: string;
}

interface TestRunHistoryProps {
  testId: string;
  testName?: string;
  suiteId: string;
}

function formatTime(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  const variant = s === 'passed' ? 'success' : s === 'failed' ? 'danger' : s === 'running' ? 'info' : s === 'error' ? 'danger' : 'neutral';
  return <Badge variant={variant as any}>{status || '—'}</Badge>;
}

function AssertionsList({ assertions }: { assertions: any[] }) {
  if (!assertions?.length) return <span className="text-slate-500 text-xs">No assertions</span>;
  
  return (
    <div className="space-y-1.5">
      {assertions.map((a, i) => {
        const passed = a.pass === true;
        const failed = a.pass === false;
        const name = a.name || a.type || `Check ${i + 1}`;
        const score = typeof a.details?.score === 'number' ? a.details.score : undefined;
        const reasoning = a.details?.reasoning || '';
        
        return (
          <div key={i} className="flex items-start gap-2 p-2 bg-slate-800/50 rounded text-xs">
            <span className={`font-medium ${passed ? 'text-emerald-400' : failed ? 'text-rose-400' : 'text-slate-400'}`}>
              {passed ? '✓' : failed ? '✗' : '?'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-200">{name}</div>
              {score != null && (
                <div className="text-slate-400">Score: <span className="font-mono">{score.toFixed(2)}</span></div>
              )}
              {reasoning && (
                <div className="text-slate-500 text-[11px] mt-0.5 truncate" title={reasoning}>{reasoning}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TranscriptView({ transcript }: { transcript: any[] }) {
  if (!transcript?.length) return <span className="text-slate-500 text-xs">No messages</span>;
  
  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {transcript.map((m, i) => {
        const isUser = String(m.role) === 'user';
        return (
          <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${
              isUser
                ? 'bg-gradient-to-br from-fuchsia-600 to-sky-500 text-white'
                : 'bg-slate-800 border border-slate-600/60 text-slate-100'
            }`}>
              {String(m.content)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RunDetailModal({ run, onClose }: { run: TestRun; onClose: () => void }) {
  const testItem = run.testItem;
  const status = testItem?.status || run.status || 'unknown';
  const assertions = [...(testItem?.assertions || []), ...(testItem?.confirmations || [])];
  const transcript = testItem?.transcript || [];
  const timings = testItem?.timings;
  const error = testItem?.error;

  const passedCount = assertions.filter(a => a.pass === true).length;
  const failedCount = assertions.filter(a => a.pass === false).length;
  const statusVariant = status === 'passed' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'info' : 'neutral';

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  return (
    <Modal open onClose={onClose} title={`Run ${String(run._id).slice(-6)}`} size="2xl">
      <div className="rounded-md border border-slate-800 bg-slate-950/40">
        {/* Two-column layout mirroring the full run detail page */}
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {/* Left column - Conversation (2/3) */}
          <div className="lg:col-span-2 border-r border-slate-800 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm text-slate-300 font-medium">Conversation</span>
              <span className="text-[10px] text-slate-500 ml-auto">{transcript.length} messages</span>
            </div>
            <div className="h-[420px] overflow-y-auto p-4">
              <div className="space-y-3">
                {transcript.length > 0 ? transcript.map((m: any, i: number) => {
                  const isUser = String(m.role) === 'user';
                  return (
                    <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[85%]">
                        <div className={`text-[10px] uppercase tracking-wide mb-1 ${isUser ? 'text-right text-fuchsia-400/70' : 'text-slate-500'}`}>
                          {isUser ? 'Test user' : 'Assistant'}
                        </div>
                        <div className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${
                          isUser
                            ? 'bg-gradient-to-br from-fuchsia-600 to-sky-500 text-white shadow-lg'
                            : 'bg-slate-800/70 border border-slate-600/60 text-slate-100'
                        }`}>
                          {String(m.content)}
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-slate-600 text-center py-12">
                    <svg className="w-10 h-10 mx-auto mb-2 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-xs">No messages recorded</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column - Info Panel (1/3) */}
          <div className="lg:col-span-1 flex flex-col h-[470px] overflow-y-auto">
            {/* Status Breakdown */}
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Status</div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={statusVariant as any}>{status}</Badge>
                <span className="text-[11px] text-slate-500">{formatDurationBetween(run.startedAt || run.createdAt, run.finishedAt)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="text-lg font-semibold text-slate-200">{assertions.length}</div>
                  <div className="text-[10px] text-slate-500">Checks</div>
                </div>
                <div className="bg-emerald-900/30 rounded p-2">
                  <div className="text-lg font-semibold text-emerald-400">{passedCount}</div>
                  <div className="text-[10px] text-emerald-500/70">Passed</div>
                </div>
                <div className="bg-rose-900/30 rounded p-2">
                  <div className="text-lg font-semibold text-rose-400">{failedCount}</div>
                  <div className="text-[10px] text-rose-500/70">Failed</div>
                </div>
              </div>
              {/* Error */}
              {error?.message && (
                <div className="mt-3 p-2 bg-rose-900/20 border border-rose-700/40 rounded">
                  <div className="text-[10px] uppercase tracking-wide text-rose-400/70 mb-1">Error</div>
                  <div className="text-xs text-rose-300 break-words">{error.message}</div>
                </div>
              )}
            </div>

            {/* Latency */}
            {timings && (timings.avgMs || timings.p50Ms) && (
              <div className="px-4 py-2 border-b border-slate-800">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Latency</span>
                  <div className="flex items-center gap-3">
                    {timings.avgMs && <span className="text-cyan-400" title="Average">{formatLatency(Math.round(timings.avgMs))} avg</span>}
                    {timings.p50Ms && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="text-emerald-400/70" title="p50">{formatLatency(Math.round(timings.p50Ms))} p50</span>
                      </>
                    )}
                    {timings.p95Ms && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="text-amber-400/70" title="p95">{formatLatency(Math.round(timings.p95Ms))} p95</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Assertions / Checks */}
            {assertions.length > 0 && (
              <div className="px-4 py-3 flex-1 overflow-hidden flex flex-col">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                  Checks ({passedCount}/{assertions.length})
                </div>
                <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
                  {assertions.map((a: any, i: number) => {
                    const passed = a.pass === true;
                    const failed = a.pass === false;
                    const name = a.name || a.type || `Check ${i + 1}`;
                    const score = typeof a.details?.score === 'number' ? a.details.score : (typeof a.score === 'number' ? a.score : undefined);
                    const reasoning = a.details?.reasoning || a.reasoning || '';
                    const threshold = a.details?.threshold ?? a.threshold;
                    const rubric = a.details?.rubric || a.rubric || '';
                    const mode = a.mode || a.details?.mode || '';
                    const isVariableCheck = mode === 'variable_check';
                    const variablePath = a.details?.variablePath || a.variablePath || '';
                    const leftValue = a.details?.leftValue ?? a.leftValue;
                    const rightValue = a.details?.rightValue ?? a.rightValue ?? a.expectEquals;
                    const operator = a.details?.operator || a.operator || '';

                    // Step type badge
                    const typeBadge = isVariableCheck ? 'VAR' : mode === 'includes' ? 'INCL' : 'CHECK';
                    const bgColor = failed ? 'bg-rose-900/20 border-rose-700/40' : passed ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-slate-800/20 border-slate-700/40';
                    const textColor = failed ? 'text-rose-300' : passed ? 'text-emerald-300' : 'text-slate-400';

                    return (
                      <div key={i} className={`rounded border text-xs ${bgColor}`}>
                        {/* Header */}
                        <div className="flex items-center justify-between p-2.5">
                          <div className="flex items-center gap-2">
                            {passed ? (
                              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            ) : failed ? (
                              <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                            )}
                            <span className={`font-medium ${textColor}`}>{name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {score != null && (
                              <span className={`text-[10px] ${passed ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                {score.toFixed(2)}
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${passed ? 'bg-emerald-500/20 text-emerald-400' : failed ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-500/20 text-slate-400'}`}>
                              {typeBadge}
                            </span>
                          </div>
                        </div>
                        {/* Collapsible details */}
                        {(reasoning || rubric || isVariableCheck) && (
                          <details className="group">
                            <summary className={`px-2.5 py-1.5 cursor-pointer text-[10px] flex items-center gap-1 border-t ${
                              failed ? 'border-rose-700/30 text-rose-400/70 hover:text-rose-300'
                                : passed ? 'border-emerald-700/30 text-emerald-400/70 hover:text-emerald-300'
                                : 'border-slate-700/30 text-slate-400/70 hover:text-slate-300'
                            }`}>
                              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              View details
                            </summary>
                            <div className={`px-2.5 pb-2.5 pt-1 space-y-2 border-t ${
                              failed ? 'border-rose-700/20' : passed ? 'border-emerald-700/20' : 'border-slate-700/20'
                            }`}>
                              {isVariableCheck && (
                                <div className={`p-2 rounded border ${passed ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-rose-900/20 border-rose-700/30'}`}>
                                  {variablePath && (
                                    <div className="mb-1">
                                      <span className="text-[9px] text-slate-500">Path: </span>
                                      <code className="text-sky-300 text-[10px] font-mono">{variablePath}</code>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 text-[11px] font-mono">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[9px] text-slate-500 mb-0.5">Actual:</div>
                                      <div className={`p-1 rounded bg-slate-800/50 break-all ${passed ? 'text-emerald-300' : 'text-rose-300'}`}>
                                        {leftValue == null ? <span className="text-slate-500 italic">undefined</span> : String(leftValue)}
                                      </div>
                                    </div>
                                    <div className="flex-shrink-0 px-2 py-1 bg-slate-700/50 rounded text-slate-400 text-[10px]">
                                      {operator === 'eq' ? '===' : operator === 'neq' ? '!==' : operator === 'gt' ? '>' : operator === 'gte' ? '>=' : operator === 'lt' ? '<' : operator === 'lte' ? '<=' : operator === 'contains' ? 'contains' : operator === 'not_contains' ? '!contains' : operator === 'regex' ? 'regex' : operator || '==='}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[9px] text-slate-500 mb-0.5">Expected:</div>
                                      <div className="p-1 rounded bg-slate-800/50 text-sky-300 break-all">
                                        {rightValue == null ? <span className="text-slate-500 italic">undefined</span> : String(rightValue)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {!isVariableCheck && score != null && threshold != null && (
                                <div className="flex items-center gap-3 text-[10px]">
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-500">Score:</span>
                                    <span className={passed ? 'text-emerald-400' : 'text-rose-400'}>{score.toFixed(2)}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-500">Threshold:</span>
                                    <span className="text-slate-400">{typeof threshold === 'number' ? threshold.toFixed(2) : threshold}</span>
                                  </div>
                                </div>
                              )}
                              {rubric && (
                                <div>
                                  <div className="text-[10px] text-slate-500 mb-0.5">Criteria:</div>
                                  <div className="text-slate-300 text-[11px] bg-slate-800/50 rounded p-1.5 break-words">{rubric}</div>
                                </div>
                              )}
                              {reasoning && (
                                <div>
                                  <div className="text-[10px] text-slate-500 mb-0.5">Reasoning:</div>
                                  <div className={`text-[11px] ${passed ? 'text-emerald-300/80' : 'text-rose-300/80'} break-words`}>{reasoning}</div>
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timing details */}
            <div className="px-4 py-2 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
              <span>{formatTime(run.startedAt || run.createdAt)}</span>
              <Link href={`/dashboard/runs/${run._id}`} className="text-sky-400 hover:text-sky-300 text-[11px] font-medium">
                View Full Run →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function TestRunHistory({ testId, testName, suiteId }: TestRunHistoryProps) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const pageSize = 10;

  useEffect(() => {
    async function fetchRuns() {
      setLoading(true);
      setError(null);
      try {
        // Fetch runs that include this test - try multiple endpoints
        let runsData: TestRun[] = [];
        
        // First try the test-specific runs endpoint
        const testRunsRes = await fetch(`/api/orgs/tests/${encodeURIComponent(testId)}/runs`, { cache: 'no-store' });
        if (testRunsRes.ok) {
          const data = await testRunsRes.json();
          if (Array.isArray(data)) {
            runsData = data;
          }
        }
        
        // Fallback: fetch suite runs and filter
        if (runsData.length === 0 && suiteId) {
          const suiteRunsRes = await fetch(`/api/orgs/suites/${encodeURIComponent(suiteId)}/runs`, { cache: 'no-store' });
          if (suiteRunsRes.ok) {
            const allRuns = await suiteRunsRes.json();
            if (Array.isArray(allRuns)) {
              runsData = allRuns
                .filter((r: any) => {
                  const items = Array.isArray(r.items) ? r.items : [];
                  return items.some((item: any) => String(item.testId) === testId);
                })
                .map((r: any) => {
                  const items = Array.isArray(r.items) ? r.items : [];
                  const testItem = items.find((item: any) => String(item.testId) === testId);
                  return { ...r, testItem, suiteId };
                });
            }
          }
        }
        
        // Sort by date descending
        runsData.sort((a, b) => {
          const da = new Date(a.startedAt || a.createdAt || 0).getTime();
          const db = new Date(b.startedAt || b.createdAt || 0).getTime();
          return db - da;
        });
        
        setRuns(runsData);
      } catch (e: any) {
        setError(e?.message || 'Failed to load run history');
      } finally {
        setLoading(false);
      }
    }
    
    fetchRuns();
  }, [testId, suiteId]);

  const total = runs.length;
  const start = (page - 1) * pageSize;
  const slice = runs.slice(start, start + pageSize);

  // Calculate stats
  const passedRuns = runs.filter(r => {
    const status = r.testItem?.status || r.status || '';
    return status.toLowerCase() === 'passed';
  }).length;
  const failedRuns = runs.filter(r => {
    const status = r.testItem?.status || r.status || '';
    return status.toLowerCase() === 'failed' || status.toLowerCase() === 'error';
  }).length;
  const passRate = total > 0 ? Math.round((passedRuns / total) * 100) : 0;

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <AiLoader variant="dark" />
          Loading run history...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <div className="text-rose-400 text-sm">{error}</div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-medium text-slate-200">Run History</div>
          {testName && <div className="text-xs text-slate-500">{testName}</div>}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="text-slate-400">
              <span className="text-slate-200">{total}</span> runs
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">{passedRuns}</span>
              <span className="text-slate-600">/</span>
              <span className="text-rose-400">{failedRuns}</span>
            </div>
            <div className="text-slate-400">
              <span className={passRate >= 80 ? 'text-emerald-400' : passRate >= 50 ? 'text-amber-400' : 'text-rose-400'}>
                {passRate}%
              </span> pass rate
            </div>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <svg className="w-10 h-10 mx-auto mb-2 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <div className="text-sm">No runs yet</div>
          <div className="text-xs mt-1">Run this test to see results here</div>
        </div>
      ) : (
        <>
          <Table
            data={slice}
            empty={<span className="text-xs text-slate-500">No runs.</span>}
            columns={[
              {
                key: 'run',
                header: 'Run',
                render: (r: TestRun) => {
                  const id = String(r._id || r.id || '');
                  const tail = id ? id.slice(-6) : '';
                  return (
                    <button
                      onClick={() => setSelectedRun(r)}
                      className="text-left hover:text-sky-400 transition-colors"
                    >
                      <div className="font-mono text-slate-200">Run {tail || id}</div>
                      <div className="text-[11px] text-slate-500">{formatTime(r.startedAt || r.createdAt)}</div>
                    </button>
                  );
                },
              },
              {
                key: 'status',
                header: 'Status',
                render: (r: TestRun) => {
                  const status = r.testItem?.status || r.status || 'unknown';
                  return <StatusBadge status={status} />;
                },
              },
              {
                key: 'assertions',
                header: 'Assertions',
                render: (r: TestRun) => {
                  const assertions = [...(r.testItem?.assertions || []), ...(r.testItem?.confirmations || [])];
                  const passed = assertions.filter(a => a.pass === true).length;
                  const failed = assertions.filter(a => a.pass === false).length;
                  const total = assertions.length;
                  if (total === 0) return <span className="text-slate-500">—</span>;
                  return (
                    <div className="flex items-center gap-1 text-sm">
                      <span className="text-emerald-400">{passed}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-rose-400">{failed}</span>
                      <span className="text-slate-500 text-xs">({total})</span>
                    </div>
                  );
                },
              },
              {
                key: 'duration',
                header: 'Duration',
                render: (r: TestRun) => (
                  <span className="text-slate-300">{formatDurationBetween(r.startedAt || r.createdAt, r.finishedAt)}</span>
                ),
              },
              {
                key: 'latency',
                header: 'Avg Latency',
                render: (r: TestRun) => {
                  const avgMs = r.testItem?.timings?.avgMs;
                  if (avgMs == null) return <span className="text-slate-500">—</span>;
                  return <span className="text-slate-300 font-mono">{Math.round(avgMs)}ms</span>;
                },
              },
              {
                key: 'actions',
                header: '',
                className: 'w-24',
                render: (r: TestRun) => (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedRun(r)}
                      className="text-sky-400 hover:text-sky-300 text-xs"
                    >
                      Details
                    </button>
                    <Link
                      href={`/dashboard/runs/${r._id}`}
                      className="text-slate-400 hover:text-slate-300 text-xs"
                    >
                      Full
                    </Link>
                  </div>
                ),
              },
            ]}
          />
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        </>
      )}

      {selectedRun && (
        <RunDetailModal run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </Card>
  );
}
