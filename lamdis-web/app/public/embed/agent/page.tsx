"use client";
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatUI, { type ChatMessage } from '@/components/base/ChatUI';

export default function PublicEmbedAgentPage() {
  const qs = useSearchParams();
  const org = qs?.get('org') || '';
  const agent = qs?.get('agent') || '';
  const v = qs?.get('v') || '';
  const theme = (qs?.get('theme') || 'dark') as 'dark'|'light'|'auto';
  const debug = (qs?.get('debug') || '') === '1' || (qs?.get('debug') || '').toLowerCase() === 'true';

  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Note: This demo page uses the authenticated proxy; for real third-party embeds, serve from app base with CORS & an allowlist
  const send = async () => {
    const text = input.trim(); if (!text || !agent) return;
    setMsgs(cur => [...cur, { role:'user', content:text }]);
    setInput(''); setLoading(true);
    try {
      const r = await fetch(`/api/orgs/agents/${encodeURIComponent(agent)}/chat`, { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ message: text, version: v || undefined }) });
      const j = await r.json();
      if (r.ok) setMsgs(cur => [...cur, { role:'assistant', content: String(j.reply || '') }]);
      else setMsgs(cur => [...cur, { role:'assistant', content: `Error: ${j?.error || 'failed'}` }]);
    } catch (e:any) {
      setMsgs(cur => [...cur, { role:'assistant', content: `Error: ${e?.message || 'failed'}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${theme==='dark'?'bg-slate-950 text-slate-100':'bg-white text-slate-900'} min-h-screen p-4`}>
      <div className="max-w-xl mx-auto">
        {debug && (
          <div className="text-sm opacity-70">Org: {org || '—'} • Agent: {agent || '—'} • Version: {v || '—'}</div>
        )}
        <div className="mt-2">
          <ChatUI
            messages={msgs}
            loading={loading}
            input={input}
            onChange={setInput}
            onSend={send}
            disabled={loading || !agent}
            placeholder={agent?`Ask ${agent}`:'Select an agent'}
            variant={theme==='dark'?'dark':'light'}
          />
        </div>
      </div>
    </div>
  );
}
