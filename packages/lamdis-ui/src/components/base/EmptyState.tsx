import type { PropsWithChildren } from 'react';

export default function EmptyState({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <div className="text-slate-400 text-sm p-6 text-center border border-dashed border-slate-700 rounded">
      <div className="text-slate-200 mb-1">{title}</div>
      {children}
    </div>
  );
}
