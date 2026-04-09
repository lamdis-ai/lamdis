"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolResult {
  tool: string;
  result: any;
  resourceType?: string;
  resourceId?: string;
}

interface CreatedResource {
  type: string;
  id: string;
}

interface BuilderResponse {
  reply: string;
  toolResults: ToolResult[];
  createdResources: CreatedResource[];
}

interface FeedItem {
  type: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolResult?: any;
}

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    // Process inline formatting
    let html = line
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-200">$1</strong>')
      .replace(/`(.*?)`/g, '<code class="text-xs px-1 py-0.5 rounded bg-slate-900 text-fuchsia-300">$1</code>');
    // Bullet list
    if (/^[-*]\s/.test(line)) {
      return <li key={i} className="text-sm text-slate-300 ml-4 list-disc" dangerouslySetInnerHTML={{ __html: html.replace(/^[-*]\s/, '') }} />;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      return <li key={i} className="text-sm text-slate-300 ml-4 list-decimal" dangerouslySetInnerHTML={{ __html: html.replace(/^\d+\.\s/, '') }} />;
    }
    // Empty line
    if (!line.trim()) return <div key={i} className="h-1.5" />;
    // Regular paragraph
    return <p key={i} className="text-sm text-slate-300" dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

export default function BuildPage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdOutcomeId, setCreatedOutcomeId] = useState<string | null>(null);
  const [createdResources, setCreatedResources] = useState<CreatedResource[]>([]);
  const [previewData, setPreviewData] = useState<{ outcome: any; proofs: any[]; actions: any[] } | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feed]);

  // Fetch preview data when resources change
  useEffect(() => {
    if (!createdOutcomeId) return;
    Promise.all([
      fetch(`/api/orgs/outcomes/${createdOutcomeId}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(`/api/orgs/outcomes/${createdOutcomeId}/proof-expectations`, { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([outcome, proofs]) => {
      setPreviewData(prev => ({
        outcome: outcome || prev?.outcome,
        proofs: Array.isArray(proofs) ? proofs : prev?.proofs || [],
        actions: prev?.actions || [],
      }));
    });
  }, [createdOutcomeId, createdResources.length]);

  // Fetch actions when action resources are created
  useEffect(() => {
    const actionResources = createdResources.filter(r => r.type === 'action');
    if (actionResources.length === 0) return;
    fetch('/api/orgs/actions', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data?.actions || [];
        const createdIds = new Set(actionResources.map(r => r.id));
        const matching = list.filter((a: any) => createdIds.has(a.id));
        setPreviewData(prev => prev ? { ...prev, actions: matching } : null);
      })
      .catch(() => {});
  }, [createdResources]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setLoading(true);

    // Add user message to feed
    setFeed(prev => [...prev, { type: 'user', content: msg }]);

    try {
      const res = await fetch('/api/orgs/outcome-builder/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      const data: BuilderResponse = await res.json();

      // Add tool results to feed
      const newFeedItems: FeedItem[] = [];
      for (const tr of data.toolResults || []) {
        newFeedItems.push({ type: 'tool', content: tr.result?.message || `Executed: ${tr.tool}`, toolName: tr.tool, toolResult: tr.result });
        // Track created outcomes
        if (tr.resourceType === 'outcome' && tr.resourceId) {
          setCreatedOutcomeId(tr.resourceId);
        }
        // Handle simulation trigger — auto-navigate
        if (tr.resourceType === 'simulation' && tr.result?.outcomeTypeId) {
          try {
            const simRes = await fetch(`/api/orgs/demo/simulate/${tr.result.outcomeTypeId}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            });
            const simData = await simRes.json();
            if (simData?.instanceId) {
              sessionStorage.setItem(`sim-${simData.instanceId}`, JSON.stringify(simData));
              window.location.href = `/dashboard/simulate/${simData.instanceId}`;
              return; // Navigate away
            }
          } catch { /* fall through to show message */ }
          newFeedItems.push({ type: 'tool', content: 'Simulation could not be started. Make sure the objective has proof expectations.', toolName: 'simulation_error' });
        }
      }

      // Add assistant reply
      newFeedItems.push({ type: 'assistant', content: data.reply });

      setFeed(prev => [...prev, ...newFeedItems]);
      setCreatedResources(prev => [...prev, ...(data.createdResources || [])]);

      // Update history for context
      setHistory(prev => [...prev, { role: 'user', content: msg }, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setFeed(prev => [...prev, { type: 'assistant', content: `Error: ${err?.message || 'Failed to reach the builder. Please try again.'}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-0.5">
            <Link href="/dashboard" className="hover:text-slate-200">Dashboard</Link>
            <span>/</span>
            <span className="text-slate-300">Build with AI</span>
          </div>
          <h1 className="text-lg font-bold text-slate-100">Lamdis</h1>
        </div>
        <div className="flex items-center gap-2">
          {createdOutcomeId && (
            <>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/orgs/instances', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        outcomeTypeId: createdOutcomeId,
                        goalDescription: previewData?.outcome?.name || '',
                        agentEnabled: true,
                      }),
                    });
                    const inst = await res.json();
                    if (inst?.id) {
                      window.location.href = `/dashboard/activity/instances/${inst.id}/agent`;
                    }
                  } catch (e: any) {
                    console.error('Failed to start agent:', e);
                  }
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-medium transition-colors"
              >
                Start Working on This
              </button>
              <Link href={`/dashboard/library/objectives/${createdOutcomeId}/edit`} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
                Open in Editor
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Chat panel (left) */}
        <div className="flex-1 flex flex-col min-w-0 lg:w-2/3">
          {/* Feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {feed.length === 0 && (
              <div className="py-12 text-center space-y-3">
                <h2 className="text-lg font-medium text-slate-200">What do you want to achieve?</h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Tell me your goal — selling something, planning an event, automating a process, or anything else — and I&#39;ll help you make it happen.
                </p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {[
                    'Sell my car for $15k — list it, handle buyers, close the deal',
                    'Plan a birthday party for 30 people next month',
                    'Monitor insurance claims from filing to settlement',
                  ].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-left"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {feed.map((item, idx) => {
              if (item.type === 'user') {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg bg-fuchsia-950/30 border border-fuchsia-500/20 px-4 py-2.5">
                      <p className="text-sm text-slate-200">{item.content}</p>
                    </div>
                  </div>
                );
              }

              if (item.type === 'tool') {
                // Simulation ready link
                if (item.toolName === 'simulation_ready' && item.toolResult?.instanceId) {
                  return (
                    <div key={idx} className="flex justify-center">
                      <Link
                        href={`/dashboard/simulate/${item.toolResult.instanceId}`}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                      >
                        Watch Live Simulation
                      </Link>
                    </div>
                  );
                }
                // Action editor handoff
                if (item.toolName === 'open_action_editor') {
                  return (
                    <div key={idx} className="px-3 py-2">
                      <div className="inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2">
                        <span className="text-xs text-amber-400">{item.content}</span>
                        <Link href={item.toolResult?.url || '/dashboard/library/actions'} className="text-xs px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-500">
                          Open Editor
                        </Link>
                      </div>
                    </div>
                  );
                }
                // Generic tool result
                return (
                  <div key={idx} className="px-3 py-1.5">
                    <div className="inline-flex items-center gap-2 text-xs">
                      <span className="text-emerald-400">&#10003;</span>
                      <span className="text-slate-400">{item.content}</span>
                    </div>
                  </div>
                );
              }

              // Assistant message with markdown
              return (
                <div key={idx} className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg bg-slate-800/50 border border-slate-700 px-4 py-2.5">
                    <div className="text-sm text-slate-300 space-y-1.5">
                      {renderMarkdown(item.content)}
                    </div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                <div className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
                Thinking...
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-800">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Tell me what you want to accomplish..."
                disabled={loading}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-5 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Preview panel (right) */}
        <div className="hidden lg:block w-80 border-l border-slate-800 overflow-y-auto p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Live Preview</h3>

          {/* Outcome */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">Objective</h4>
            {previewData?.outcome ? (
              <Card>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-200 truncate">{previewData.outcome.name}</span>
                    <Badge variant="info">{previewData.outcome.riskClass || 'medium'}</Badge>
                  </div>
                  {previewData.outcome.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">{previewData.outcome.description}</p>
                  )}
                  <Link href={`/dashboard/library/objectives/${previewData.outcome.id}`} className="text-[11px] text-fuchsia-400 hover:text-fuchsia-300 mt-1 inline-block">
                    View details
                  </Link>
                </div>
              </Card>
            ) : (
              <p className="text-xs text-slate-600 italic">No objective created yet</p>
            )}
          </div>

          {/* Proof Expectations */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">Proof Expectations ({previewData?.proofs?.length || 0})</h4>
            {(previewData?.proofs?.length || 0) > 0 ? (
              <div className="space-y-1.5">
                {previewData!.proofs.map((p: any) => (
                  <div key={p.id} className="rounded-lg border border-slate-700 bg-slate-800/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium text-slate-300 truncate">{p.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700 whitespace-nowrap">
                        {(p.checkType || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No proof expectations yet</p>
            )}
          </div>

          {/* Connected Actions */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">Actions ({previewData?.actions?.length || 0})</h4>
            {(previewData?.actions?.length || 0) > 0 ? (
              <div className="space-y-1.5">
                {previewData!.actions.map((a: any) => (
                  <div key={a.id} className="rounded-lg border border-slate-700 bg-slate-800/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium text-slate-300 truncate">{a.title}</span>
                      {a.isMock && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700/30">Mock</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No actions yet</p>
            )}
          </div>

          {/* Run Simulation */}
          {createdOutcomeId && (previewData?.proofs?.length || 0) > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={async () => {
                  if (!createdOutcomeId || loading) return;
                  setLoading(true);
                  try {
                    const res = await fetch(`/api/orgs/demo/simulate/${createdOutcomeId}`, {
                      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
                    });
                    const data = await res.json();
                    if (data?.instanceId) {
                      sessionStorage.setItem(`sim-${data.instanceId}`, JSON.stringify(data));
                      window.location.href = `/dashboard/simulate/${data.instanceId}`;
                      return;
                    }
                  } catch { /* ignore */ }
                  setLoading(false);
                }}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-sm text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
              >
                {loading ? 'Starting...' : 'Run Simulation'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
