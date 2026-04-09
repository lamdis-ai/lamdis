"use client";
import { useState, useEffect } from 'react';
import Card from '@/components/base/Card';

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

interface Workflow {
  id: string;
  name: string;
  category?: string;
  expectedEventTypes?: string[];
}

interface LogEntry {
  id: string;
  eventType: string;
  status: 'success' | 'error';
  message: string;
  timestamp: string;
}

export default function EventSimulatorPage() {
  const [apiKey, setApiKey] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [workflowInstanceId, setWorkflowInstanceId] = useState(() => crypto.randomUUID());
  const [eventType, setEventType] = useState('');
  const [payload, setPayload] = useState('{}');
  const [source, setSource] = useState('simulator');
  const [metadata, setMetadata] = useState('{}');
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);

  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
  const expectedEventTypes = selectedWorkflow?.expectedEventTypes || [];

  useEffect(() => {
    fetch('/api/orgs/workflows', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data?.workflows || data?.items || [];
        setWorkflows(list);
      })
      .catch(() => {})
      .finally(() => setLoadingWorkflows(false));
  }, []);

  const handleSend = async () => {
    if (!apiKey || !eventType || sending) return;

    let parsedPayload: any;
    let parsedMetadata: any;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setLog(prev => [{ id: crypto.randomUUID(), eventType, status: 'error', message: 'Invalid payload JSON', timestamp: new Date().toISOString() }, ...prev]);
      return;
    }
    try {
      parsedMetadata = metadata.trim() ? JSON.parse(metadata) : {};
    } catch {
      setLog(prev => [{ id: crypto.randomUUID(), eventType, status: 'error', message: 'Invalid metadata JSON', timestamp: new Date().toISOString() }, ...prev]);
      return;
    }

    // Include workflowKey so the correlation engine can match to the selected workflow
    if (selectedWorkflow && !parsedMetadata.workflowKey) {
      parsedMetadata.workflowKey = selectedWorkflow.name;
    }

    setSending(true);
    try {
      const res = await fetch('/api/orgs/event-simulator/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          events: [{
            workflowInstanceId,
            eventType,
            payload: parsedPayload,
            source,
            metadata: parsedMetadata,
          }],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const accepted = data?.accepted ?? data?.results?.length ?? 1;
        setLog(prev => [{
          id: crypto.randomUUID(),
          eventType,
          status: 'success',
          message: `Accepted: ${accepted}${data?.duplicates ? `, Duplicates: ${data.duplicates}` : ''}`,
          timestamp: new Date().toISOString(),
        }, ...prev]);
      } else {
        setLog(prev => [{
          id: crypto.randomUUID(),
          eventType,
          status: 'error',
          message: data?.error || data?.message || `Error ${res.status}`,
          timestamp: new Date().toISOString(),
        }, ...prev]);
      }
    } catch (e: any) {
      setLog(prev => [{
        id: crypto.randomUUID(),
        eventType,
        status: 'error',
        message: e?.message || 'Network error',
        timestamp: new Date().toISOString(),
      }, ...prev]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Event Simulator</h1>
        <p className="text-sm text-slate-400 mt-1">Test your API key and simulate sending events to workflows without writing code.</p>
      </div>

      {/* API Key */}
      <Card>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="lam_sk_..."
              className={inputCls}
            />
            <p className="text-xs text-slate-500 mt-1">Your Lamdis API key. This is sent to the ingest service to authenticate the event.</p>
          </div>
        </div>
      </Card>

      {/* Workflow + Instance */}
      <Card>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Workflow</label>
            {loadingWorkflows ? (
              <div className="text-sm text-slate-500">Loading workflows...</div>
            ) : (
              <select
                value={selectedWorkflowId}
                onChange={e => {
                  setSelectedWorkflowId(e.target.value);
                  setEventType('');
                }}
                className={`${selectCls} w-full`}
              >
                <option value="">Select a workflow...</option>
                {workflows.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.category ? ` (${w.category})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Expected event type chips */}
          {expectedEventTypes.length > 0 && (
            <div>
              <label className={labelCls}>Expected Event Types</label>
              <div className="flex flex-wrap gap-1.5">
                {expectedEventTypes.map(evt => (
                  <button
                    key={evt}
                    type="button"
                    onClick={() => setEventType(evt)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-mono transition-colors ${
                      eventType === evt
                        ? 'border-violet-500/40 bg-violet-950/30 text-violet-300'
                        : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    {evt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Workflow Instance ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workflowInstanceId}
                onChange={e => setWorkflowInstanceId(e.target.value)}
                className={`${inputCls} font-mono text-xs`}
              />
              <button
                type="button"
                onClick={() => setWorkflowInstanceId(crypto.randomUUID())}
                className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Event Form */}
      <Card>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Event</h2>
          </div>

          <div>
            <label className={labelCls}>Event Type</label>
            <input
              type="text"
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              placeholder="e.g., payment.received"
              className={`${inputCls} font-mono`}
            />
          </div>

          <div>
            <label className={labelCls}>Payload (JSON)</label>
            <textarea
              rows={4}
              value={payload}
              onChange={e => setPayload(e.target.value)}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Source</label>
              <input
                type="text"
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="simulator"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Metadata (JSON, optional)</label>
              <textarea
                rows={2}
                value={metadata}
                onChange={e => setMetadata(e.target.value)}
                className={`${inputCls} font-mono text-xs`}
              />
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !apiKey || !eventType}
            className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {sending ? 'Sending...' : 'Send Event'}
          </button>
        </div>
      </Card>

      {/* Event Log */}
      {log.length > 0 && (
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Event Log</h2>
              <button
                type="button"
                onClick={() => setLog([])}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {log.map(entry => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 px-3 py-2 rounded-md text-xs ${
                    entry.status === 'success'
                      ? 'bg-emerald-950/20 border border-emerald-500/20'
                      : 'bg-rose-950/20 border border-rose-500/20'
                  }`}
                >
                  <span className={entry.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}>
                    {entry.status === 'success' ? 'OK' : 'ERR'}
                  </span>
                  <code className="text-slate-300 font-mono">{entry.eventType}</code>
                  <span className="text-slate-400 flex-1">{entry.message}</span>
                  <span className="text-slate-600 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
