"use client";
export const dynamic = 'force-dynamic';
import React, { useEffect, useState } from 'react';
import IconRail from '@/components/layout/IconRail';
import CommunityBanner from '@/components/layout/CommunityBanner';
import { usePathname, useRouter } from 'next/navigation';
import { OrgProvider } from '@/lib/orgContext';
import { AuthProvider, useAuth, useLoginUrl } from '@/lib/authContext';

function AuthOverlay() {
  const router = useRouter();
  const { unauthorized, setUnauthorized } = useAuth();
  const loginUrl = useLoginUrl();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [hasOrg, setHasOrg] = useState<boolean | null>(null);

  useEffect(()=>{
    let active = true;
    (async()=>{
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        if (!active) return;
        if (!r.ok) {
          setAuthed(false);
          setHasOrg(false);
          if (r.status === 401) {
            setUnauthorized(true);
          }
        }
        else {
          const j = await r.json().catch(()=>({}));
          setAuthed(!!j?.user);
          setHasOrg(j?.orgs?.length > 0);
          if (j?.user) {
            setUnauthorized(false);
          }
        }
      } catch { setAuthed(false); setHasOrg(false); }
      finally { if (active) setChecking(false); }
    })();
    return ()=>{ active = false; };
  }, [setUnauthorized]);

  useEffect(() => {
    if (!checking && authed && hasOrg === false) {
      router.push('/join');
    }
  }, [checking, authed, hasOrg, router]);

  const showOverlay = (!checking && !authed) || unauthorized;

  if (!showOverlay) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-xl shadow-black/40">
        <h2 className="text-lg font-semibold text-slate-100">
          {unauthorized ? 'Session Expired' : 'Sign in required'}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {unauthorized
            ? 'Your session has expired. Please log in again to continue.'
            : 'You need to log in to access the dashboard.'}
        </p>
        <a
          href={loginUrl}
          className="mt-5 inline-flex w-full justify-center rounded-md bg-gradient-to-r from-fuchsia-500 via-fuchsia-400 to-sky-500 px-4 py-2.5 text-sm font-medium text-slate-900 shadow hover:brightness-110"
        >
          Log in
        </a>
        <a href="/" className="mt-3 inline-flex w-full justify-center rounded-md border border-slate-600/70 bg-slate-800/60 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-fuchsia-500/40 hover:text-slate-100">Back to home</a>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The Workspace renders full-bleed beside the rail (no centered max-width).
  // Section pages render their own internal sub-nav + content via their section layout.
  const isWorkspace = pathname === '/dashboard' || pathname === '/dashboard/';

  return (
    <AuthProvider>
      <OrgProvider>
        <CommunityBanner />
        <div className="flex h-[100dvh]">
          <IconRail />
          <main className="flex-1 overflow-hidden flex">
            {isWorkspace ? (
              <div className="flex-1 h-full min-w-0 overflow-hidden">{children}</div>
            ) : (
              <div className="flex-1 h-full overflow-hidden flex">{children}</div>
            )}
          </main>
        </div>
        <AuthOverlay />
      </OrgProvider>
    </AuthProvider>
  );
}
