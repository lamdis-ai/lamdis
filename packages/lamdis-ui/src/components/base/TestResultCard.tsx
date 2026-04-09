"use client";
import React, { useState } from 'react';
import Badge from './Badge';

export interface JudgeCheck {
  type?: string;
  subtype?: string;
  pass?: boolean;
  details?: {
    score?: number;
    threshold?: number;
    reasoning?: string;
    error?: { message?: string } | string;
    rubric?: string;     // The rubric/criteria being checked
    stepName?: string;   // Human-readable name for this check step
  };
}

export interface Assertion {
  type: string;
  pass?: boolean;
  severity?: 'info' | 'warn' | 'error';
  details?: any;
  config?: any;
}

export interface TestResultItem {
  testId: string;
  testName?: string;
  status: string;
  transcript?: any[];
  messageCounts?: { user: number; assistant: number; total: number };
  assertions?: Assertion[];
  confirmations?: any[];
  timings?: { 
    source?: 'assistant' | string;  // What generated this latency (assistant = target endpoint)
    label?: string;                  // Human-readable label for the latency
    avgMs?: number; 
    p50Ms?: number; 
    p95Ms?: number; 
    maxMs?: number;
  };
  artifacts?: { log?: any[] };
  error?: { message?: string };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return `${m}m ${rs}s`;
}

