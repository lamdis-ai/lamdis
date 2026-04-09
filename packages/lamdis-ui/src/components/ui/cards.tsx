import React from 'react';

export function Pane({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`group relative rounded-xl border border-slate-800/70 bg-gradient-to-br from-slate-900/70 to-slate-800/40 backdrop-blur-sm overflow-hidden ${className}`}>
      <div className="absolute inset-px rounded-[11px] opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-fuchsia-500/10 via-transparent to-sky-500/10" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, desc, gradient }: { label: string; value: React.ReactNode; desc?: string; gradient?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/40 backdrop-blur-sm p-5 flex flex-col justify-between">
      <div className={`absolute inset-px rounded-[15px] opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br ${gradient ?? 'from-fuchsia-500/20 to-sky-500/20'}`} />
      <div className="relative">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-2 text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-300 via-slate-200 to-sky-300 drop-shadow-[0_0_6px_rgba(236,72,153,0.25)]">{value}</div>
        {desc && <div className="mt-1 text-xs text-slate-400">{desc}</div>}
      </div>
    </div>
  );
}

export function IconCard({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="group relative rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900/70 to-slate-800/40 p-5 backdrop-blur-sm overflow-hidden">
      <div className="absolute inset-px rounded-[11px] bg-gradient-to-br from-fuchsia-500/10 via-slate-900/0 to-sky-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative flex items-start gap-4">
        <div className="mt-1 h-10 w-10 flex items-center justify-center rounded-lg bg-slate-800/70 ring-1 ring-slate-600/60 shadow-inner shadow-slate-900/40">
          <Icon className="text-xl text-fuchsia-300 drop-shadow-[0_0_6px_rgba(236,72,153,0.35)]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{desc}</p>
        </div>
      </div>
      <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-fuchsia-600/10 blur-2xl group-hover:bg-fuchsia-600/20 transition-colors" />
    </div>
  );
}
