"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useUser } from '@auth0/nextjs-auth0/client';
import { FiHome, FiBookOpen, FiActivity, FiLink, FiSettings, FiLogOut, FiDollarSign, FiClipboard, FiUsers } from 'react-icons/fi';
import OrgSelector from '@/components/base/OrgSelector';
import LicenseStatus from '@/components/layout/LicenseStatus';
import { useOrg } from '@/lib/orgContext';

type RailItem = {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Match this prefix as "active" (in addition to exact match) */
  matchPrefix?: string;
};

const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';

const RAIL_ITEMS: RailItem[] = [
  { id: 'workspace', label: 'Workspace', href: '/dashboard', icon: <FiHome size={20} /> },
  { id: 'playbooks', label: 'Playbooks', href: '/dashboard/playbooks', icon: <FiClipboard size={20} />, matchPrefix: '/dashboard/playbooks' },
  { id: 'library', label: 'Library', href: '/dashboard/library', icon: <FiBookOpen size={20} />, matchPrefix: '/dashboard/library' },
  { id: 'activity', label: 'Activity', href: '/dashboard/activity', icon: <FiActivity size={20} />, matchPrefix: '/dashboard/activity' },
  { id: 'connections', label: 'Connections', href: '/dashboard/connections', icon: <FiLink size={20} />, matchPrefix: '/dashboard/connections' },
  { id: 'people', label: 'People', href: '/dashboard/people', icon: <FiUsers size={20} />, matchPrefix: '/dashboard/people' },
  { id: 'usage', label: 'Usage', href: '/dashboard/usage', icon: <FiDollarSign size={20} />, matchPrefix: '/dashboard/usage' },
  { id: 'settings', label: 'Settings', href: '/dashboard/settings', icon: <FiSettings size={20} />, matchPrefix: '/dashboard/settings' },
];

function isActive(pathname: string | null, item: RailItem): boolean {
  if (!pathname) return false;
  if (item.id === 'workspace') {
    // Workspace is only active on the exact /dashboard route
    return pathname === '/dashboard' || pathname === '/dashboard/';
  }
  if (item.matchPrefix && pathname.startsWith(item.matchPrefix)) return true;
  return pathname === item.href;
}

function UserMenu() {
  const { user, isLoading } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (isLoading) {
    return <div className="w-9 h-9 rounded-full bg-slate-800/60 animate-pulse" />;
  }

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={user?.email || 'Account'}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center text-sm font-bold text-white hover:brightness-110 transition"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute bottom-full left-full ml-2 mb-0 w-72 rounded-lg border border-slate-700/70 bg-slate-900 shadow-xl z-50 p-3 space-y-3">
          {user && (
            <div className="px-1">
              <div className="text-sm text-slate-200 truncate">{user.name || user.email}</div>
              {user.email && user.name && (
                <div className="text-xs text-slate-500 truncate">{user.email}</div>
              )}
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 px-1 mb-1">Organization</div>
            <OrgSelector />
          </div>
          {isSelfHosted && (
            <div className="border-t border-slate-800/70 pt-2">
              <LicenseStatus />
            </div>
          )}
          <div className="border-t border-slate-800/70 pt-2 space-y-1">
            <Link
              href="/dashboard/settings/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800/70 rounded"
            >
              <FiSettings size={14} /> My Profile
            </Link>
            <a
              href="/api/auth/logout"
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800/70 rounded"
            >
              <FiLogOut size={14} /> Log out
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IconRail() {
  const pathname = usePathname();
  const { loading: orgLoading } = useOrg();

  return (
    <aside className="h-[100dvh] w-14 flex-shrink-0 border-r border-slate-800/70 bg-slate-950/80 backdrop-blur-xl sticky top-0 flex flex-col items-center py-3 gap-2">
      {/* Brand */}
      <Link href="/dashboard" className="block w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-800/40" aria-label="Lamdis home">
        <div className="relative h-7 w-7">
          <Image src="/lamdis_black.webp" alt="Lamdis" fill sizes="28px" className="object-contain invert brightness-0" />
        </div>
      </Link>

      <div className="w-8 h-px bg-slate-800/70 my-1" />

      {/* Rail items */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {RAIL_ITEMS.map(item => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className={`group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                active
                  ? 'bg-slate-800/80 text-fuchsia-300 ring-1 ring-slate-700/70'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              {item.icon}
              {/* tooltip */}
              <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-slate-900 border border-slate-700/70 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User menu at bottom */}
      <div className="mt-auto">
        {orgLoading ? <div className="w-9 h-9 rounded-full bg-slate-800/60 animate-pulse" /> : <UserMenu />}
      </div>
    </aside>
  );
}
