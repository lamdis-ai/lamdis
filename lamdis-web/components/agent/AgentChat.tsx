"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FiPaperclip, FiSend, FiPause, FiPlay, FiImage, FiCopy, FiCode, FiCheck, FiChevronDown } from 'react-icons/fi';
import Badge from '@/components/base/Badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ---------------------------------------------------------------------------
// Types
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

type RenderItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'tool-group'; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): RenderItem[] {
  const result: RenderItem[] = [];
  let currentGroup: ChatMessage[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      result.push({ kind: 'tool-group', messages: [...currentGroup] });
      currentGroup = [];
    }
  };

  for (const msg of messages) {
    if (msg.role === 'tool' || msg.role === 'evidence') {
      currentGroup.push(msg);
    } else {
      flushGroup();
      result.push({ kind: 'message', message: msg });
    }
  }
  flushGroup();
  return result;
}

interface AgentSummary {
  agentStatus?: string;
  goalDescription?: string;
  confidenceScore?: number;
  proofStatus?: string;
  currentPlan?: any[];
}

export interface LiveActivity {
  id: string;
  type: 'tool_call' | 'tool_result' | 'thinking' | 'evidence';
  tool?: string;
  ok?: boolean;
  timestamp: Date;
}

interface AgentChatProps {
  instanceId: string | null;
  onSummaryChange?: (summary: AgentSummary | null) => void;
  onEvidenceChange?: (evidence: any[]) => void;
  onActionItemsChange?: (items: any[]) => void;
  onLiveActivityChange?: (activity: LiveActivity[]) => void;
  onStreamingChange?: (streaming: boolean) => void;
}

