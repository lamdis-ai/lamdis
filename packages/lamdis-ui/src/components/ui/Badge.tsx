import React from 'react';

export default function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  const baseClass = "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-sm text-[11px] font-medium tracking-wide";
  const defaultClass = "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200";
  
  return (
    <div className={className ? `${baseClass} ${className}` : `${baseClass} ${defaultClass}`}>
      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-sky-400 animate-pulse" />
      {children}
    </div>
  );
}
