"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { FiCheckSquare, FiInbox, FiDatabase, FiTool, FiKey, FiChevronRight, FiChevronDown, FiX, FiFile, FiImage, FiDownload, FiFileText, FiTrash2, FiSearch, FiMonitor, FiClock } from 'react-icons/fi';
import Badge from '@/components/base/Badge';
import Modal from '@/components/base/Modal';
import ReactMarkdown from 'react-markdown';
import LiveBrowserView from './LiveBrowserView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentTask {
  id: string;
  sequence: number;
  title: string;
  description?: string;
  status: string;
  taskType?: string;
  actionInput?: { runCount?: number; tool?: string; [k: string]: any };
  assigneeType?: string;
  assigneeRef?: string;
  evidenceAttachments?: any[];
  completedAt?: string;
}

interface InputRequest {
  id: string;
  requestType: string;
  title: string;
  description?: string;
  schema?: any;
  status: string;
}

export interface LiveActivity {
  id: string;
  type: 'tool_call' | 'tool_result' | 'thinking' | 'evidence';
  tool?: string;
  ok?: boolean;
  timestamp: Date;
}

interface ContextPanelProps {
  instanceId: string | null;
  summary?: any;
  evidence?: any[];
  actionItems?: InputRequest[];
  liveActivity?: LiveActivity[];
  isAgentWorking?: boolean;
}

type Tab = 'context' | 'plan' | 'tasks' | 'files' | 'browser' | 'evidence' | 'tools';
type TabGroupId = 'now' | 'inputs' | 'trail';

const tabs: { id: Tab; label: string; icon: typeof FiCheckSquare; group: TabGroupId }[] = [
  { id: 'context', label: 'Context', icon: FiInbox, group: 'now' },
  { id: 'plan', label: 'Plan', icon: FiFileText, group: 'now' },
  { id: 'tasks', label: 'Tasks', icon: FiCheckSquare, group: 'now' },
  { id: 'files', label: 'Files', icon: FiFile, group: 'inputs' },
  { id: 'browser', label: 'Browser', icon: FiMonitor, group: 'inputs' },
  { id: 'evidence', label: 'Evidence', icon: FiDatabase, group: 'trail' },
  { id: 'tools', label: 'Tools', icon: FiKey, group: 'trail' },
];

