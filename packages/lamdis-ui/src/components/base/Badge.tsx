"use client";
import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'info' | 'neutral' | 'danger';

const styles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/20 border-emerald-400/40 text-white',
  warning: 'bg-amber-500/25 border-amber-400/40 text-white',
  info: 'bg-sky-500/25 border-sky-400/40 text-white',
  neutral: 'bg-slate-700/60 border-slate-500/50 text-white',
  danger: 'bg-rose-600/30 border-rose-400/40 text-white'
};

export function Badge({ children, variant = 'neutral', className }: { children: React.ReactNode; variant?: BadgeVariant; className?: string }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide border backdrop-blur-sm';
  const classes = [base, styles[variant], className].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}

export default Badge;
