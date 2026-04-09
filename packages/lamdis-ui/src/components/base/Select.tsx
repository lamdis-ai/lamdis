"use client";
import React from 'react';

// Updated background + focus styles for better contrast of dropdown options.
// Use a near-true dark background and explicit option styling via global utility classes elsewhere.
const base = 'w-full rounded-md border border-slate-600/70 bg-slate-900 text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-400/40 disabled:opacity-50';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { sizeVariant?: 'sm' | 'md' | 'xs' };

export const Select: React.FC<SelectProps> = ({ className='', sizeVariant='md', ...rest }) => {
  const size = sizeVariant==='xs' ? 'px-1.5 py-1 text-xs' : sizeVariant==='sm' ? 'px-2 py-1.5 text-sm' : 'px-2.5 py-2 text-sm';
  return <select className={`${base} ${size} ${className}`} {...rest} />;
};

export default Select;
