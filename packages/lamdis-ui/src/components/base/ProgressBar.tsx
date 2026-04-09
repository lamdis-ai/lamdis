"use client";
import React from 'react';

export default function ProgressBar({ value, max, label, variant = 'default' }: { value: number; max: number; label?: string; variant?: 'default'|'success'|'warning'|'danger'; }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  const color = variant === 'success' ? 'from-emerald-500 to-emerald-400'
    : variant === 'warning' ? 'from-amber-500 to-amber-400'
    : variant === 'danger' ? 'from-rose-500 to-rose-400'
    : 'from-fuchsia-500 to-sky-500';
  return (
    <div className="w-full">
      {label && <div className="mb-1 text-xs text-slate-300">{label}</div>}
      <div className="h-2.5 w-full rounded-full bg-slate-800/80 overflow-hidden ring-1 ring-slate-700/60">
        <div
          className={`h-full bg-gradient-to-r ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{value.toLocaleString()} / {max.toLocaleString()} ({pct}%)</div>
    </div>
  );
}
