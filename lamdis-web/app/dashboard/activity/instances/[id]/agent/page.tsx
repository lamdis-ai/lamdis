"use client";
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const agentStatusMeta: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' | 'info'; pulse?: boolean }> = {
  idle: { label: 'Idle', variant: 'neutral' },
  planning: { label: 'Planning', variant: 'info', pulse: true },
  executing: { label: 'Active', variant: 'info', pulse: true },
  waiting_input: { label: 'Waiting', variant: 'warning', pulse: true },
  paused: { label: 'Paused', variant: 'neutral' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

// ---------------------------------------------------------------------------
// Message types for the chat
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'tool' | 'evidence' | 'system';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: { ok: boolean; result?: unknown; error?: string };
  evidenceType?: string;
  isStreaming?: boolean;
  imageUrls?: string[];
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:mime;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AgentViewPage() {
  const params = useParams();
  const id = params?.id as string;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load initial state
  const loadSummary = useCallback(() => {
    if (!id) return;
    fetch(`/api/orgs/instances/${id}/agent/plan`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setSummary(data?.summary))
      .catch(() => {});
    fetch(`/api/orgs/input-requests?outcomeInstanceId=${id}&status=pending`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setActionItems(data?.requests || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const interval = setInterval(loadSummary, 10000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSend = async () => {
    if (!inputText.trim() && files.length === 0) return;
    if (isStreaming) return;

    // Create image preview URLs before clearing files
    const imageUrls = files
      .filter(f => f.type.startsWith('image/'))
      .map(f => URL.createObjectURL(f));

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText || (files.length > 0 ? `Uploaded ${files.length} file(s)` : ''),
      timestamp: new Date(),
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    };
    setMessages(prev => [...prev, userMsg]);

    // Prepare attachments
    let attachments: Array<{ data: string; mimeType: string; name?: string }> | undefined;
    if (files.length > 0) {
      attachments = [];
      for (const file of files) {
        const base64 = await fileToBase64(file);
        attachments.push({ data: base64, mimeType: file.type, name: file.name });
      }
    }

    const body = JSON.stringify({
      message: inputText || 'Here are the files I uploaded.',
      attachments,
    });

    setInputText('');
    setFiles([]);
    setIsStreaming(true);

    // Add a streaming placeholder for the agent
    const agentMsgId = `agent-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: agentMsgId,
      role: 'agent',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }]);

    try {
      const res = await fetch(`/api/orgs/instances/${id}/agent/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent({ ...data, _eventType: currentEventType }, agentMsgId);
            } catch { /* skip malformed */ }
            currentEventType = '';
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === agentMsgId
          ? { ...m, content: m.content || `Error: ${err?.message}`, isStreaming: false }
          : m
      ));
    }

    setIsStreaming(false);
    setMessages(prev => prev.map(m =>
      m.id === agentMsgId ? { ...m, isStreaming: false } : m
    ));
    loadSummary();
  };

  // Handle SSE events from the agent
  const handleSSEEvent = (data: any, agentMsgId: string) => {
    const eventType = data._eventType || '';

    switch (eventType) {
      case 'message':
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId ? { ...m, content: data.text || JSON.stringify(data) } : m
        ));
        break;

      case 'thinking':
        // Show thinking indicator but don't replace content
        break;

      case 'tool_call':
        setMessages(prev => [...prev, {
          id: `tool-${Date.now()}-${data.tool}`,
          role: 'tool' as const,
          content: `Using ${data.tool}...`,
          timestamp: new Date(),
          toolName: data.tool,
          toolInput: data.input,
        }]);
        break;

      case 'tool_result':
        setMessages(prev => prev.map(m =>
          m.toolName === data.tool && !m.toolResult
            ? { ...m, content: data.ok ? `${data.tool} completed` : `${data.tool} failed: ${data.error}`, toolResult: data }
            : m
        ));
        break;

      case 'evidence':
        setMessages(prev => [...prev, {
          id: `ev-${Date.now()}`,
          role: 'evidence' as const,
          content: `Evidence: ${data.eventType}`,
          timestamp: new Date(),
          evidenceType: data.eventType,
        }]);
        setEvidence(prev => [...prev, data]);
        break;

      case 'status':
        setSummary((prev: any) => prev ? { ...prev, agentStatus: data.agentStatus } : prev);
        break;

      case 'error':
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId ? { ...m, content: `Error: ${data.message || 'Unknown error'}`, isStreaming: false } : m
        ));
        break;

      case 'done':
        // Streaming complete
        break;

      default:
        // Fallback: try to detect from data shape
        if (data.text) {
          setMessages(prev => prev.map(m =>
            m.id === agentMsgId ? { ...m, content: data.text } : m
          ));
        } else if (data.message && typeof data.message === 'string') {
          setMessages(prev => prev.map(m =>
            m.id === agentMsgId ? { ...m, content: `Error: ${data.message}`, isStreaming: false } : m
          ));
        }
        break;
    }
  };

  const handlePause = async () => {
    await fetch(`/api/orgs/instances/${id}/agent/pause`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    loadSummary();
  };

  const handleResume = async () => {
    await fetch(`/api/orgs/instances/${id}/agent/resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    loadSummary();
  };

  const statusInfo = agentStatusMeta[summary?.agentStatus || 'idle'] || agentStatusMeta.idle;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/activity/instances/${id}`} className="text-sm text-slate-400 hover:text-white">
            &larr; Instance
          </Link>
          <h1 className="text-sm font-semibold text-white">Agent</h1>
          <Badge variant={statusInfo.variant}>
            {statusInfo.pulse && <span className="inline-block w-2 h-2 rounded-full bg-current mr-1 animate-pulse" />}
            {statusInfo.label}
          </Badge>
          {summary?.confidenceScore != null && (
            <span className="text-xs font-mono text-fuchsia-400">
              {((summary.confidenceScore || 0) * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowSidebar(!showSidebar)} className="text-xs text-slate-400 hover:text-white">
            {showSidebar ? 'Hide' : 'Show'} Evidence
          </button>
          {summary?.agentStatus !== 'paused' && summary?.agentStatus !== 'completed' && (
            <button onClick={handlePause} className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded">
              Pause
            </button>
          )}
          {summary?.agentStatus === 'paused' && (
            <button onClick={handleResume} className="px-2 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded">
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {/* Goal banner */}
          {summary?.goalDescription && (
            <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700/30">
              <p className="text-xs text-slate-400">Goal: <span className="text-white">{summary.goalDescription}</span></p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <p className="text-slate-500 text-sm">Start a conversation with the agent.</p>
                <p className="text-slate-600 text-xs mt-1">Tell the agent what you want to achieve.</p>
              </div>
            )}
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-700/50 px-4 py-3">
            {files.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {files.map((f, i) => (
                  <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded flex items-center gap-1">
                    {f.name}
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-white">&times;</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md"
                title="Attach files"
              >
                +
              </button>
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Type a message..."
                className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                disabled={isStreaming}
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || (!inputText.trim() && files.length === 0)}
                className="px-4 py-2 text-sm bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-md"
              >
                {isStreaming ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* Evidence sidebar */}
        {showSidebar && (
          <div className="w-72 border-l border-slate-700/50 overflow-y-auto p-3 space-y-3">
            {actionItems.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Action Items</h3>
                {actionItems.map((item: any) => (
                  <ActionItemCard key={item.id} item={item} instanceId={id} onResolved={loadSummary} />
                ))}
              </>
            )}

            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Evidence Trail</h3>
            {evidence.length === 0 && (
              <p className="text-xs text-slate-600">No evidence captured yet.</p>
            )}
            {evidence.map((ev, i) => (
              <div key={i} className="bg-slate-800/50 rounded p-2 border border-slate-700/30">
                <p className="text-xs text-emerald-400 font-mono">{ev.eventType}</p>
                {ev.confidence && (
                  <p className="text-xs text-slate-500 mt-0.5">{(ev.confidence * 100).toFixed(0)}% confidence</p>
                )}
              </div>
            ))}

            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4">Status</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Proof</span>
                <span className="text-slate-300 capitalize">{summary?.proofStatus || 'gathering'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Confidence</span>
                <span className="text-slate-300">{((summary?.confidenceScore || 0) * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble component
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] bg-cyan-800/40 border border-cyan-700/30 rounded-xl rounded-br-sm px-4 py-2.5">
          {message.imageUrls && message.imageUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {message.imageUrls.map((url, i) => (
                <img key={i} src={url} alt="Upload" className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
              ))}
            </div>
          )}
          <p className="text-sm text-white whitespace-pre-wrap">{message.content}</p>
          <p className="text-xs text-slate-500 mt-1">{message.timestamp.toLocaleTimeString()}</p>
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    return (
      <div className="flex justify-start pl-4">
        <div
          className="max-w-[80%] bg-slate-800/60 border border-slate-700/30 rounded-lg px-3 py-2 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-cyan-400 font-mono">
              {message.toolResult?.ok === false ? '\u274C' : message.toolResult ? '\u2705' : '\u26A1'} {message.toolName}
            </span>
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </div>
          {expanded && message.toolInput && (
            <pre className="text-xs text-slate-500 mt-1 overflow-auto max-h-32">
              {JSON.stringify(message.toolInput, null, 2)}
            </pre>
          )}
          {expanded && message.toolResult && (
            <pre className="text-xs text-slate-400 mt-1 overflow-auto max-h-32">
              {JSON.stringify(message.toolResult.result || message.toolResult.error, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'evidence') {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-emerald-500/70 bg-emerald-950/20 px-2 py-0.5 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-slate-500">{message.content}</span>
      </div>
    );
  }

  // Agent message
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-slate-800/60 border border-slate-700/30 rounded-xl rounded-bl-sm px-4 py-2.5">
        {message.isStreaming && !message.content && (
          <div className="flex gap-1 py-1">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        {message.content && (
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{message.content}</p>
        )}
        <p className="text-xs text-slate-500 mt-1">{message.timestamp.toLocaleTimeString()}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action Item Card — persistent sidebar items for human-in-the-loop tasks
// ---------------------------------------------------------------------------

function ActionItemCard({ item, instanceId, onResolved }: { item: any; instanceId: string; onResolved: () => void }) {
  const [textValue, setTextValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleRespond = async (response: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await fetch(`/api/orgs/input-requests/${item.id}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      onResolved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-amber-950/20 border border-amber-700/30 rounded-lg p-2.5 space-y-2">
      <p className="text-xs font-medium text-amber-200">{item.title}</p>
      {item.description && <p className="text-xs text-slate-400">{item.description}</p>}

      {item.schema?.screenshotUrl && (
        <img
          src={`/api${item.schema.screenshotUrl}`}
          alt="Browser screenshot"
          className="w-full rounded-lg border border-slate-700 mb-1"
        />
      )}

      {(item.requestType === 'text' || item.requestType === 'credentials') && (
        <div className="flex gap-1">
          <input
            type={item.requestType === 'credentials' ? 'password' : 'text'}
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            placeholder={item.schema?.placeholder || 'Type here...'}
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
          />
          <button
            onClick={() => handleRespond({ value: textValue })}
            disabled={submitting || !textValue}
            className="px-2 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded"
          >
            Send
          </button>
        </div>
      )}

      {(item.requestType === 'images' || item.requestType === 'file') && (
        <div>
          <input
            type="file"
            multiple={item.requestType === 'images'}
            accept={item.requestType === 'images' ? 'image/*' : undefined}
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="text-xs text-slate-300"
          />
          {files.length > 0 && (
            <button
              onClick={async () => {
                const fileData = [];
                for (const f of files) {
                  const base64 = await fileToBase64(f);
                  fileData.push({ name: f.name, data: base64, mimeType: f.type });
                }
                handleRespond({ files: fileData });
              }}
              disabled={submitting}
              className="mt-1 px-2 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded"
            >
              Upload
            </button>
          )}
        </div>
      )}

      {item.requestType === 'approval' && (
        <div className="flex gap-2">
          <button onClick={() => handleRespond({ approved: true })} disabled={submitting}
            className="px-2 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded">Approve</button>
          <button onClick={() => handleRespond({ approved: false })} disabled={submitting}
            className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded">Decline</button>
        </div>
      )}

      {item.requestType === 'choice' && item.schema?.options && (
        <div className="space-y-1">
          {(item.schema.options as string[]).map((opt: string) => (
            <button key={opt} onClick={() => handleRespond({ value: opt })} disabled={submitting}
              className="block w-full text-left px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded">
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
