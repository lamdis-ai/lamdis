"use client";
import { useState, useRef, useEffect } from 'react';
import { useOrg } from '@/lib/orgContext';
import { useRouter } from 'next/navigation';

interface OrgSelectorProps {
  className?: string;
}

export default function OrgSelector({ className = '' }: OrgSelectorProps) {
  const { orgs, currentOrg, setCurrentOrgId, loading } = useOrg();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (loading) {
    return (
      <div className={`h-9 w-40 bg-slate-800/50 rounded-md animate-pulse ${className}`} />
    );
  }

  if (orgs.length === 0) {
    return (
      <button
        onClick={() => router.push('/join')}
        className={`flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800/70 border border-slate-700/70 text-sm text-slate-300 hover:border-fuchsia-500/40 transition-colors ${className}`}
      >
        <span className="text-fuchsia-400">+</span>
        <span>Create Organization</span>
      </button>
    );
  }

  // Single org - no dropdown needed
  if (orgs.length === 1) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800/70 border border-slate-700/70 text-sm ${className}`}>
        <div className="w-6 h-6 rounded bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-xs font-bold text-white">
          {currentOrg?.org?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <span className="text-slate-200 truncate max-w-[120px]">{currentOrg?.org?.name}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800/70 border border-slate-700/70 text-sm hover:border-fuchsia-500/40 transition-colors w-full"
      >
        <div className="w-6 h-6 rounded bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-xs font-bold text-white">
          {currentOrg?.org?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <span className="text-slate-200 truncate flex-1 text-left max-w-[120px]">{currentOrg?.org?.name}</span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700/70 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-800/70">
            <div className="text-xs text-slate-500 uppercase tracking-wide px-2 py-1">Organizations</div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {orgs.map(org => (
              <button
                key={org.orgId}
                onClick={() => {
                  setCurrentOrgId(org.orgId);
                  setOpen(false);
                  router.refresh();
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-800/70 transition-colors ${
                  org.orgId === currentOrg?.orgId ? 'bg-slate-800/50' : ''
                }`}
              >
                <div className="w-8 h-8 rounded bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {org.org?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">{org.org?.name}</div>
                  <div className="text-xs text-slate-500 capitalize">{org.role}</div>
                </div>
                {org.orgId === currentOrg?.orgId && (
                  <svg className="w-4 h-4 text-fuchsia-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-slate-800/70">
            <button
              onClick={() => {
                setOpen(false);
                router.push('/join');
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 rounded transition-colors"
            >
              <span className="text-fuchsia-400">+</span>
              <span>Create New Organization</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
