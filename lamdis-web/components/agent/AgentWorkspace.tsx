"use client";
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import ObjectiveInbox from './ObjectiveInbox';
import AgentChat from './AgentChat';
import type { LiveActivity } from './AgentChat';
import ContextPanel from './ContextPanel';

const INBOX_WIDTH_KEY = 'lamdis.workspace.inboxWidth';
const INBOX_MIN = 220;
const INBOX_MAX = 480;

export default function AgentWorkspace() {
  const searchParams = useSearchParams();
  const initialId = searchParams?.get('id') || null;

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [summary, setSummary] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [liveActivity, setLiveActivity] = useState<LiveActivity[]>([]);
  const [isAgentWorking, setIsAgentWorking] = useState(false);

  // Persisted Inbox width (drag handle between Inbox and Chat)
  const [inboxWidth, setInboxWidth] = useState<number>(288); // matches old w-72
  const draggingInbox = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(INBOX_WIDTH_KEY);
      if (stored) {
        const n = parseInt(stored, 10);
        if (!Number.isNaN(n)) setInboxWidth(Math.max(INBOX_MIN, Math.min(INBOX_MAX, n)));
      }
    } catch {}
  }, []);

  const handleInboxDragStart = (e: React.MouseEvent) => {
    draggingInbox.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = inboxWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      if (!draggingInbox.current) return;
      const next = Math.max(INBOX_MIN, Math.min(INBOX_MAX, dragStartWidth.current + (ev.clientX - dragStartX.current)));
      setInboxWidth(next);
    };
    const onUp = () => {
      draggingInbox.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(INBOX_WIDTH_KEY, String(dragStartWidth.current + 0)); } catch {}
      // Persist current value
      try { localStorage.setItem(INBOX_WIDTH_KEY, String(inboxWidth)); } catch {}
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Persist when inboxWidth changes (covers drag end + any other update)
  useEffect(() => {
    try { localStorage.setItem(INBOX_WIDTH_KEY, String(inboxWidth)); } catch {}
  }, [inboxWidth]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setLiveActivity([]);
    const url = new URL(window.location.href);
    url.searchParams.set('id', id);
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleNewObjective = useCallback(async (goal: string, playbookId?: string | null): Promise<string | null> => {
    try {
      const res = await fetch('/api/orgs/quick-objective', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal, playbookId: playbookId || undefined }),
      });
      const data = await res.json();
      if (data?.instanceId) {
        handleSelect(data.instanceId);
        return data.instanceId;
      }
      return null;
    } catch {
      return null;
    }
  }, [handleSelect]);

  return (
    <div className="flex h-full w-full">
      <div style={{ width: inboxWidth }} className="flex-shrink-0 h-full">
        <ObjectiveInbox
          selectedId={selectedId}
          onSelect={handleSelect}
          onNewObjective={handleNewObjective}
        />
      </div>
      {/* Drag handle between Inbox and Chat */}
      <div
        onMouseDown={handleInboxDragStart}
        title="Drag to resize"
        className="w-1.5 cursor-col-resize hover:bg-fuchsia-500/20 active:bg-fuchsia-500/30 flex-shrink-0"
      />
      <AgentChat
        instanceId={selectedId}
        onSummaryChange={setSummary}
        onEvidenceChange={setEvidence}
        onActionItemsChange={setActionItems}
        onLiveActivityChange={setLiveActivity}
        onStreamingChange={setIsAgentWorking}
      />
      <ContextPanel
        instanceId={selectedId}
        summary={summary}
        evidence={evidence}
        actionItems={actionItems}
        liveActivity={liveActivity}
        isAgentWorking={isAgentWorking}
      />
    </div>
  );
}
