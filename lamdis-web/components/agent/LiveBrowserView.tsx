"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { FiPlay, FiPause, FiCornerDownLeft, FiCircle, FiSquare, FiSave } from 'react-icons/fi';

interface Props {
  instanceId: string | null;
  active: boolean;
}

const VIEWPORT_W = 1400;
const VIEWPORT_H = 900;

type Status = 'idle' | 'connecting' | 'streaming' | 'no_session' | 'error';

/**
 * Live browser view — streams JPEG frames from the agent's Playwright session
 * via WebSocket, allows clicking on the image to send mouse events back.
 */
export default function LiveBrowserView({ instanceId, active }: Props) {
  const [frame, setFrame] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [typeText, setTypeText] = useState('');
  const [recording, setRecording] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillIntent, setSkillIntent] = useState('');
  const [lastAction, setLastAction] = useState<string>('');
  const [savedToast, setSavedToast] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'stop' })); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
    setStatus('idle');
  }, []);

  const connect = useCallback(async () => {
    if (!instanceId) return;
    setStatus('connecting');
    try {
      const res = await fetch(`/api/orgs/instances/${instanceId}/browser-view/token`, { method: 'POST' });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const { wsUrl } = await res.json();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start' }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'frame') {
            setFrame(`data:image/jpeg;base64,${msg.data}`);
            setPageUrl(msg.url || '');
            setPageTitle(msg.title || '');
            setStatus('streaming');
          } else if (msg.type === 'no_session') {
            setStatus('no_session');
            setFrame(null);
          } else if (msg.type === 'error') {
            setStatus('error');
            if (msg.message) setSavedToast(msg.message);
          } else if (msg.type === 'ping') {
            try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
          } else if (msg.type === 'action_recorded') {
            // Backend is the source of truth for recording state + step count
            const txt = msg.element?.text || msg.element?.tag || `(${msg.x}, ${msg.y})`;
            setLastAction(`${msg.action}: ${txt}`);
            if (typeof msg.stepCount === 'number') setStepCount(msg.stepCount);
            if (typeof msg.recording === 'boolean') setRecording(msg.recording);
          } else if (msg.type === 'record_status') {
            setRecording(!!msg.recording);
            if (!msg.recording) setStepCount(0);
          } else if (msg.type === 'record_saved') {
            setRecording(false);
            setStepCount(0);
            setShowSaveDialog(false);
            setSkillName('');
            setSkillIntent('');
            setSavedToast(`Skill saved: "${msg.name}" (${msg.stepCount} steps for ${msg.domain})`);
            setTimeout(() => setSavedToast(''), 4000);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setStatus('idle');
      };

      ws.onerror = () => {
        setStatus('error');
      };
    } catch {
      setStatus('error');
    }
  }, [instanceId]);

  // Connect when panel becomes active, disconnect when it becomes inactive
  useEffect(() => {
    if (active && instanceId) {
      connect();
    } else {
      disconnect();
    }
    return () => { disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, instanceId]);

  const sendClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = VIEWPORT_W / rect.width;
    const scaleY = VIEWPORT_H / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    wsRef.current.send(JSON.stringify({ type: 'click', x, y }));
  };

  const sendType = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !typeText) return;
    wsRef.current.send(JSON.stringify({ type: 'type', text: typeText }));
    setTypeText('');
  };

  const sendKey = (key: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'key', key }));
  };

  const sendScroll = (e: React.WheelEvent<HTMLImageElement>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    e.preventDefault();
    wsRef.current.send(JSON.stringify({ type: 'scroll', deltaY: e.deltaY, deltaX: e.deltaX }));
  };

  const startRecording = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'record_start' }));
    setStepCount(0);
  };

  const stopRecording = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'record_stop' }));
  };

  const saveSkill = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!skillName.trim()) return;
    wsRef.current.send(JSON.stringify({
      type: 'record_save',
      name: skillName.trim(),
      intent: skillIntent.trim() || undefined,
    }));
  };

  const statusDotClass = {
    idle: 'bg-slate-600',
    connecting: 'bg-amber-500 animate-pulse',
    streaming: 'bg-emerald-500 animate-pulse',
    no_session: 'bg-slate-600',
    error: 'bg-rose-500',
  }[status];

  const statusLabel = {
    idle: 'Disconnected',
    connecting: 'Connecting...',
    streaming: 'Live',
    no_session: 'No active browser',
    error: 'Connection error',
  }[status];

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800 text-xs">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass}`} />
        <span className="text-slate-400 truncate flex-1" title={pageUrl}>
          {pageTitle || pageUrl || statusLabel}
        </span>
        <button
          onClick={status === 'streaming' || status === 'connecting' ? disconnect : connect}
          className="text-slate-500 hover:text-white p-0.5"
          title={status === 'streaming' ? 'Pause stream' : 'Resume stream'}
        >
          {status === 'streaming' || status === 'connecting' ? <FiPause size={12} /> : <FiPlay size={12} />}
        </button>
      </div>

      {/* Recording controls */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-800 text-[11px] bg-slate-900/40">
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={status !== 'streaming'}
            className="flex items-center gap-1 px-2 py-1 rounded bg-rose-700/30 hover:bg-rose-700/50 text-rose-200 disabled:opacity-50"
            title="Record your actions to teach the agent"
          >
            <FiCircle size={10} className="text-rose-400" /> Record
          </button>
        ) : (
          <>
            <button
              onClick={stopRecording}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
            >
              <FiSquare size={10} /> Stop
            </button>
            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={stepCount === 0}
              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white"
            >
              <FiSave size={10} /> Save Skill
            </button>
            <span className="flex items-center gap-1 text-rose-300">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              REC · {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {lastAction && (
          <span className="text-slate-500 truncate ml-auto" title={lastAction}>
            {lastAction}
          </span>
        )}
      </div>

      {savedToast && (
        <div className="px-2 py-1 text-[11px] bg-emerald-900/40 text-emerald-200 border-b border-emerald-800">
          {savedToast}
        </div>
      )}

      {/* Save skill dialog */}
      {showSaveDialog && (
        <div className="px-3 py-2 border-b border-slate-700 bg-slate-900 space-y-2">
          <div className="text-[11px] text-slate-300 font-medium">Save this {stepCount}-step procedure as a skill</div>
          <input
            type="text"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            placeholder="Skill name (e.g. 'Choose for sale by owner')"
            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
            autoFocus
          />
          <input
            type="text"
            value={skillIntent}
            onChange={(e) => setSkillIntent(e.target.value)}
            placeholder="What this accomplishes (optional)"
            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
          />
          <div className="flex gap-1">
            <button
              onClick={saveSkill}
              disabled={!skillName.trim()}
              className="px-2 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Frame area */}
      <div className="flex-1 overflow-auto bg-black flex items-center justify-center p-2">
        {frame ? (
          <img
            ref={imgRef}
            src={frame}
            alt="Live browser"
            onClick={sendClick}
            onWheel={sendScroll}
            draggable={false}
            className="max-w-full max-h-full cursor-crosshair border border-slate-800 select-none"
            style={{ aspectRatio: `${VIEWPORT_W}/${VIEWPORT_H}` }}
          />
        ) : (
          <div className="text-xs text-slate-600 text-center px-4">
            {status === 'no_session' && (
              <>
                <div className="text-slate-500 mb-1">No active browser session</div>
                <div className="text-slate-700">The browser will appear when the agent runs smart_browse.</div>
              </>
            )}
            {status === 'connecting' && 'Connecting...'}
            {status === 'idle' && 'Disconnected'}
            {status === 'error' && 'Connection error — try toggling the tab'}
          </div>
        )}
      </div>

      {/* Type input */}
      <div className="border-t border-slate-800 p-2 flex gap-1">
        <input
          type="text"
          value={typeText}
          onChange={(e) => setTypeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendType();
            }
          }}
          placeholder="Type into focused field..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
          disabled={status !== 'streaming'}
        />
        <button
          onClick={sendType}
          disabled={status !== 'streaming' || !typeText}
          className="px-2 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded"
        >
          Type
        </button>
        <button
          onClick={() => sendKey('Enter')}
          disabled={status !== 'streaming'}
          className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded"
          title="Send Enter key"
        >
          <FiCornerDownLeft size={12} />
        </button>
      </div>
    </div>
  );
}