function AccordionSection({ title, defaultOpen = false, badge, children }: { 
  title: string; 
  defaultOpen?: boolean; 
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-800 last:border-b-0">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs text-slate-300">{title}</span>
        </div>
        {badge}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function JudgeCheckItem({ check, index }: { check: JudgeCheck; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const subtype = String(check.subtype || check.type || 'judge_check');
  const passed = check.pass === true;
  const failed = check.pass === false;
  const details = check.details || {};
  const score = typeof details.score === 'number' ? details.score : undefined;
  const threshold = typeof details.threshold === 'number' ? details.threshold : undefined;
  const reasoning = typeof details.reasoning === 'string' ? details.reasoning : '';
  const rubric = typeof details.rubric === 'string' ? details.rubric : '';
  const stepName = typeof details.stepName === 'string' ? details.stepName : '';
  const hasError = !!details.error || (reasoning && reasoning.toLowerCase().includes('judge_error'));
  
  const rawErrorMessage = details.error && typeof details.error === 'object' && 'message' in details.error
    ? String(details.error.message)
    : typeof details.error === 'string'
    ? details.error
    : reasoning;
  const errorMessage = hasError ? String(rawErrorMessage || '').replace(/^judge_error:\s*/i, '').slice(0, 300) : '';

  const statusLabel = hasError ? 'ERROR' : failed ? 'FAIL' : passed ? 'PASS' : 'UNKNOWN';
  const statusVariant = hasError ? 'danger' : failed ? 'danger' : passed ? 'success' : 'info';

  // Use step name if available, otherwise format subtype for display
  const displayType = stepName || (subtype
    .replace(/_/g, ' ')
    .replace(/check/gi, '')
    .trim()
    .toUpperCase() || 'CHECK');

  return (
    <div className="border border-slate-700/60 rounded-md bg-slate-900/50 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg
            className={`w-3 h-3 text-slate-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={`text-[11px] text-slate-300 truncate ${stepName ? '' : 'font-mono text-slate-400'}`} title={displayType}>{displayType}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {score != null && (
            <span className="text-[10px] text-slate-400">
              <span className="font-mono">{score.toFixed(2)}</span>
              {threshold != null && <span className="text-slate-500"> / {threshold}</span>}
            </span>
          )}
          <Badge variant={statusVariant as any} className="text-[10px]">{statusLabel}</Badge>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-700/40">
          {rubric && (
            <div className="pt-2">
              <div className="text-[10px] text-slate-500 mb-1">Checking for</div>
              <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2">
                {rubric}
              </div>
            </div>
          )}
          {score != null && (
            <div className="pt-2">
              <div className="flex items-center gap-4 text-[11px]">
                <div>
                  <span className="text-slate-500">Score:</span>{' '}
                  <span className="font-mono text-slate-200">{score.toFixed(2)}</span>
                </div>
                {threshold != null && (
                  <div>
                    <span className="text-slate-500">Threshold:</span>{' '}
                    <span className="font-mono text-slate-200">{threshold}</span>
                  </div>
                )}
              </div>
              {/* Score bar */}
              <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, (score <= 1 ? score : score / 100) * 100))}%` }}
                />
              </div>
            </div>
          )}
          {reasoning && !hasError && (
            <div className="pt-1">
              <div className="text-[10px] text-slate-500 mb-1">Reasoning</div>
              <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2">
                {reasoning}
              </div>
            </div>
          )}
          {hasError && errorMessage && (
            <div className="pt-1">
              <div className="text-[10px] text-amber-400 mb-1">Error</div>
              <div className="text-[11px] text-amber-300 whitespace-pre-wrap break-words bg-amber-900/20 border border-amber-700/30 rounded p-2">
                {errorMessage}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssertionItem({ assertion, index }: { assertion: Assertion; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const variant = assertion.pass ? 'success' : (assertion.severity === 'info' ? 'neutral' : 'danger');
  
  // Format score for display
  const formatScore = (s: number): string => {
    if (!isFinite(s)) return '—';
    if (s <= 1) return `${Math.round(s * 100)}%`;
    if (s <= 10) return `${Math.round((s / 10) * 100)}%`;
    return `${Math.round(s)}%`;
  };

  const score = typeof assertion.details?.score === 'number' ? assertion.details.score : undefined;
  const threshold = typeof assertion.details?.threshold === 'number' ? assertion.details.threshold : undefined;
  const reasoning = assertion.details?.reasoning || '';
  // Get rubric from config or details (assistant_check stores in both)
  const rubric = assertion.config?.rubric || assertion.details?.rubric || '';
  const scope = assertion.config?.scope || '';
  const misses = assertion.details?.misses || [];
  // Get step name for assistant_check steps
  const stepName = (assertion as any).name || assertion.details?.stepName || '';

  // Format type label - use step name if available for assistant_check
  const typeLabel = stepName || (
    assertion.type === 'semantic' ? 'Semantic' : 
    assertion.type === 'includes' ? 'Includes' : 
    assertion.type === 'assistant_check' ? 'Assistant Check' :
    String(assertion.type || 'Check')
  );

  return (
    <div className="border border-slate-700/60 rounded-md bg-slate-900/50 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg
            className={`w-3 h-3 text-slate-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[11px] text-slate-300 truncate" title={typeLabel}>{typeLabel}</span>
          {score != null && (
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">{formatScore(score)}</span>
          )}
        </div>
        <Badge variant={variant as any} className="text-[10px] flex-shrink-0">{assertion.pass ? 'PASS' : 'FAIL'}</Badge>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-700/40">
          {rubric && (
            <div className="pt-2">
              <div className="text-[10px] text-slate-500 mb-1">Checking for</div>
              <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2">
                {rubric}
              </div>
            </div>
          )}
          {scope && (
            <div className="text-[11px]">
              <span className="text-slate-500">Scope:</span> <span className="text-slate-300">{scope}</span>
            </div>
          )}
          {score != null && threshold != null && (
            <div className="pt-1">
              <div className="flex items-center gap-4 text-[11px]">
                <div>
                  <span className="text-slate-500">Score:</span>{' '}
                  <span className="font-mono text-slate-200">{formatScore(score)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Threshold:</span>{' '}
                  <span className="font-mono text-slate-200">{formatScore(threshold)}</span>
                </div>
              </div>
            </div>
          )}
          {reasoning && (
            <div className="pt-1">
              <div className="text-[10px] text-slate-500 mb-1">Reasoning</div>
              <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2">
                {reasoning}
              </div>
            </div>
          )}
          {misses.length > 0 && (
            <div className="pt-1">
              <div className="text-[10px] text-rose-400 mb-1">Missing</div>
              <ul className="text-[11px] text-slate-300 list-disc ml-4">
                {misses.map((m: string, i: number) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TestResultCard({ item, index }: { item: TestResultItem; index: number }) {
  const transcript = Array.isArray(item.transcript) ? item.transcript : [];
  const assertions = Array.isArray(item.assertions) ? item.assertions : [];
  const logs = Array.isArray(item.artifacts?.log) ? item.artifacts.log : [];
  const judgeChecks = logs.filter((l: any) => l?.type === 'judge_check') as JudgeCheck[];
  const timings = item.timings || {};
  const testLabel = item.testName || item.testId;
  
  // Count passes/fails
  const assertionPassed = assertions.filter(a => a.pass).length;
  const assertionFailed = assertions.filter(a => !a.pass).length;
  const judgePassed = judgeChecks.filter(j => j.pass).length;
  const judgeFailed = judgeChecks.filter(j => !j.pass).length;
  const totalChecks = assertions.length + judgeChecks.length;
  const totalPassed = assertionPassed + judgePassed;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-slate-100 truncate" title={testLabel}>
              {testLabel}
            </h3>
            {item.testName && (
              <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                {item.testId}
              </div>
            )}
          </div>
          <Badge
            variant={item.status === 'passed' ? 'success' : item.status === 'running' ? 'info' : 'danger'}
          >
            {item.status}
          </Badge>
        </div>
        
        {/* Summary stats */}
        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px]">
          {totalChecks > 0 && (
            <div className="flex items-center gap-1">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${
                totalPassed === totalChecks ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
              }`}>
                {totalPassed}
              </span>
              <span className="text-slate-500">/ {totalChecks} checks</span>
            </div>
          )}
          {item.messageCounts && (
            <div className="text-slate-400">
              {item.messageCounts.total} messages
            </div>
          )}
          {timings.avgMs != null && (
            <div className="text-slate-400" title="Average assistant response time">
              avg {formatDuration(timings.avgMs)} {timings.source === 'assistant' && <span className="text-slate-500">(assistant)</span>}
            </div>
          )}
        </div>
      </div>

      {/* Accordion sections */}
      <div className="divide-y divide-slate-800">
        {/* Judge Checks */}
        {judgeChecks.length > 0 && (
          <AccordionSection 
            title="Judge Checks" 
            defaultOpen={judgeFailed > 0}
            badge={
              <div className="flex items-center gap-1 text-[10px]">
                {judgePassed > 0 && <span className="text-emerald-400">{judgePassed} pass</span>}
                {judgeFailed > 0 && <span className="text-rose-400">{judgeFailed} fail</span>}
              </div>
            }
          >
            <div className="space-y-2">
              {judgeChecks.map((jc, i) => (
                <JudgeCheckItem key={i} check={jc} index={i} />
              ))}
            </div>
          </AccordionSection>
        )}

        {/* Assertions */}
        {assertions.length > 0 && (
          <AccordionSection 
            title="Assertions" 
            defaultOpen={assertionFailed > 0}
            badge={
              <div className="flex items-center gap-1 text-[10px]">
                {assertionPassed > 0 && <span className="text-emerald-400">{assertionPassed} pass</span>}
                {assertionFailed > 0 && <span className="text-rose-400">{assertionFailed} fail</span>}
              </div>
            }
          >
            <div className="space-y-2">
              {assertions.map((a, i) => (
                <AssertionItem key={i} assertion={a} index={i} />
              ))}
            </div>
          </AccordionSection>
        )}

        {/* Conversation */}
        <AccordionSection title="Conversation" defaultOpen={false}>
          {transcript.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transcript.map((m: any, i: number) => {
                const isUser = String(m.role) === 'user';
                return (
                  <div key={i} className={isUser ? 'text-right' : 'text-left'}>
                    <span
                      className={`inline-block px-3 py-2 rounded-lg max-w-[85%] text-[12px] whitespace-pre-wrap break-words ${
                        isUser
                          ? 'bg-gradient-to-br from-fuchsia-600 to-sky-500 text-white'
                          : 'bg-slate-800/70 border border-slate-700 text-slate-100'
                      }`}
                    >
                      <span className={`block text-[10px] uppercase tracking-wide mb-1 ${isUser ? 'text-white/70' : 'text-slate-400'}`}>
                        {isUser ? 'Test User' : 'Assistant'}
                      </span>
                      {String(m.content)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">No messages recorded.</div>
          )}
        </AccordionSection>

        {/* Timings - Assistant Response Latency */}
        {(timings.avgMs != null || timings.p50Ms != null || timings.p95Ms != null || timings.maxMs != null) && (
          <AccordionSection 
            title={timings.label || (timings.source === 'assistant' ? 'Assistant Response Latency' : 'Latency')} 
            defaultOpen={false}
          >
            <div className="text-[10px] text-slate-500 mb-2">
              {timings.source === 'assistant' 
                ? 'Time for the target assistant endpoint to respond to each message'
                : 'Response time per turn'}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {timings.avgMs != null && (
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="text-slate-500 text-[10px]">Average</div>
                  <div className="font-mono text-slate-200">{formatDuration(timings.avgMs)}</div>
                </div>
              )}
              {timings.p50Ms != null && (
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="text-slate-500 text-[10px]">p50</div>
                  <div className="font-mono text-slate-200">{formatDuration(timings.p50Ms)}</div>
                </div>
              )}
              {timings.p95Ms != null && (
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="text-slate-500 text-[10px]">p95</div>
                  <div className="font-mono text-slate-200">{formatDuration(timings.p95Ms)}</div>
                </div>
              )}
              {timings.maxMs != null && (
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="text-slate-500 text-[10px]">Max</div>
                  <div className="font-mono text-slate-200">{formatDuration(timings.maxMs)}</div>
                </div>
              )}
            </div>
          </AccordionSection>
        )}

        {/* Error */}
        {item.error?.message && (
          <AccordionSection title="Error" defaultOpen={true}>
            <div className="text-[11px] text-rose-400 bg-rose-900/20 border border-rose-700/30 rounded p-2">
              {item.error.message}
            </div>
          </AccordionSection>
        )}
      </div>
    </div>
  );
}
