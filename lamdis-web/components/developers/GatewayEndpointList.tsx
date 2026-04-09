"use client";
import { useEffect, useMemo, useState } from 'react';

interface Props { orgSlug?: string; className?: string }

type ActiveInfo = { active?: string | null };

export default function GatewayEndpointList({ orgSlug, className }: Props) {
  const [slug, setSlug] = useState<string | null>(orgSlug || null);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // resolve slug from /api/me if not provided
  useEffect(()=>{
    if (orgSlug) return;
    let mounted = true;
    (async()=>{
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j = await r.json();
        const s = j?.orgs?.[0]?.org?.slug || null;
        if (mounted) setSlug(s);
      } catch {}
    })();
    return ()=>{ mounted = false; };
  }, [orgSlug]);

  // fetch active version
  useEffect(()=>{
    let mounted = true;
    (async()=>{
      try {
        setLoading(true);
        const r = await fetch('/api/orgs/manifest', { cache: 'no-store' });
        const j: ActiveInfo = await r.json();
        if (mounted) setActive(j?.active ?? null);
      } catch {
        if (mounted) setActive(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return ()=>{ mounted = false; };
  }, []);

  const gateway = useMemo(()=> (process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.lamdis.ai').replace(/\/$/, ''), []);
  const wsGateway = useMemo(()=> gateway.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'), [gateway]);

  const endpoints = useMemo(()=>{
    const v = active ? `?v=${active}` : '';
    const s = slug || '[org]';
    return [
      {
        key: 'a2a',
        label: 'A2A JSON-RPC (HTTP)',
        method: 'POST',
        url: `${gateway}/a2a/${s}/v1${v}`,
        desc: 'Send JSON-RPC 2.0 requests with method "message/send"; include Authorization if required by the action.'
      },
      {
        key: 'a2a-sse',
        label: 'A2A Task Stream (SSE)',
        method: 'SSE',
        url: `${gateway}/a2a/${s}/v1/message/stream${v}`,
        desc: 'Server-Sent Events stream for task updates. POST JSON body { taskId } and read event-stream.'
      },
      {
        key: 'mcp-http',
        label: 'MCP Tools (HTTP/S)',
        method: 'HTTP',
        url: `${gateway}/mcp/${s}${v}`,
        desc: 'Use with OpenAI Responses API (type: "mcp"). Server auto-discovers tools and supports list/call.'
      },
      {
        key: 'mcp-ws',
        label: 'MCP Tools (WebSocket)',
        method: 'WS',
        url: `${wsGateway}/mcp/${s}/ws${v}`,
        desc: 'Connect via WebSocket to list and call tools from the active manifest.'
      }
    ];
  }, [gateway, wsGateway, slug, active]);

  if (loading) return <div className={className}><p className="text-sm text-slate-500">Loading gateway endpoints…</p></div>;

  if (!active) {
    return (
      <div className={className}>
        <div className="rounded-md border border-amber-700/50 bg-amber-900/20 p-3 text-amber-200 text-sm">
          To use hosted gateways, publish an Active manifest version first.
          <a href="/dashboard/manifests" className="ml-2 underline text-amber-100 hover:text-white">Manage versions →</a>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <ul className="mt-4 space-y-3">
        {endpoints.map(e => (
          <li key={e.key} className="group relative rounded-md border border-slate-800/70 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-400">{e.label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800/70 border border-slate-700/60 text-slate-300">{e.method}</span>
                  <span className="truncate font-mono text-[12px] text-slate-200" title={e.url}>{e.url}</span>
                </div>
              </div>
              <CopyButton text={e.url} />
            </div>
            {e.desc && <p className="mt-2 text-[11px] text-slate-400">{e.desc}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-500">Gateways resolve the organization from the URL and operate against the Active manifest version (v={active}).</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(()=>setCopied(false), 1500);
    } catch {}
  }
  return (
    <button onClick={copy} className="text-[11px] px-2 py-1 rounded border bg-slate-800/70 hover:bg-slate-700/70 text-slate-300 border-slate-700/70 hover:border-fuchsia-500/40">{copied ? 'Copied' : 'Copy'}</button>
  );
}
