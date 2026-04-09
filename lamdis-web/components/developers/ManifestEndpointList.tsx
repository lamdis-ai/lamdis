"use client";
import { useEffect, useState } from 'react';

interface Props { orgSlug?: string; className?: string; }

const endpoints = [
  { key: 'lamdis', label: 'Lamdis Manifest', file: 'lamdis.json' },
  { key: 'openapi', label: 'OpenAPI', file: 'openapi.json' },
  { key: 'mcp', label: 'MCP', file: 'mcp.json' },
  { key: 'a2a', label: 'A2A Agent Card', file: 'a2a.json' },
  { key: 'schemaorg', label: 'Schema.org JSON-LD', file: 'schemaorg.jsonld' }
];

export default function ManifestEndpointList({ orgSlug, className }: Props) {
  const [slug, setSlug] = useState<string | null>(orgSlug || null);
  const [origin, setOrigin] = useState<string>('');
  const [copyKey, setCopyKey] = useState<string | null>(null);
  const [activeSemver, setActiveSemver] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Keep local slug in sync with prop when it arrives asynchronously
  useEffect(()=>{
    if (orgSlug && orgSlug !== slug) setSlug(orgSlug);
  }, [orgSlug]);

  useEffect(()=>{
  // Always use public API host for manifest consumption
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.lamdis.ai').replace(/\/$/, '');
  setOrigin(apiBase);
  }, []);

  useEffect(()=>{
    if (slug || orgSlug) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) return;
        const data = await res.json();
        const s = data?.orgs?.[0]?.org?.slug || data?.orgs?.[0]?.org?.name?.toLowerCase()?.replace(/[^a-z0-9-]/g,'-');
        if (active && s) setSlug(s);
      } catch {}
    })();
    return ()=>{ active = false; };
  }, [slug, orgSlug]);

  // Load active manifest version for the current org; used to append ?v=semver
  useEffect(()=>{
    let mounted = true;
    (async()=>{
      try {
        setLoading(true);
        const r = await fetch('/api/orgs/manifest', { cache: 'no-store' });
        const j = await r.json();
        if (!mounted) return;
        setActiveSemver(j?.active ?? null);
      } catch {
        if (mounted) setActiveSemver(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return ()=>{ mounted = false; };
  }, []);

  function fullPath(f: string) {
    if (!slug) return `https://api.lamdis.ai/public/orgs/[slug]/manifests/${f}${activeSemver ? `?v=${activeSemver}` : ''}`;
    const base = origin || 'https://api.lamdis.ai';
    const v = activeSemver ? `?v=${activeSemver}` : '';
    return `${base}/public/orgs/${slug}/manifests/${f}${v}`;
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyKey(key);
      setTimeout(()=> setCopyKey(k => k === key ? null : k), 1600);
    } catch {}
  }

  if (loading) return <div className={className}><p className="text-sm text-slate-500">Loading endpoints…</p></div>;
  if (!activeSemver) {
    return (
      <div className={className}>
        <div className="rounded-md border border-amber-700/50 bg-amber-900/20 p-3 text-amber-200 text-sm">
          To view the manifests, you must first publish an Active version.
          <a href="/dashboard/manifests" className="ml-2 underline text-amber-100 hover:text-white">Manage versions →</a>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <ul className="mt-4 space-y-2 text-[13px] font-mono">
        {endpoints.map(e => {
          const p = fullPath(e.file);
          const copied = copyKey === e.key;
          const disabled = !slug || !activeSemver;
          return (
            <li key={e.key} className={`group relative flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${disabled ? 'border-slate-800/60 bg-slate-900/40 opacity-70' : 'border-slate-800/70 bg-slate-900/60 hover:border-fuchsia-500/40'}`}>
              <a href={!disabled ? p : undefined} target={!disabled ? '_blank' : undefined} className={`flex-1 truncate ${disabled ? 'text-slate-500' : 'text-slate-300 hover:text-fuchsia-300'}`} title={p} rel="noopener noreferrer">
                {p}
              </a>
              <button
                type="button"
                onClick={()=>!disabled && copy(p, e.key)}
                disabled={disabled}
                className={`text-[11px] px-2 py-1 rounded border ${disabled ? 'bg-slate-800/40 border-slate-700/40 text-slate-500 cursor-not-allowed' : 'bg-slate-800/70 hover:bg-slate-700/70 text-slate-300 border-slate-700/70 hover:border-fuchsia-500/40'}`}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-slate-500 leading-relaxed">These URLs include the active version (v={activeSemver}) for direct consumption by assistants and crawlers.</p>
    </div>
  );
}