const tabGroups: { id: TabGroupId; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'trail', label: 'Trail' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContextPanel({ instanceId, summary, evidence = [], actionItems = [], liveActivity = [], isAgentWorking = false }: ContextPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('context');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [facts, setFacts] = useState<Record<string, any>>({});
  const [panelWidth, setPanelWidth] = useState(320);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Drag to resize
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX; // dragging left = bigger
      setPanelWidth(Math.max(280, Math.min(600, dragStartWidth.current + delta)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  const [tools, setTools] = useState<any[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [autoSwitched, setAutoSwitched] = useState(false);

  // Load tasks from plan — refresh on status change and when tools complete
  const toolResultCount = liveActivity.filter(a => a.type === 'tool_result').length;
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const refreshTasks = useCallback(() => setTaskRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!instanceId) { setTasks([]); setFacts({}); return; }
    fetch(`/api/orgs/instances/${instanceId}/agent/plan`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setTasks(data?.tasks || []))
      .catch(() => {});
    fetch(`/api/orgs/instances/${instanceId}/facts`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setFacts(data?.facts || {}))
      .catch(() => {});
  }, [instanceId, summary?.agentStatus, toolResultCount, taskRefreshKey]);

  // Load evidence from timeline API (full history, not just SSE stream)
  useEffect(() => {
    if (!instanceId) { setTimelineEvents([]); return; }
    const load = () => {
      fetch(`/api/orgs/outcome-instances/${instanceId}/timeline`, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          const events = Array.isArray(data) ? data : data?.events || data?.timeline || [];
          setTimelineEvents(events);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [instanceId]);

  // Load tools
  useEffect(() => {
    if (!instanceId) { setTools([]); return; }
    fetch(`/api/orgs/tools`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setTools(Array.isArray(data) ? data : data?.tools || []))
      .catch(() => {});
  }, [instanceId]);

  // Highlight requests tab when there are pending items
  const pendingRequests = actionItems.filter(r => r.status === 'pending');

  // Auto-switch to requests tab when new pending requests arrive
  useEffect(() => {
    if (pendingRequests.length > 0 && !autoSwitched) {
      setActiveTab('tasks');
      setAutoSwitched(true);
    }
    if (pendingRequests.length === 0) {
      setAutoSwitched(false);
    }
  }, [pendingRequests.length, autoSwitched]);

  if (!instanceId) return null;

  if (collapsed) {
    return (
      <div className="w-10 border-l border-slate-800/70 bg-slate-950/60 flex flex-col items-center py-3 gap-2">
        <button onClick={() => setCollapsed(false)} className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
          <FiChevronRight size={14} className="rotate-180" />
        </button>
        {pendingRequests.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] flex items-center justify-center font-bold">
            {pendingRequests.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border-l border-slate-800/70 bg-slate-950/60 flex flex-col flex-shrink-0 relative" style={{ width: panelWidth }}>
      {/* Drag handle for resizing */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-fuchsia-500/20 active:bg-fuchsia-500/30 z-10"
      />
      {/* Tab bar — grouped Now / Inputs / Trail */}
      <div className="border-b border-slate-800/70 flex-shrink-0">
        <div className="flex items-stretch px-1 pt-1.5 gap-2">
          {tabGroups.map((group, gi) => {
            const groupTabs = tabs.filter(t => t.group === group.id);
            return (
              <div key={group.id} className={`flex items-center gap-0.5 ${gi > 0 ? 'pl-2 border-l border-slate-800/70' : ''}`}>
                <span className="text-[9px] uppercase tracking-wide text-slate-600 font-medium px-1 hidden lg:inline">{group.label}</span>
                {groupTabs.map(tab => {
                  const isActive = activeTab === tab.id;
                  const hasBadge = (tab.id === 'tasks') && pendingRequests.length > 0;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (tab.id === 'browser' && panelWidth < 600) setPanelWidth(700);
                      }}
                      title={tab.label}
                      className={`flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-md transition-colors relative ${
                        isActive
                          ? 'bg-slate-800/70 text-white'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                      }`}
                    >
                      <tab.icon size={12} />
                      <span className="hidden xl:inline">{tab.label}</span>
                      {hasBadge && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-600 text-white text-[9px] flex items-center justify-center font-bold">
                          {pendingRequests.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="flex-1" />
          <button onClick={() => setCollapsed(true)} className="p-1 text-slate-600 hover:text-slate-400 self-center" title="Collapse panel">
            <FiX size={14} />
          </button>
        </div>
      </div>

      {/* Live activity banner */}
      {isAgentWorking && (
        <LiveActivityBanner activity={liveActivity} />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'context' && <ContextTab summary={summary} facts={facts} instanceId={instanceId} onRefresh={refreshTasks} />}
        {activeTab === 'plan' && <PlanTab tasks={tasks} summary={summary} instanceId={instanceId} onRefresh={refreshTasks} />}
        {activeTab === 'tasks' && <TasksTab tasks={tasks} summary={summary} requests={pendingRequests} instanceId={instanceId} onRefresh={refreshTasks} facts={facts} />}
        {activeTab === 'files' && <FilesTab instanceId={instanceId} toolResultCount={toolResultCount} />}
        {activeTab === 'browser' && <LiveBrowserView instanceId={instanceId} active={activeTab === 'browser'} />}
        {activeTab === 'evidence' && <EvidenceTab instanceId={instanceId} />}
        {activeTab === 'tools' && <ToolsTab tools={tools} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Activity Banner — shows what the agent is doing RIGHT NOW
// ---------------------------------------------------------------------------

const toolDisplayNames: Record<string, string> = {
  web_search: 'Searching the web',
  web_fetch: 'Fetching page',
  browser: 'Using browser',
  code_execute: 'Running code',
  file_read: 'Reading file',
  file_write: 'Writing file',
  credential_store: 'Managing credentials',
  image_process: 'Processing image',
  send_message: 'Sending message',
  create_tool: 'Creating tool',
};

function LiveActivityBanner({ activity }: { activity: LiveActivity[] }) {
  // Show the most recent few activities
  const recent = activity.slice(-5).reverse();
  const activeTool = recent.find(a => a.type === 'tool_call' && !activity.some(b => b.type === 'tool_result' && b.tool === a.tool && b.timestamp > a.timestamp));

  return (
    <div className="border-b border-slate-800/70 bg-slate-900/50 px-3 py-2 space-y-1.5">
      {/* Current action */}
      {activeTool && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />
          <span className="text-xs text-cyan-300 font-medium">
            {toolDisplayNames[activeTool.tool || ''] || `Running ${activeTool.tool}`}
          </span>
        </div>
      )}
      {!activeTool && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse flex-shrink-0" />
          <span className="text-xs text-fuchsia-300 font-medium">Thinking...</span>
        </div>
      )}

      {/* Recent tool results */}
      {recent.filter(a => a.type === 'tool_result').slice(0, 3).map(a => (
        <div key={a.id} className="flex items-center gap-2 pl-4">
          <span className="text-[10px]">{a.ok ? '\u2705' : '\u274C'}</span>
          <span className="text-[10px] text-slate-500">
            {toolDisplayNames[a.tool || ''] || a.tool} {a.ok ? 'done' : 'failed'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context tab — goal, current step, facts
// ---------------------------------------------------------------------------

function ContextTab({ summary, facts, instanceId, onRefresh }: { summary?: any; facts?: Record<string, any>; instanceId?: string; onRefresh?: () => void }) {
  return (
    <div className="space-y-3">
      {summary?.goalDescription && (
        <div className="px-2 py-1.5 rounded-lg bg-slate-800/30 border border-slate-700/30 space-y-1.5">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Goal</p>
            <p className="text-xs text-slate-300 mt-0.5">{summary.goalDescription}</p>
          </div>
          {summary.currentPlan && (
            <div className="border-t border-slate-700/20 pt-1.5">
              <p className="text-[10px] text-cyan-500/70 uppercase tracking-wide">Current Step</p>
              <p className="text-xs text-slate-400 mt-0.5">{summary.currentPlan.nextStep || 'Working...'}</p>
              {(summary.currentPlan.taskCount > 0 || summary.currentPlan.completedCount > 0) && (
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {summary.currentPlan.completedCount || 0}/{summary.currentPlan.taskCount || 0} steps done
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <ContextNotes instanceId={instanceId || ''} facts={facts || {}} onRefresh={onRefresh} />

      {!summary?.goalDescription && Object.keys(facts || {}).length === 0 && (
        <div className="py-6 text-center">
          <FiInbox className="mx-auto text-slate-700 mb-2" size={20} />
          <p className="text-xs text-slate-600">No context yet. Start a conversation to build context.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan tab — task plan list
// ---------------------------------------------------------------------------

function PlanTab({ tasks, summary, instanceId, onRefresh }: { tasks: AgentTask[]; summary?: any; instanceId?: string; onRefresh?: () => void }) {
  const statusIcon: Record<string, string> = {
    pending: '\u23F3',
    planned: '\u23F3',
    in_progress: '\u26A1',
    executing: '\u26A1',
    completed: '\u2705',
    failed: '\u274C',
    assigned: '\uD83D\uDC64',
    skipped: '\u23ED\uFE0F',
  };

  // Split into plan items vs tool-call execution log
  const planTasks = tasks.filter(t => t.taskType !== 'tool_call');
  const toolTasks = tasks.filter(t => t.taskType === 'tool_call');
  const [showToolLog, setShowToolLog] = useState(false);

  const completedCount = planTasks.filter(t => t.status === 'completed').length;

  return (
    <div className="space-y-3">
      {planTasks.length > 0 && (
        <div className="px-1 flex items-center justify-between">
          <p className="text-[10px] text-slate-500/70 uppercase tracking-wide font-medium">{planTasks.length} plan items</p>
          <p className="text-[10px] text-slate-600">{completedCount}/{planTasks.length} done</p>
        </div>
      )}

      {planTasks.length > 0 ? (
        <div className="space-y-1">
          {planTasks.map(task => (
            <TaskRow key={task.id} task={task} statusIcon={statusIcon} instanceId={instanceId} onDelete={onRefresh} />
          ))}
        </div>
      ) : (
        <div className="py-6 text-center">
          <FiFileText className="mx-auto text-slate-700 mb-2" size={20} />
          <p className="text-xs text-slate-600">No plan yet. The agent will create a plan as it works.</p>
        </div>
      )}

      {/* Tool execution log — collapsed by default, grouped */}
      {toolTasks.length > 0 && (
        <div className="pt-2 border-t border-slate-800/40">
          <button
            onClick={() => setShowToolLog(!showToolLog)}
            className="flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-wide font-medium text-slate-500 hover:text-slate-300"
          >
            <FiClock size={10} />
            Recent activity
            <span className="text-slate-600 normal-case">({toolTasks.length})</span>
            <FiChevronDown size={10} className={`transition-transform ${showToolLog ? '' : '-rotate-90'}`} />
          </button>
          {showToolLog && (
            <div className="space-y-0.5 mt-1">
              {toolTasks.slice(0, 50).map(task => (
                <ToolLogRow key={task.id} task={task} statusIcon={statusIcon} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact one-line row for tool execution log
function ToolLogRow({ task, statusIcon }: { task: AgentTask; statusIcon: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const icon = statusIcon[task.status] || '\u2B55';
  const runCount = task.actionInput?.runCount || 1;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left px-2 py-1 flex items-center gap-1.5 text-[11px] hover:bg-slate-800/30 rounded"
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="text-slate-400 truncate flex-1">{task.title}</span>
        {runCount > 1 && (
          <span className="text-[9px] text-slate-500 bg-slate-800 px-1 rounded flex-shrink-0">×{runCount}</span>
        )}
      </button>
      {open && <TaskDetailModal task={task} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tasks tab — input requests + actionable task items
// ---------------------------------------------------------------------------

function TasksTab({ tasks, summary, requests = [], instanceId, onRefresh, facts = {} }: { tasks: AgentTask[]; summary?: any; requests?: InputRequest[]; instanceId?: string; onRefresh?: () => void; facts?: Record<string, any> }) {
  const statusIcon: Record<string, string> = {
    pending: '\u23F3',
    executing: '\u26A1',
    completed: '\u2705',
    failed: '\u274C',
    assigned: '\uD83D\uDC64',
  };

  // Show only actionable tasks — assigned to user or needing input
  const actionableTasks = tasks.filter(t => t.assigneeType === 'user' || t.status === 'executing');

  return (
    <div className="space-y-3">
      {/* Pending requests from the agent */}
      {requests.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-amber-400/70 uppercase tracking-wide font-medium px-1">Needs Your Input</p>
          {requests.map(req => (
            <RequestCard key={req.id} request={req} />
          ))}
        </div>
      )}

      {/* Active/assigned tasks */}
      {actionableTasks.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500/70 uppercase tracking-wide font-medium px-1">Active</p>
          {actionableTasks.map(task => (
            <TaskRow key={task.id} task={task} statusIcon={statusIcon} instanceId={instanceId} onDelete={onRefresh} />
          ))}
        </div>
      )}

      {!requests.length && actionableTasks.length === 0 && (
        <div className="py-6 text-center">
          <FiCheckSquare className="mx-auto text-slate-700 mb-2" size={20} />
          <p className="text-xs text-slate-600">No action items. The agent is working autonomously.</p>
        </div>
      )}
    </div>
  );
}

// Short summary for the title bar — first line of description, or fallback
function getTaskSummary(task: AgentTask): string | null {
  if (!task.description) return null;
  // Strip markdown noise and grab first meaningful line
  const cleaned = task.description.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
  const firstLine = cleaned.split('\n').find(l => l.trim().length > 0) || '';
  return firstLine.slice(0, 80);
}

function TaskRow({ task, statusIcon, instanceId, onDelete }: { task: AgentTask; statusIcon: Record<string, string>; instanceId?: string; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const icon = statusIcon[task.status] || '\u2B55';
  const isActive = task.status === 'executing' || task.status === 'in_progress';
  const isDone = task.status === 'completed';
  const summary = getTaskSummary(task);
  const runCount = task.actionInput?.runCount || 1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full text-left rounded-lg border px-2.5 py-1.5 flex items-center gap-2 hover:border-slate-600 transition-colors ${
          isActive ? 'border-cyan-700/40 bg-cyan-950/10' :
          isDone ? 'border-emerald-800/20 bg-emerald-950/5' :
          'border-slate-700/30 bg-slate-800/20'
        }`}
      >
        <span className="text-xs flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-xs truncate ${isActive ? 'text-cyan-300' : isDone ? 'text-slate-500' : 'text-slate-300'}`}>
              {task.title}
            </p>
            {runCount > 1 && (
              <span className="text-[9px] text-slate-500 bg-slate-800 px-1 rounded flex-shrink-0">×{runCount}</span>
            )}
          </div>
          {summary && (
            <p className="text-[10px] text-slate-600 truncate mt-0.5">{summary}</p>
          )}
          {task.assigneeType === 'user' && (
            <span className="text-[10px] text-amber-400">Assigned to you</span>
          )}
        </div>
        <FiChevronRight size={12} className="text-slate-600 flex-shrink-0" />
      </button>
      {open && <TaskDetailModal task={task} onClose={() => setOpen(false)} instanceId={instanceId} onDelete={onDelete} />}
    </>
  );
}

// Modal that renders task details with markdown
function TaskDetailModal({ task, onClose, instanceId, onDelete }: { task: AgentTask; onClose: () => void; instanceId?: string; onDelete?: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const icon = ({ pending: '\u23F3', planned: '\u23F3', in_progress: '\u26A1', executing: '\u26A1', completed: '\u2705', failed: '\u274C', skipped: '\u23ED\uFE0F' } as Record<string, string>)[task.status] || '\u2B55';
  const runCount = task.actionInput?.runCount || 1;

  const handleDelete = async () => {
    if (!instanceId || deleting) return;
    setDeleting(true);
    await fetch(`/api/orgs/instances/${instanceId}/agent/tasks/${task.id}`, { method: 'DELETE' });
    setDeleting(false);
    onDelete?.();
    onClose();
  };

  const handleCancel = async () => {
    if (!instanceId || deleting) return;
    setDeleting(true);
    await fetch(`/api/orgs/instances/${instanceId}/agent/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'failed' }),
    });
    setDeleting(false);
    onDelete?.();
    onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={task.title}
      titleIcon={<span className="text-base">{icon}</span>}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide">
            Status: {task.status}
            {task.taskType && ` · ${task.taskType.replace('_', ' ')}`}
            {runCount > 1 && ` · ran ${runCount}\u00D7`}
          </span>
          <div className="flex items-center gap-2">
            {(task.status === 'pending' || task.status === 'planned' || task.status === 'in_progress') && (
              <button onClick={handleCancel} disabled={deleting}
                className="text-[11px] text-amber-400 hover:text-amber-300 disabled:opacity-50">
                Cancel
              </button>
            )}
            <button onClick={handleDelete} disabled={deleting}
              className="text-[11px] text-rose-400 hover:text-rose-300 disabled:opacity-50 flex items-center gap-1">
              <FiTrash2 size={10} /> Delete
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-slate-300">
        {task.description ? (
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-200 prose-p:text-slate-400 prose-strong:text-slate-200 prose-code:text-cyan-300 prose-code:bg-slate-900 prose-code:px-1 prose-code:rounded prose-li:text-slate-400">
            <ReactMarkdown>{task.description}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-slate-600 italic text-xs">No description</p>
        )}
        {task.actionInput && Object.keys(task.actionInput).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Input</summary>
            <pre className="mt-1 p-2 bg-slate-950 rounded text-[11px] text-slate-400 overflow-auto max-h-48">
              {JSON.stringify(task.actionInput, null, 2)}
            </pre>
          </details>
        )}
        {task.evidenceAttachments && task.evidenceAttachments.length > 0 && (
          <p className="text-emerald-400 text-xs">{task.evidenceAttachments.length} attachment(s)</p>
        )}
        {task.completedAt && (
          <p className="text-[10px] text-slate-600">Completed at {new Date(task.completedAt).toLocaleString()}</p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Requests tab (input requests from agent)
// ---------------------------------------------------------------------------

// Compact row — opens a modal for the actual form
function RequestCard({ request }: { request: InputRequest }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const typeIcon: Record<string, string> = {
    credentials: '\uD83D\uDD10',
    photos_and_details: '\uD83D\uDCF8',
    photos_and_info: '\uD83D\uDCF8',
    photos: '\uD83D\uDCF8',
    images: '\uD83D\uDCF8',
    file: '\uD83D\uDCC4',
    text: '\u270F\uFE0F',
    approval: '\u2705',
    choice: '\uD83D\uDCDD',
  };
  const icon = typeIcon[request.requestType] || '\uD83D\uDCAC';

  // Short summary: first line of description, or empty
  const summary = request.description
    ? request.description.replace(/\n+/g, ' ').trim().slice(0, 80)
    : null;

  if (submitted) {
    return (
      <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/15 px-2.5 py-1.5 flex items-center gap-2">
        <span className="text-xs">\u2705</span>
        <p className="text-xs text-emerald-400 flex-1 truncate">Submitted: {request.title}</p>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-lg border border-amber-700/30 bg-amber-950/15 hover:border-amber-600/50 px-2.5 py-1.5 flex items-center gap-2 transition-colors"
      >
        <span className="text-xs flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-amber-200 truncate font-medium">{request.title}</p>
          {summary && (
            <p className="text-[10px] text-slate-500 truncate">{summary}</p>
          )}
        </div>
        <FiChevronRight size={12} className="text-amber-700/60 flex-shrink-0" />
      </button>
      {open && (
        <RequestDetailModal
          request={request}
          icon={icon}
          onClose={() => setOpen(false)}
          onSubmitted={() => { setSubmitted(true); setOpen(false); }}
        />
      )}
    </>
  );
}

// Full form rendered inside a modal
function RequestDetailModal({
  request,
  icon,
  onClose,
  onSubmitted,
}: {
  request: InputRequest;
  icon: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleRespond = async (response: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await fetch(`/api/orgs/input-requests/${request.id}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmitForm = async () => {
    const response: Record<string, any> = { ...formValues };
    if (files.length > 0) {
      const fileData = [];
      for (const f of files) {
        const base64 = await fileToBase64(f);
        fileData.push({ name: f.name, data: base64, mimeType: f.type });
      }
      response.photos = fileData;
      response.files = fileData;
    }
    handleRespond(response);
  };

  // Build the form body based on requestType
  let body: React.ReactNode;
  let footer: React.ReactNode;

  // Playbook-violation card: an action was blocked because its connector
  // isn't bound to the active playbook. Three explicit choices.
  const isPlaybookViolation = request.requestType === 'approval' && request.schema?.kind === 'playbook_violation';
  if (isPlaybookViolation) {
    const bound = (request.schema?.boundConnectorInstanceNames as Array<{ id: string; name: string }>) || [];
    const blockedName =
      (request.schema?.blockedConnectorName as string | undefined) ||
      (request.schema?.blockedConnectorInstanceId as string | undefined) ||
      'unbound system';
    body = (
      <div className="space-y-3 text-sm text-slate-300">
        {request.description && (
          <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-400 prose-pre:text-xs">
            <ReactMarkdown>{request.description}</ReactMarkdown>
          </div>
        )}
        <div className="text-xs text-slate-400">
          The action wanted to use <span className="text-amber-300 font-medium">{blockedName}</span>, which is not bound to the active playbook.
        </div>
        {bound.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Pick a bound system instead:</div>
            {bound.map((b) => (
              <button
                key={b.id}
                onClick={() => handleRespond({ pick_bound: b.id })}
                disabled={submitting}
                className="block w-full text-left px-3 py-2 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-md border border-slate-700"
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
    footer = (
      <div className="flex gap-2 w-full">
        <button
          onClick={() => handleRespond({ cancel: true })}
          disabled={submitting}
          className="flex-1 px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-md"
        >
          Cancel
        </button>
        <button
          onClick={() => handleRespond({ approve_unbound: true })}
          disabled={submitting}
          className="flex-1 px-3 py-2 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-md"
          title="Run this action once with the unbound system. Recorded as an override."
        >
          Approve once
        </button>
      </div>
    );
  } else if (request.requestType === 'approval') {
    body = (
      <div className="text-sm text-slate-300">
        {request.description ? (
          <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-400">
            <ReactMarkdown>{request.description}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-slate-500 text-xs">No additional details</p>
        )}
      </div>
    );
    footer = (
      <div className="flex gap-2 w-full">
        <button onClick={() => handleRespond({ approved: false })} disabled={submitting}
          className="flex-1 px-3 py-2 text-xs bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white rounded-md">
          Decline
        </button>
        <button onClick={() => handleRespond({ approved: true })} disabled={submitting}
          className="flex-1 px-3 py-2 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-md">
          Approve
        </button>
      </div>
    );
  } else if (request.requestType === 'choice' && request.schema?.options) {
    body = (
      <div className="space-y-2">
        {request.description && (
          <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-400 mb-3">
            <ReactMarkdown>{request.description}</ReactMarkdown>
          </div>
        )}
        <div className="space-y-1">
          {(request.schema.options as string[]).map((opt: string) => (
            <button key={opt} onClick={() => handleRespond({ value: opt })} disabled={submitting}
              className="block w-full text-left px-3 py-2 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-md">
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (request.requestType === 'credentials') {
    const properties = request.schema?.properties || {};
    const propKeys = Object.keys(properties);
    body = (
      <div className="space-y-3">
        {request.description && (
          <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-400">
            <ReactMarkdown>{request.description}</ReactMarkdown>
          </div>
        )}
        {propKeys.map(key => {
          const prop = properties[key];
          const isSensitive = key.includes('token') || key.includes('secret') || key.includes('password') || key.includes('auth');
          return (
            <div key={key} className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">
                {prop.description || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                <span className="text-amber-500 ml-0.5">*</span>
              </label>
              <input
                type={isSensitive ? 'password' : 'text'}
                value={formValues[key] || ''}
                onChange={e => setFormValues(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={prop.description || key}
                autoComplete="off"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
            </div>
          );
        })}
        <p className="text-[10px] text-slate-600 text-center">{'\uD83D\uDD12'} Credentials are encrypted at rest</p>
      </div>
    );
    footer = (
      <button
        onClick={handleSubmitForm}
        disabled={submitting || propKeys.some(k => !formValues[k])}
        className="w-full px-3 py-2 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-md font-medium"
      >
        {submitting ? 'Saving securely...' : 'Save Credentials'}
      </button>
    );
  } else {
    // Generic schema-driven form (handles photos_and_details, photos_and_info, text, file, etc.)
    const properties = request.schema?.properties || {};
    const propKeys = Object.keys(properties);
    const hasFileField = propKeys.some(k => {
      const p = properties[k];
      return p?.type === 'array' || k === 'photos' || k === 'files' || k === 'images';
    }) || request.requestType === 'images' || request.requestType === 'file' || request.requestType === 'photos_and_details' || request.requestType === 'photos_and_info';

    body = (
      <div className="space-y-3">
        {request.description && (
          <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-400 prose-headings:text-slate-200 prose-strong:text-slate-200 prose-li:text-slate-400">
            <ReactMarkdown>{request.description}</ReactMarkdown>
          </div>
        )}

        {hasFileField && (
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">Photos / Files</label>
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
              className="block w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-slate-700 file:text-slate-300 hover:file:bg-slate-600"
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={i} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded flex items-center gap-1">
                    {f.name.length > 24 ? f.name.slice(0, 21) + '...' : f.name}
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-600 hover:text-white">&times;</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {propKeys
          .filter(k => {
            const p = properties[k];
            return p?.type === 'string' && k !== 'photos' && k !== 'files' && k !== 'images';
          })
          .map(key => {
            const prop = properties[key];
            const isRequired = request.schema?.required?.includes(key);
            return (
              <div key={key} className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">
                  {prop.description || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  {isRequired && <span className="text-amber-500 ml-0.5">*</span>}
                </label>
                <input
                  type={key.includes('password') || key.includes('secret') ? 'password' : 'text'}
                  value={formValues[key] || ''}
                  onChange={e => setFormValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={prop.description || key}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            );
          })}

        {/* Plain text-only requests (e.g. MFA code) */}
        {request.requestType === 'text' && propKeys.length === 0 && (
          <input
            type="text"
            value={formValues.value || ''}
            onChange={e => setFormValues({ value: e.target.value })}
            placeholder={(request.schema as any)?.placeholder || 'Type your response...'}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
            autoFocus
          />
        )}
      </div>
    );
    footer = (
      <button
        onClick={handleSubmitForm}
        disabled={submitting}
        className="w-full px-3 py-2 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-md font-medium"
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    );
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={request.title}
      titleIcon={<span className="text-base">{icon}</span>}
      size="lg"
      footer={footer}
    >
      {body}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Evidence tab
// ---------------------------------------------------------------------------

// Evidence source labels and icons
const sourceLabels: Record<string, { label: string; color: string }> = {
  'agent:conversation': { label: 'User Statement', color: 'text-blue-400' },
  'agent:tool': { label: 'Tool Result', color: 'text-cyan-400' },
  'agent:planner': { label: 'Agent Decision', color: 'text-fuchsia-400' },
  'user:upload': { label: 'User Upload', color: 'text-amber-400' },
  'system': { label: 'System', color: 'text-slate-400' },
};

const confirmationLabels: Record<string, { label: string; color: string }> = {
  'A': { label: 'Verified', color: 'text-emerald-400 bg-emerald-950/30 border-emerald-800/30' },
  'B': { label: 'Likely', color: 'text-sky-400 bg-sky-950/30 border-sky-800/30' },
  'C': { label: 'Unverified', color: 'text-slate-400 bg-slate-800/30 border-slate-700/30' },
};

function summarizeEvidence(ev: any): { title: string; detail?: string; icon: string } {
  const type = ev.eventType || '';
  const p = ev.payload || {};

  // User-provided information
  if (type === 'user.goal.confirmed') {
    return { title: 'Goal confirmed', detail: p.item ? `${p.item} — $${p.price?.toLocaleString()} in ${p.location}` : undefined, icon: '\uD83C\uDFAF' };
  }
  if (type.startsWith('user.location')) {
    return { title: type.includes('corrected') ? 'Location corrected' : 'Location provided', detail: p.location || p.county, icon: '\uD83D\uDCCD' };
  }
  if (type.startsWith('user.vehicle.color')) {
    return { title: 'Color corrected', detail: p.previousColor ? `${p.previousColor} \u2192 ${p.color}` : p.color, icon: '\uD83C\uDFA8' };
  }
  if (type.startsWith('user.vehicle.year')) {
    return { title: 'Year corrected', detail: p.previousYear ? `${p.previousYear} \u2192 ${p.year}` : `${p.year}`, icon: '\uD83D\uDCC5' };
  }
  if (type.startsWith('user.vehicle.mileage')) {
    return { title: 'Mileage corrected', detail: p.previousMileage ? `${p.previousMileage?.toLocaleString()} \u2192 ${p.mileage?.toLocaleString()} mi` : `${p.mileage?.toLocaleString()} mi`, icon: '\uD83D\uDEE3\uFE0F' };
  }
  if (type === 'user.service.history') {
    return { title: 'Service history', detail: p.hasServiceHistory ? 'Records available' : 'No records', icon: '\uD83D\uDD27' };
  }
  if (type.startsWith('user.')) {
    const field = type.replace('user.', '').replace(/\./g, ' ');
    const val = Object.values(p).filter(v => typeof v === 'string' || typeof v === 'number')[0];
    return { title: `User: ${field}`, detail: val ? String(val) : undefined, icon: '\uD83D\uDCDD' };
  }

  // Tool results
  if (type === 'tool.web_search') {
    return { title: 'Web search', detail: p.input?.query, icon: p.ok ? '\uD83D\uDD0D' : '\u274C' };
  }
  if (type === 'tool.web_fetch') {
    const url = p.input?.url;
    const domain = url ? new URL(url).hostname.replace('www.', '') : undefined;
    return { title: 'Fetched page', detail: domain || url, icon: p.ok ? '\uD83C\uDF10' : '\u274C' };
  }
  if (type === 'tool.browser') {
    return { title: 'Browser action', detail: p.ok ? 'Completed' : (p.error?.slice(0, 60) || 'Failed'), icon: p.ok ? '\uD83D\uDDA5\uFE0F' : '\u274C' };
  }
  if (type === 'tool.credential_store') {
    return { title: 'Credential requested', detail: p.input?.key ? `Service: ${p.input.key}` : undefined, icon: '\uD83D\uDD10' };
  }
  if (type === 'tool.code_execute') {
    return { title: 'Code executed', detail: p.ok ? 'Success' : 'Failed', icon: '\uD83D\uDCBB' };
  }
  if (type.startsWith('tool.')) {
    const toolName = type.replace('tool.', '');
    return { title: `Tool: ${toolName}`, detail: p.ok === false ? (p.error?.slice(0, 60) || 'Failed') : undefined, icon: p.ok === false ? '\u274C' : '\u2699\uFE0F' };
  }

  // Input requests
  if (type.startsWith('input.provided')) {
    return { title: 'Input provided', detail: type.replace('input.provided.', ''), icon: '\u2705' };
  }

  // Fallback
  return { title: type.replace(/\./g, ' '), detail: undefined, icon: '\uD83D\uDD35' };
}

function relTime(ts?: string) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function EvidenceTab({ instanceId }: { instanceId: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const LIMIT = 20;

  // Debounced search
  const searchTimeout = useRef<any>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    searchTimeout.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  // Fetch evidence
  useEffect(() => {
    if (!instanceId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (sourceFilter) params.set('source', sourceFilter);
    if (failedOnly) params.set('failed', 'true');
    params.set('limit', String(LIMIT));
    params.set('offset', String(offset));

    fetch(`/api/orgs/instances/${instanceId}/evidence?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setEvents(data?.events || []);
        setTotal(data?.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [instanceId, debouncedSearch, sourceFilter, failedOnly, offset]);

  // Reset offset when filters change
  useEffect(() => { setOffset(0); }, [debouncedSearch, sourceFilter, failedOnly]);

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search evidence..."
          className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setSourceFilter(sourceFilter === 'agent:conversation' ? '' : 'agent:conversation')}
          className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${sourceFilter === 'agent:conversation' ? 'border-blue-500/50 bg-blue-950/30 text-blue-400' : 'border-slate-700/30 text-slate-600 hover:text-slate-400'}`}>
          User
        </button>
        <button onClick={() => setSourceFilter(sourceFilter === 'agent:tool' ? '' : 'agent:tool')}
          className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${sourceFilter === 'agent:tool' ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-400' : 'border-slate-700/30 text-slate-600 hover:text-slate-400'}`}>
          Tools
        </button>
        <button onClick={() => setFailedOnly(!failedOnly)}
          className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${failedOnly ? 'border-rose-500/50 bg-rose-950/30 text-rose-400' : 'border-slate-700/30 text-slate-600 hover:text-slate-400'}`}>
          Failed
        </button>
        <span className="text-[9px] text-slate-600 ml-auto">{total} total</span>
      </div>

      {/* Loading */}
      {loading && <div className="py-4 text-center text-xs text-slate-600">Loading...</div>}

      {/* Empty */}
      {!loading && events.length === 0 && (
        <div className="py-6 text-center">
          <FiDatabase className="mx-auto text-slate-700 mb-2" size={20} />
          <p className="text-xs text-slate-600">{search ? 'No matching evidence' : 'No evidence captured yet'}</p>
        </div>
      )}

      {/* Event list */}
      {events.map((ev, i) => {
        const { title, detail, icon } = summarizeEvidence(ev);
        const src = sourceLabels[ev.source] || { label: ev.source || 'Unknown', color: 'text-slate-500' };
        const conf = confirmationLabels[ev.confirmationLevel] || confirmationLabels['C'];
        const isExpanded = expandedId === ev.id;
        const failed = ev.payload?.ok === false;

        return (
          <button
            key={ev.id || i}
            onClick={() => setExpandedId(isExpanded ? null : ev.id)}
            className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
              failed ? 'border-rose-800/30 bg-rose-950/10' : 'border-slate-700/30 bg-slate-800/20 hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-sm flex-shrink-0">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${failed ? 'text-rose-300' : 'text-slate-200'}`}>{title}</p>
                {detail && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{detail}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] ${src.color}`}>{src.label}</span>
                  <span className={`text-[9px] px-1.5 py-0 rounded-full border ${conf.color}`}>{conf.label}</span>
                  {ev.emittedAt && <span className="text-[9px] text-slate-600 ml-auto">{relTime(ev.emittedAt)}</span>}
                </div>
              </div>
            </div>
            {isExpanded && ev.payload && (
              <pre className="mt-2 text-[10px] text-slate-500 bg-slate-900/50 rounded p-2 overflow-auto max-h-32 border border-slate-700/20">
                {JSON.stringify(ev.payload, null, 2)}
              </pre>
            )}
          </button>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
            className="text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-30">
            {'← Prev'}
          </button>
          <span className="text-[9px] text-slate-600">{currentPage}/{totalPages}</span>
          <button onClick={() => setOffset(offset + LIMIT)} disabled={currentPage >= totalPages}
            className="text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-30">
            {'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace tab
// ---------------------------------------------------------------------------

interface FileEntry {
  name: string;
  sizeBytes: number;
  sizeKB: number;
  mimeType: string;
  isImage: boolean;
  modified: string;
  url: string;
}

function FilesTab({ instanceId, toolResultCount }: { instanceId: string; toolResultCount: number }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const handleDeleteFile = async (fileName: string) => {
    setDeletingFile(fileName);
    await fetch(`/api/orgs/instances/${instanceId}/files/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
    setFiles(prev => prev.filter(f => f.name !== fileName));
    if (previewFile?.name === fileName) setPreviewFile(null);
    setDeletingFile(null);
  };

  useEffect(() => {
    if (!instanceId) { setFiles([]); setLoading(false); return; }
    const load = () => {
      fetch(`/api/orgs/instances/${instanceId}/files`, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => setFiles(data?.files || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    // Refresh when tools complete (agent may have downloaded files)
  }, [instanceId, toolResultCount]);

  if (loading) {
    return <div className="py-8 text-center text-xs text-slate-600">Loading files...</div>;
  }

  if (files.length === 0) {
    return (
      <div className="py-8 text-center">
        <FiFile className="mx-auto text-slate-700 mb-2" size={20} />
        <p className="text-xs text-slate-600">No files yet.</p>
        <p className="text-[10px] text-slate-700 mt-1">The agent saves downloaded images, drafts, and documents here.</p>
      </div>
    );
  }

  const images = files.filter(f => f.isImage);
  const docs = files.filter(f => !f.isImage);

  const fileIcon = (f: FileEntry) => {
    if (f.isImage) return <FiImage size={14} className="text-fuchsia-400" />;
    if (f.mimeType === 'application/pdf') return <FiFileText size={14} className="text-rose-400" />;
    if (f.mimeType.startsWith('text/')) return <FiFileText size={14} className="text-cyan-400" />;
    return <FiFile size={14} className="text-slate-400" />;
  };

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-slate-500 px-1">
        {files.length} file{files.length !== 1 ? 's' : ''} — {images.length} image{images.length !== 1 ? 's' : ''}, {docs.length} document{docs.length !== 1 ? 's' : ''}
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-fuchsia-400/70 uppercase tracking-wide font-medium px-1">Images</p>
          <div className="grid grid-cols-2 gap-1.5">
            {images.map(f => (
              <div key={f.name} className="rounded-lg border border-slate-700/30 bg-slate-800/30 overflow-hidden hover:border-fuchsia-500/30 transition-colors relative group">
                <button onClick={() => setPreviewFile(previewFile?.name === f.name ? null : f)} className="w-full">
                  <img
                    src={`/api/orgs/instances/${instanceId}/files/${encodeURIComponent(f.name)}`}
                    alt={f.name}
                    className="w-full h-20 object-cover"
                    loading="lazy"
                  />
                </button>
                <div className="px-1.5 py-1 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[9px] text-slate-400 truncate">{f.name}</p>
                    <p className="text-[9px] text-slate-600">{f.sizeKB} KB</p>
                  </div>
                  <button
                    onClick={() => handleDeleteFile(f.name)}
                    disabled={deletingFile === f.name}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-rose-500 hover:text-rose-400 disabled:opacity-50 transition-opacity"
                    title="Delete"
                  >
                    <FiTrash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image preview */}
      {previewFile && previewFile.isImage && (
        <div className="rounded-lg border border-fuchsia-500/30 bg-slate-900/80 p-2">
          <img
            src={`/api/orgs/instances/${instanceId}/files/${encodeURIComponent(previewFile.name)}`}
            alt={previewFile.name}
            className="w-full rounded-md"
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-slate-400">{previewFile.name}</p>
            <a
              href={`/api/orgs/instances/${instanceId}/files/${encodeURIComponent(previewFile.name)}`}
              download={previewFile.name}
              className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1"
            >
              <FiDownload size={10} /> Download
            </a>
          </div>
        </div>
      )}

      {/* Documents */}
      {docs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-cyan-400/70 uppercase tracking-wide font-medium px-1">Documents</p>
          {docs.map(f => (
            <div key={f.name} className="flex items-center gap-2 rounded-lg border border-slate-700/30 bg-slate-800/20 px-2.5 py-2 hover:bg-slate-800/40 transition-colors group">
              {fileIcon(f)}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 truncate">{f.name}</p>
                <p className="text-[10px] text-slate-600">{f.sizeKB} KB</p>
              </div>
              <a href={`/api/orgs/instances/${instanceId}/files/${encodeURIComponent(f.name)}`} download={f.name}
                className="text-slate-600 hover:text-slate-400" title="Download">
                <FiDownload size={12} />
              </a>
              <button onClick={() => handleDeleteFile(f.name)} disabled={deletingFile === f.name}
                className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-400 disabled:opacity-50 transition-opacity" title="Delete">
                <FiTrash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools tab
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Context Notes — editable structured facts about the objective
// ---------------------------------------------------------------------------

function ContextNotes({ instanceId, facts, onRefresh }: { instanceId: string; facts: Record<string, any>; onRefresh?: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const entries = Object.entries(facts);

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim() || !instanceId) return;
    await fetch(`/api/orgs/instances/${instanceId}/facts/${encodeURIComponent(newKey.trim())}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: newValue.trim() }),
    });
    setNewKey('');
    setNewValue('');
    setShowAdd(false);
    onRefresh?.();
  };

  const handleUpdate = async (key: string) => {
    if (!editValue.trim() || !instanceId) return;
    await fetch(`/api/orgs/instances/${instanceId}/facts/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: editValue.trim() }),
    });
    setEditingKey(null);
    onRefresh?.();
  };

  const handleDelete = async (key: string) => {
    if (!instanceId) return;
    await fetch(`/api/orgs/instances/${instanceId}/facts/${encodeURIComponent(key)}`, { method: 'DELETE' });
    onRefresh?.();
  };

  const formatKey = (key: string) => key.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-emerald-400/70 uppercase tracking-wide font-medium">Context Notes</p>
        <button onClick={() => setShowAdd(!showAdd)} className="text-[10px] text-emerald-400 hover:text-emerald-300">
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Add new note */}
      {showAdd && (
        <div className="rounded-lg bg-emerald-950/10 border border-emerald-800/20 p-2 space-y-1.5">
          <input
            type="text"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="Key (e.g. color, year, model)"
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          />
          <input
            type="text"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Value"
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          />
          <button onClick={handleAdd} disabled={!newKey.trim() || !newValue.trim()}
            className="w-full px-2 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded">
            Save
          </button>
        </div>
      )}

      {/* Existing notes */}
      {entries.length === 0 && !showAdd && (
        <p className="text-[10px] text-slate-600 px-1">No notes yet. The agent adds them from conversation, or click "+ Add".</p>
      )}

      {entries.map(([key, fact]) => (
        <div key={key} className="rounded-lg bg-slate-800/20 border border-slate-700/30 px-2.5 py-1.5 group">
          {editingKey === key ? (
            <div className="space-y-1">
              <p className="text-[10px] text-slate-500">{formatKey(key)}</p>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdate(key); if (e.key === 'Escape') setEditingKey(null); }}
                  className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  autoFocus
                />
                <button onClick={() => handleUpdate(key)} className="text-[9px] text-emerald-400 hover:text-emerald-300">Save</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">{formatKey(key)}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button onClick={() => { setEditingKey(key); setEditValue(typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)); }}
                    className="text-[9px] text-slate-500 hover:text-slate-300">Edit</button>
                  <button onClick={() => handleDelete(key)}
                    className="text-[9px] text-rose-500 hover:text-rose-400"><FiTrash2 size={9} /></button>
                </div>
              </div>
              <p className="text-[11px] text-slate-200 mt-0.5">
                {typeof fact.value === 'object' ? JSON.stringify(fact.value) : String(fact.value)}
              </p>
              {fact.previousValues?.length > 0 && (
                <p className="text-[9px] text-slate-600 mt-0.5">
                  was: {String(fact.previousValues[fact.previousValues.length - 1].value)}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools tab
// ---------------------------------------------------------------------------

const BASE_TOOLS = [
  { name: 'web_search', description: 'Search the web for information', icon: '\uD83D\uDD0D' },
  { name: 'web_fetch', description: 'Fetch and extract text from a webpage', icon: '\uD83C\uDF10' },
  { name: 'smart_browse', description: 'AI-guided browser automation with human-like behavior', icon: '\uD83D\uDDA5\uFE0F' },
  { name: 'download_file', description: 'Download files from URLs with LLM verification', icon: '\u2B07\uFE0F' },
  { name: 'extract_image_urls', description: 'Deep image extraction from webpages', icon: '\uD83D\uDDBC\uFE0F' },
  { name: 'store_file', description: 'Read, write, and list files in the workspace', icon: '\uD83D\uDCBE' },
  { name: 'code_execute', description: 'Execute JavaScript code in a sandbox', icon: '\uD83D\uDCBB' },
  { name: 'credential_store', description: 'Encrypted credential management', icon: '\uD83D\uDD10' },
  { name: 'send_message', description: 'Send SMS, email, or webhook messages', icon: '\uD83D\uDCE8' },
  { name: 'search_evidence', description: 'Query collected evidence for this objective', icon: '\uD83D\uDD0E' },
  { name: 'image_process', description: 'Resize, compress, and get image metadata', icon: '\uD83D\uDDBC\uFE0F' },
  { name: 'local_filesystem', description: 'Access your local filesystem via lamdis-connect bridge', icon: '\uD83D\uDCBB' },
];

function ToolsTab({ tools }: { tools: any[] }) {
  const statusColors: Record<string, string> = {
    active: 'text-emerald-400',
    testing: 'text-amber-400',
    draft: 'text-slate-400',
    disabled: 'text-slate-600',
  };

  return (
    <div className="space-y-3">
      {/* Base tools — always available */}
      <div className="space-y-1">
        <p className="text-[10px] text-slate-500/70 uppercase tracking-wide font-medium px-1">Base Tools</p>
        {BASE_TOOLS.map(tool => (
          <div key={tool.name} className="rounded-lg bg-slate-800/20 border border-slate-700/20 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">{tool.icon}</span>
              <p className="text-xs text-slate-400">{tool.name}</p>
              <span className="text-[10px] text-emerald-500/60 ml-auto">active</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-0.5 pl-5">{tool.description}</p>
          </div>
        ))}
      </div>

      {/* Custom tools from DB */}
      {tools.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500/70 uppercase tracking-wide font-medium px-1">Custom Tools</p>
          {tools.map(tool => (
            <div key={tool.id} className="rounded-lg bg-slate-800/30 border border-slate-700/30 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-300">{tool.name || tool.toolId}</p>
                <span className={`text-[10px] ${statusColors[tool.status] || 'text-slate-500'}`}>{tool.status}</span>
              </div>
              {tool.description && (
                <p className="text-[10px] text-slate-600 mt-0.5 truncate">{tool.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
