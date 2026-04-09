"use client";
import { useState } from 'react';

interface ManifestEndpointsProps {
  apiHost?: string; // full origin, e.g. https://api.lamdis.ai
  orgIdPlaceholder?: string; // placeholder token, default {orgId}
}

const FILES = [
  'lamdis.json',
  'openapi.json',
  'mcp.json',
  'schemaorg.jsonld'
];

export default function ManifestEndpoints({ apiHost, orgIdPlaceholder = '{orgId}' }: ManifestEndpointsProps) {
  const host = apiHost || (typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || window.location.origin) : '');
  const base = `${host.replace(/\/$/, '')}/public/orgs/${orgIdPlaceholder}/manifests`;
  return (
    <div className="space-y-2">
      {FILES.map(f => <EndpointRow key={f} url={`${base}/${f}`} />)}
      <p className="text-[11px] text-slate-500 mt-3">Replace {orgIdPlaceholder} with your actual organization id or slug. These endpoints are read-only and version/signature aware.</p>
    </div>
  );
}

function EndpointRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {/* ignore */}
  };
  return (
    <div className="group flex items-center gap-2">
      <input
        readOnly
        value={url}
        className="flex-1 rounded-md bg-slate-800/60 border border-slate-700/70 px-3 py-1.5 text-[11px] font-mono text-slate-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
      />
      <button
        type="button"
        onClick={copy}
        className="relative inline-flex items-center gap-1 rounded-md border border-slate-600/60 bg-slate-700/50 hover:border-fuchsia-500/50 hover:bg-slate-600/50 px-2 py-1 text-[11px] font-medium text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
        aria-label="Copy URL"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
