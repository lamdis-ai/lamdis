"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type SectionNavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  /** If true, treat the route as active when pathname starts with href */
  startsWith?: boolean;
};

export type SectionNavGroup = {
  label?: string;
  items: SectionNavItem[];
};

interface SectionNavProps {
  title: string;
  description?: string;
  groups: SectionNavGroup[];
}

export default function SectionNav({ title, description, groups }: SectionNavProps) {
  const pathname = usePathname();

  const isActive = (item: SectionNavItem) => {
    if (!pathname) return false;
    if (item.startsWith) return pathname === item.href || pathname.startsWith(item.href + '/');
    return pathname === item.href;
  };

  return (
    <aside className="h-full w-56 flex-shrink-0 border-r border-slate-800/70 bg-slate-950/40 sticky top-0">
      <div className="px-4 py-4 border-b border-slate-800/70">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {description && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{description}</p>}
      </div>
      <nav className="px-2 py-3 space-y-4 overflow-y-auto h-[calc(100%-4rem)]">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-2 mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      active
                        ? 'bg-slate-800/70 text-fuchsia-300 ring-1 ring-slate-700/70'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    {item.icon && <span className="text-[15px] opacity-80">{item.icon}</span>}
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
