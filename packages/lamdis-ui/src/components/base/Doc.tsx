import { ReactNode } from 'react';

export function DocPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative max-w-4xl mx-auto">
      <div className="absolute -top-40 -left-40 w-72 h-72 bg-fuchsia-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-72 h-72 bg-sky-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="relative rounded-xl border border-slate-800/70 bg-slate-900/60 backdrop-blur px-8 py-10 shadow-lg">
        <h1 className="text-4xl font-semibold tracking-tight bg-gradient-to-br from-fuchsia-400 via-sky-300 to-fuchsia-200 bg-clip-text text-transparent mb-8">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function DocSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span className="inline-block w-1.5 h-5 bg-gradient-to-b from-fuchsia-500 to-sky-500 rounded-full" />
        {heading}
      </h2>
      <div className="space-y-4 text-slate-300 leading-relaxed text-[15px]">
        {children}
      </div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-slate-300">{children}</p>;
}
