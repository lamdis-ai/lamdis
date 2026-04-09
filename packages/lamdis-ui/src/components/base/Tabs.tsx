"use client";
import { ReactNode, useState } from 'react';

export type TabItem = { key: string; label: string; content: ReactNode };

type TabsProps = { items: TabItem[]; initialKey?: string; onChange?: (key: string)=>void; variant?: 'dark' | 'light' };

export default function Tabs({ items, initialKey, onChange, variant = 'dark' }: TabsProps) {
  const [active, setActive] = useState<string>(initialKey || (items[0]?.key ?? ''));
  const current = items.find(i => i.key === active) || items[0];
  function activate(k: string) { setActive(k); onChange?.(k); }
  return (
    <div className="w-full">
      <div className="tabs-bar scroll-dark">
        {items.map(i => {
          const isActive = active===i.key;
          // We no longer rely on global dark mode class; explicit variant drives colors.
          let stateClasses: string;
          if (variant === 'dark') {
            stateClasses = isActive
              ? 'font-semibold text-white'
              : 'font-medium text-white/70 hover:text-white';
          } else {
            stateClasses = isActive
              ? 'font-semibold text-slate-900'
              : 'font-medium text-slate-600 hover:text-slate-800';
          }
          return (
            <button
              key={i.key}
              type="button"
              aria-selected={isActive}
              className={`tab-btn ${stateClasses}`}
              onClick={()=>activate(i.key)}
            >
              {i.label}
              <span className={`tab-btn-indicator transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`}/>
            </button>
          );
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
