"use client";

import { useEffect, useRef, useState } from 'react';
import ChatUI, { ChatMessage } from '@/components/base/ChatUI';
import { FiMessageCircle, FiX } from 'react-icons/fi';

export interface ChatWidgetProps {
  gatewayUrl?: string;
  toolsBaseUrl?: string;
  title?: string;
  description?: string;
  placeholder?: string;
  variant?: 'dark' | 'light';
}

export default function ChatWidget({ gatewayUrl, toolsBaseUrl, title = 'Lamdis Support', description = 'Ask about Lamdis and try our tools. This demo uses Lamdis MCP tools via our gateway to showcase what actions can do.', placeholder = 'Ask about Lamdis or try a tool…', variant = 'dark' }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const gw = (gatewayUrl || process.env.NEXT_PUBLIC_MCP_GATEWAY_URL || '').trim();
  const tb = (toolsBaseUrl || process.env.NEXT_PUBLIC_MCP_TOOLS_BASE || '').trim();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading, open]);

  const send = async () => {
    setError(null);
    const text = input.trim();
    if (!text) return;
    const history = messages.map(m => ({ role: m.role === 'thinking' ? 'assistant' : m.role, content: m.content }));
    setMessages([...messages, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
  const r = await fetch('/api/assist/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history, gatewayUrl: gw, toolsBaseUrl: tb || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Request failed');
      const reply = j?.reply || '[no reply]';
      setMessages(cur => [...cur, { role: 'assistant', content: String(reply) }]);
    } catch (e: any) {
      setError(e?.message || 'Failed to send');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {!open && (
        <button
          aria-label="Open chat"
          className="h-12 w-12 rounded-full shadow-lg bg-gradient-to-br from-fuchsia-600 to-sky-600 text-white flex items-center justify-center hover:brightness-110 border border-fuchsia-400/40"
          onClick={() => setOpen(true)}
        >
          <FiMessageCircle className="text-xl" />
        </button>
      )}
      {open && (
        <div className="w-[320px] sm:w-[360px] max-h-[70vh] flex flex-col rounded-xl border border-slate-800/70 bg-slate-950/80 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/70 bg-slate-900/70">
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <button onClick={() => setOpen(false)} className="ml-auto text-slate-400 hover:text-slate-200"><FiX /></button>
          </div>
          <div className="p-3 overflow-auto">
            {description && messages.length === 0 && !loading && (
              <div className="mb-2 text-[11px] text-slate-400">
                {description}
              </div>
            )}
            <ChatUI
              messages={messages}
              loading={loading}
              input={input}
              onChange={setInput}
              onSend={send}
              disabled={loading}
              placeholder={placeholder}
              className=""
              variant={variant}
            />
            {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}
            <div ref={endRef} />
          </div>
        </div>
      )}
    </div>
  );
}
