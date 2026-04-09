"use client";
import React from 'react';

const base = 'w-full rounded-md border border-slate-600/70 !bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 autofill:!bg-slate-900/80 [&:-webkit-autofill]:!bg-slate-900/80 [&:-webkit-autofill]:[-webkit-text-fill-color:#f1f5f9] [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s]';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { sizeVariant?: 'sm' | 'md' | 'xs'; mono?: boolean };

export const Input: React.FC<InputProps> = ({ className = '', sizeVariant='md', mono, ...rest }) => {
  const size = sizeVariant==='xs' ? 'px-2 py-1 text-xs' : sizeVariant==='sm' ? 'px-2 py-1.5 text-sm' : 'px-3 py-2';
  const font = mono ? 'font-mono' : '';
  return <input className={`${base} ${size} ${font} ${className}`} {...rest} />;
};

export default Input;
