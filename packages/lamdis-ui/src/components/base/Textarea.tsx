"use client";
import React from 'react';

const base = 'w-full rounded-md border border-slate-600/70 !bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean };

export const Textarea: React.FC<TextareaProps> = ({ className='', mono, ...rest }) => {
  return <textarea className={`${base} ${mono?'font-mono text-xs':''} ${className}`} {...rest} />;
};

export default Textarea;