const statusMeta: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' | 'info'; pulse?: boolean }> = {
  idle: { label: 'Idle', variant: 'neutral' },
  planning: { label: 'Planning', variant: 'info', pulse: true },
  executing: { label: 'Active', variant: 'info', pulse: true },
  waiting_input: { label: 'Needs Input', variant: 'warning', pulse: true },
  paused: { label: 'Paused', variant: 'neutral' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentChat({ instanceId, onSummaryChange, onEvidenceChange, onActionItemsChange, onLiveActivityChange, onStreamingChange }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [liveActivity, setLiveActivity] = useState<LiveActivity[]>([]);
  const [debugMode, setDebugMode] = useState(false);
  const renderItems = useMemo(() => groupMessages(messages), [messages]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevInstanceId = useRef<string | null>(null);

  // Reset state when instance changes
  // Emit live activity and streaming state to parent
  useEffect(() => { onLiveActivityChange?.(liveActivity); }, [liveActivity, onLiveActivityChange]);
  useEffect(() => { onStreamingChange?.(isStreaming); }, [isStreaming, onStreamingChange]);

  const pushActivity = (type: LiveActivity['type'], tool?: string, ok?: boolean) => {
    const entry: LiveActivity = { id: `${Date.now()}-${Math.random()}`, type, tool, ok, timestamp: new Date() };
    setLiveActivity(prev => [...prev.slice(-20), entry]); // keep last 20
  };

  useEffect(() => {
    if (instanceId !== prevInstanceId.current) {
      setMessages([]);
      setEvidence([]);
      setSummary(null);
      setInputText('');
      setFiles([]);
      setIsStreaming(false);
      setLiveActivity([]);
      prevInstanceId.current = instanceId;
    }
  }, [instanceId]);

  // Load plan/summary
  const loadSummary = useCallback(() => {
    if (!instanceId) return;
    fetch(`/api/orgs/instances/${instanceId}/agent/plan`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setSummary(data?.summary || null);
        onSummaryChange?.(data?.summary || null);
      })
      .catch(() => {});
    fetch(`/api/orgs/input-requests?outcomeInstanceId=${instanceId}&status=pending`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => onActionItemsChange?.(data?.requests || []))
      .catch(() => {});
  }, [instanceId, onSummaryChange, onActionItemsChange]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const interval = setInterval(loadSummary, 8000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Notify parent of evidence changes
  useEffect(() => {
    onEvidenceChange?.(evidence);
  }, [evidence, onEvidenceChange]);

  // Send message
  const handleSend = async () => {
    if (!instanceId) return;
    if (!inputText.trim() && files.length === 0) return;
    if (isStreaming) return;

    const imageUrls = files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f));

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText || (files.length > 0 ? `Uploaded ${files.length} file(s)` : ''),
      timestamp: new Date(),
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    };
    setMessages(prev => [...prev, userMsg]);

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

    const agentMsgId = `agent-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: agentMsgId,
      role: 'agent',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }]);

    try {
      const res = await fetch(`/api/orgs/instances/${instanceId}/agent/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

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
            } catch { /* skip */ }
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

  const handleSSEEvent = (data: any, agentMsgId: string) => {
    const eventType = data._eventType || '';

    switch (eventType) {
      case 'message':
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId ? { ...m, content: data.text || JSON.stringify(data) } : m
        ));
        break;
      case 'thinking':
        pushActivity('thinking');
        break;
      case 'tool_call':
        pushActivity('tool_call', data.tool);
        setMessages(prev => [...prev, {
          id: `tool-${Date.now()}-${data.tool}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'tool',
          content: `Using ${data.tool}...`,
          timestamp: new Date(),
          toolName: data.tool,
          toolInput: data.input,
        }]);
        break;
      case 'tool_result':
        pushActivity('tool_result', data.tool, data.ok);
        setMessages(prev => prev.map(m =>
          m.toolName === data.tool && !m.toolResult
            ? { ...m, content: data.ok ? `${data.tool} completed` : `${data.tool} failed: ${data.error}`, toolResult: data }
            : m
        ));
        break;
      case 'evidence':
        pushActivity('evidence');
        setMessages(prev => [...prev, {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'evidence',
          content: `Evidence: ${data.eventType}`,
          timestamp: new Date(),
          evidenceType: data.eventType,
        }]);
        setEvidence(prev => [...prev, data]);
        break;
      case 'status':
        setSummary(prev => prev ? { ...prev, agentStatus: data.agentStatus } : { agentStatus: data.agentStatus });
        break;
      case 'error':
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId ? { ...m, content: `Error: ${data.message || 'Unknown'}`, isStreaming: false } : m
        ));
        break;
      case 'done':
        break;
      default:
        if (data.text) {
          setMessages(prev => prev.map(m =>
            m.id === agentMsgId ? { ...m, content: data.text } : m
          ));
        }
        break;
    }
  };

  const handlePause = async () => {
    if (!instanceId) return;
    await fetch(`/api/orgs/instances/${instanceId}/agent/pause`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    loadSummary();
  };

  const handleResume = async () => {
    if (!instanceId) return;
    await fetch(`/api/orgs/instances/${instanceId}/agent/resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    loadSummary();
  };

  const statusInfo = statusMeta[summary?.agentStatus || 'idle'] || statusMeta.idle;

  // Empty state
  if (!instanceId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950/30">
        <div className="text-center max-w-md px-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-600/20 to-cyan-600/20 border border-slate-700/50 flex items-center justify-center mx-auto mb-4">
            <FiSend className="text-fuchsia-400" size={24} />
          </div>
          <h2 className="text-lg font-semibold text-slate-200 mb-2">Welcome to Lamdis</h2>
          <p className="text-sm text-slate-500">
            Select an objective from the sidebar or create a new one to start working with the agent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950/30">
      {/* Top bar */}
      <div className="h-12 border-b border-slate-800/70 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Badge variant={statusInfo.variant}>
            {statusInfo.pulse && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
            {statusInfo.label}
          </Badge>
          {summary?.goalDescription && (
            <span className="text-sm text-slate-400 truncate">{summary.goalDescription}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {summary?.confidenceScore != null && summary.confidenceScore > 0 && (
            <span className="text-xs font-mono text-fuchsia-400">
              {Math.round(summary.confidenceScore * 100)}%
            </span>
          )}
          {summary?.agentStatus && !['paused', 'completed', 'failed'].includes(summary.agentStatus) && (
            <button onClick={handlePause} className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors">
              <FiPause size={12} className="inline -mt-0.5 mr-1" />Pause
            </button>
          )}
          {summary?.agentStatus === 'paused' && (
            <button onClick={handleResume} className="px-2.5 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded-md transition-colors">
              <FiPlay size={12} className="inline -mt-0.5 mr-1" />Resume
            </button>
          )}
          <button
            onClick={() => setDebugMode(!debugMode)}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${debugMode ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
            title="Toggle debug mode"
          >
            <FiCode size={12} className="inline -mt-0.5 mr-1" />{debugMode ? 'Debug' : 'Debug'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-500 text-sm">Start a conversation with the agent.</p>
            <p className="text-slate-600 text-xs mt-1">Tell the agent what you need or provide context.</p>
          </div>
        )}
        {debugMode ? (
          <DebugLogPane messages={messages} />
        ) : (
          renderItems.map((item, i) =>
            item.kind === 'message'
              ? <MessageBubble key={item.message.id} message={item.message} />
              : <ToolCallGroup key={item.messages[0].id} messages={item.messages} />
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-800/70 px-4 py-3 flex-shrink-0">
        {files.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {files.map((f, i) => (
              <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-md flex items-center gap-1">
                {f.type.startsWith('image/') && <FiImage size={10} />}
                {f.name.length > 20 ? f.name.slice(0, 17) + '...' : f.name}
                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-white ml-0.5">&times;</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
            title="Attach files"
          >
            <FiPaperclip size={18} />
          </button>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Message the agent..."
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-fuchsia-500/50 max-h-32"
            style={{ minHeight: '42px' }}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || (!inputText.trim() && files.length === 0)}
            className="p-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-30 disabled:hover:bg-fuchsia-600 text-white rounded-xl transition-colors flex-shrink-0"
          >
            <FiSend size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

const toolDisplayNames: Record<string, { label: string; icon: string }> = {
  web_search: { label: 'Web Search', icon: '\uD83D\uDD0D' },
  web_fetch: { label: 'Fetch Page', icon: '\uD83C\uDF10' },
  smart_browse: { label: 'Smart Browser', icon: '\uD83D\uDDA5\uFE0F' },
  browser: { label: 'Browser', icon: '\uD83D\uDDA5\uFE0F' },
  download_file: { label: 'Download File', icon: '\u2B07\uFE0F' },
  store_file: { label: 'Store File', icon: '\uD83D\uDCBE' },
  extract_image_urls: { label: 'Extract Images', icon: '\uD83D\uDDBC\uFE0F' },
  code_execute: { label: 'Run Code', icon: '\uD83D\uDCBB' },
  credential_store: { label: 'Credentials', icon: '\uD83D\uDD10' },
  image_process: { label: 'Process Image', icon: '\uD83D\uDDBC\uFE0F' },
  file_read: { label: 'Read File', icon: '\uD83D\uDCC4' },
};

function summarizeToolInput(toolName: string, input: any): string {
  if (!input) return '';
  switch (toolName) {
    case 'web_search': return input.query || '';
    case 'web_fetch': return input.url?.slice(0, 80) || '';
    case 'smart_browse': return input.instruction?.slice(0, 80) || input.url?.slice(0, 80) || '';
    case 'download_file': return input.fileName || input.url?.split('/').pop()?.slice(0, 40) || '';
    case 'store_file': return `${input.action}: ${input.fileName || ''}`;
    case 'extract_image_urls': return input.url?.replace(/^https?:\/\//, '').split('/')[0] || '';
    case 'code_execute': return 'JavaScript';
    case 'credential_store': return input.key || input.action || '';
    default: return Object.values(input).filter(v => typeof v === 'string').join(', ').slice(0, 60) || '';
  }
}

function summarizeToolResult(toolName: string, result: any): string {
  if (!result) return '';
  const r = result.result || result;
  if (result.error) return result.error.slice(0, 100);
  switch (toolName) {
    case 'web_search': return `${r?.results?.length ?? r?.count ?? 0} results`;
    case 'smart_browse': return r?.actionsPerformed ? `${r.actionsPerformed.length} actions, ${r.extractedImages?.length || 0} images` : '';
    case 'download_file': return r?.fileName ? `Saved ${r.fileName} (${r.sizeKB} KB)` : '';
    case 'extract_image_urls': return `${r?.imageCount || r?.images?.length || 0} image URLs found`;
    case 'store_file': return r?.files ? `${r.files.length} files` : r?.written ? `Saved ${r.fileName}` : '';
    default: return typeof r === 'string' ? r.slice(0, 80) : '';
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 text-slate-600 hover:text-slate-400 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <FiCheck size={11} className="text-emerald-400" /> : <FiCopy size={11} />}
    </button>
  );
}

function ToolCallGroup({ messages }: { messages: ChatMessage[] }) {
  const toolMessages = messages.filter(m => m.role === 'tool');
  const [expanded, setExpanded] = useState(false);

  // If no tool messages (evidence-only group), render each individually
  if (toolMessages.length === 0) {
    return <>{messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}</>;
  }

  // Single tool call — render directly, no wrapper
  if (toolMessages.length === 1 && messages.filter(m => m.role === 'evidence').length === 0) {
    return <MessageBubble message={toolMessages[0]} />;
  }

  const succeeded = toolMessages.filter(m => m.toolResult?.ok === true).length;
  const failed = toolMessages.filter(m => m.toolResult?.ok === false).length;
  const running = toolMessages.filter(m => !m.toolResult).length;

  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} \u2713`);
  if (failed > 0) parts.push(`${failed} \u2717`);
  if (running > 0) parts.push(`${running} running`);
  const summaryText = `${toolMessages.length} tool call${toolMessages.length !== 1 ? 's' : ''}`;

  return (
    <div className="ml-2 mr-8">
      <div className={`rounded-lg border overflow-hidden ${
        failed > 0 ? 'border-rose-800/30 bg-rose-950/10' :
        running > 0 ? 'border-cyan-800/30 bg-cyan-950/10' :
        'border-slate-700/20 bg-slate-800/20'
      }`}>
        <button onClick={() => setExpanded(!expanded)} className="w-full text-left px-3 py-2 flex items-center gap-2">
          <span className="text-sm flex-shrink-0">{'\u2699\uFE0F'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">{summaryText}</span>
              {running > 0 && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
              <span className="text-[11px] text-slate-500">{parts.join('  ')}</span>
            </div>
          </div>
          <FiChevronDown size={12} className={`text-slate-600 transition-transform flex-shrink-0 ${expanded ? '' : '-rotate-90'}`} />
        </button>

        {expanded && (
          <div className="border-t border-slate-700/20 px-1 py-1 space-y-1">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DebugLogPane({ messages }: { messages: ChatMessage[] }) {
  const formatMessage = (msg: ChatMessage): string => {
    const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    switch (msg.role) {
      case 'user':
        return `${time} [user] ${msg.content}`;
      case 'agent':
        return `${time} [agent] ${msg.content}`;
      case 'tool': {
        const lines = [`${time} [tool:${msg.toolName}] \u2190 ${JSON.stringify(msg.toolInput, null, 2)}`];
        if (msg.toolResult) {
          const status = msg.toolResult.ok ? 'OK' : 'FAIL';
          const body = msg.toolResult.ok
            ? JSON.stringify(msg.toolResult.result, null, 2)
            : (msg.toolResult.error || 'unknown error');
          lines.push(`${time} [tool:${msg.toolName}] \u2192 ${status}: ${body}`);
        }
        return lines.join('\n');
      }
      case 'evidence':
        return `${time} [evidence] ${msg.content}`;
      case 'system':
        return `${time} [system] ${msg.content}`;
      default:
        return `${time} ${msg.content}`;
    }
  };

  const logText = messages.map(formatMessage).join('\n');

  return (
    <div className="flex-1 flex flex-col p-2 gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-amber-600 uppercase tracking-wide font-medium">Debug Log</span>
        <CopyButton text={logText} />
      </div>
      <pre className="flex-1 text-[11px] text-amber-400/80 bg-amber-950/10 border border-amber-800/20 rounded-lg p-3 overflow-auto font-mono whitespace-pre-wrap">{logText}</pre>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-fuchsia-900/30 border border-fuchsia-800/30 rounded-2xl rounded-br-md px-4 py-2.5">
          {message.imageUrls && message.imageUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {message.imageUrls.map((url, i) => (
                <img key={i} src={url} alt="Upload" className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
              ))}
            </div>
          )}
          <p className="text-sm text-white whitespace-pre-wrap">{message.content}</p>
          <p className="text-[10px] text-slate-500 mt-1">{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    const info = toolDisplayNames[message.toolName || ''] || { label: message.toolName || 'Tool', icon: '\u2699\uFE0F' };
    const inputSummary = summarizeToolInput(message.toolName || '', message.toolInput);
    const resultSummary = message.toolResult ? summarizeToolResult(message.toolName || '', message.toolResult) : '';
    const isRunning = !message.toolResult;
    const ok = message.toolResult?.ok;
    const failed = ok === false;

    return (
      <div className="ml-2 mr-8">
        <div className={`rounded-lg border overflow-hidden ${
          failed ? 'border-rose-800/30 bg-rose-950/10' :
          isRunning ? 'border-cyan-800/30 bg-cyan-950/10' :
          'border-slate-700/20 bg-slate-800/20'
        }`}>
          {/* Header row */}
          <button onClick={() => setExpanded(!expanded)} className="w-full text-left px-3 py-2 flex items-center gap-2">
            <span className="text-sm flex-shrink-0">{info.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${failed ? 'text-rose-300' : isRunning ? 'text-cyan-300' : 'text-slate-300'}`}>
                  {info.label}
                </span>
                {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                {ok === true && <span className="text-[10px] text-emerald-500">{'✓'}</span>}
                {failed && <span className="text-[10px] text-rose-400">{'✗'} failed</span>}
              </div>
              {inputSummary && (
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{inputSummary}</p>
              )}
              {resultSummary && !failed && (
                <p className="text-[11px] text-slate-400 mt-0.5">{resultSummary}</p>
              )}
              {failed && message.toolResult?.error && (
                <p className="text-[11px] text-rose-400/80 mt-0.5 line-clamp-2">{message.toolResult.error}</p>
              )}
            </div>
            <FiChevronDown size={12} className={`text-slate-600 transition-transform flex-shrink-0 ${expanded ? '' : '-rotate-90'}`} />
          </button>

          {/* Expanded details */}
          {expanded && (
            <div className="border-t border-slate-700/20 px-3 py-2 space-y-2">
              {message.toolInput && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-slate-600 uppercase tracking-wide">Input</span>
                    <CopyButton text={JSON.stringify(message.toolInput, null, 2)} />
                  </div>
                  <pre className="text-[10px] text-slate-500 bg-slate-900/50 rounded p-2 overflow-auto max-h-32 font-mono">{JSON.stringify(message.toolInput, null, 2)}</pre>
                </div>
              )}
              {message.toolResult && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-slate-600 uppercase tracking-wide">Result</span>
                    <CopyButton text={JSON.stringify(message.toolResult, null, 2)} />
                  </div>
                  <pre className={`text-[10px] bg-slate-900/50 rounded p-2 overflow-auto max-h-40 font-mono ${failed ? 'text-rose-400/80' : 'text-slate-400'}`}>{JSON.stringify(message.toolResult.result || message.toolResult.error, null, 2)}</pre>
                  {(message.toolResult.result as any)?.screenshotUrl && (
                    <img
                      src={`/api${(message.toolResult.result as any).screenshotUrl}`}
                      alt="Browser screenshot"
                      className="mt-2 max-w-[400px] rounded-lg border border-slate-700 cursor-pointer hover:opacity-90"
                      onClick={() => window.open(`/api${(message.toolResult?.result as any)?.screenshotUrl}`, '_blank')}
                    />
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  if (message.role === 'evidence') {
    return null; // Evidence is shown in DebugLogPane or the Evidence tab
  }

  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] text-slate-500">{message.content}</span>
      </div>
    );
  }

  // Agent message
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-slate-800/50 border border-slate-700/30 rounded-2xl rounded-bl-md px-4 py-2.5">
        {message.isStreaming && !message.content && (
          <div className="flex gap-1 py-1">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        {message.content && (
          <div className="text-sm text-slate-200 agent-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
        <p className="text-[10px] text-slate-500 mt-1">{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>
  );
}
