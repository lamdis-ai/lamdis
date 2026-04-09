"use client";
import { useState, useEffect, useRef } from 'react';
import { FiPlus, FiSearch, FiMessageSquare } from 'react-icons/fi';

interface ObjectiveInstance {
  id: string;
  outcomeTypeId: string;
  label?: string;
  status: string;
  agentEnabled?: boolean;
  agentStatus?: string;
  goalDescription?: string;
  confidenceScore?: number;
  updatedAt?: string;
  outcomeType?: { name: string };
}

const statusDot: Record<string, string> = {
  executing: 'bg-cyan-400 animate-pulse',
  planning: 'bg-blue-400 animate-pulse',
  waiting_input: 'bg-amber-400 animate-pulse',
  paused: 'bg-slate-400',
  completed: 'bg-emerald-400',
  failed: 'bg-rose-400',
};

interface ActivePlaybook {
  id: string;
  name: string;
  status: string;
  outcomeTypeId: string;
}

interface ObjectiveInboxProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewObjective: (goal: string, playbookId?: string | null) => Promise<string | null>;
}

export default function ObjectiveInbox({ selectedId, onSelect, onNewObjective }: ObjectiveInboxProps) {
  const [instances, setInstances] = useState<ObjectiveInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newGoal, setNewGoal] = useState('');
  const [newPlaybookId, setNewPlaybookId] = useState<string>('');
  const [activePlaybooks, setActivePlaybooks] = useState<ActivePlaybook[]>([]);
  const [creating, setCreating] = useState(false);
  const newInputRef = useRef<HTMLTextAreaElement>(null);

  // Load active playbooks for the picker
  useEffect(() => {
    fetch('/api/orgs/playbooks?status=active', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.playbooks) setActivePlaybooks(j.playbooks);
      })
      .catch(() => {});
  }, [showNew]);

  const loadInstances = async () => {
    try {
      const r = await fetch('/api/orgs/outcome-instances?limit=100', { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        const list = Array.isArray(data) ? data : data?.instances || data?.items || [];
        // Sort: active/executing first, then by updatedAt desc
        list.sort((a: ObjectiveInstance, b: ObjectiveInstance) => {
          const aActive = ['executing', 'planning', 'waiting_input'].includes(a.agentStatus || '');
          const bActive = ['executing', 'planning', 'waiting_input'].includes(b.agentStatus || '');
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        });
        setInstances(list);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadInstances(); }, []);
  useEffect(() => {
    const interval = setInterval(loadInstances, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showNew) newInputRef.current?.focus();
  }, [showNew]);

  const handleCreate = async () => {
    if (!newGoal.trim() || creating) return;
    setCreating(true);
    const id = await onNewObjective(newGoal.trim(), newPlaybookId || null);
    if (id) {
      setNewGoal('');
      setNewPlaybookId('');
      setShowNew(false);
      await loadInstances();
    }
    setCreating(false);
  };

  const filtered = instances.filter(inst => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (inst.label || '').toLowerCase().includes(s) ||
      (inst.goalDescription || '').toLowerCase().includes(s) ||
      (inst.outcomeType?.name || '').toLowerCase().includes(s);
  });

  const relTime = (ts?: string) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <aside className="h-full w-full border-r border-slate-800/70 bg-slate-950/80 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-slate-800/70 px-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Objectives</h2>
        <button
          onClick={() => setShowNew(true)}
          className="p-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition-colors"
          title="New objective"
        >
          <FiPlus size={16} />
        </button>
      </div>

      {/* New objective input */}
      {showNew && (
        <div className="px-3 py-3 border-b border-slate-800/70 bg-slate-900/50 space-y-2">
          <textarea
            ref={newInputRef}
            value={newGoal}
            onChange={e => setNewGoal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreate(); }
              if (e.key === 'Escape') { setShowNew(false); setNewGoal(''); setNewPlaybookId(''); }
            }}
            placeholder="What do you want to accomplish?"
            rows={3}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-fuchsia-500"
          />
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
              Playbook (optional)
            </label>
            <select
              value={newPlaybookId}
              onChange={e => setNewPlaybookId(e.target.value)}
              className="w-full mt-0.5 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500"
            >
              <option value="">No playbook — agent runs unconstrained</option>
              {activePlaybooks.map(pb => (
                <option key={pb.id} value={pb.id}>{pb.name}</option>
              ))}
            </select>
            {activePlaybooks.length === 0 && (
              <p className="text-[10px] text-slate-600 mt-1">
                No active playbooks yet. <a href="/dashboard/playbooks/new" className="text-fuchsia-400 hover:text-fuchsia-300">Create one →</a>
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setShowNew(false); setNewGoal(''); setNewPlaybookId(''); }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newGoal.trim()}
              className="px-3 py-1.5 text-xs bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {creating ? 'Starting...' : 'Start Agent'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search objectives..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600"
          />
        </div>
      </div>

      {/* Instance list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {loading && (
          <div className="px-2 py-8 text-center text-xs text-slate-600">Loading...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-2 py-8 text-center">
            <FiMessageSquare className="mx-auto text-slate-700 mb-2" size={24} />
            <p className="text-xs text-slate-600">No objectives yet</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-2 text-xs text-fuchsia-400 hover:text-fuchsia-300"
            >
              Create your first objective
            </button>
          </div>
        )}
        {filtered.map(inst => {
          const isSelected = inst.id === selectedId;
          const dot = statusDot[inst.agentStatus || ''] || 'bg-slate-600';
          const name = inst.label || inst.goalDescription || inst.outcomeType?.name || 'Untitled';
          return (
            <button
              key={inst.id}
              onClick={() => onSelect(inst.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                isSelected
                  ? 'bg-slate-800/80 ring-1 ring-slate-700/70'
                  : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isSelected ? 'text-white font-medium' : 'text-slate-300'}`}>
                    {name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500 capitalize">
                      {inst.agentStatus?.replace('_', ' ') || inst.status || 'idle'}
                    </span>
                    {inst.confidenceScore != null && inst.confidenceScore > 0 && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {Math.round(inst.confidenceScore * 100)}%
                      </span>
                    )}
                    {inst.updatedAt && (
                      <span className="text-[10px] text-slate-600 ml-auto">
                        {relTime(inst.updatedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

    </aside>
  );
}
