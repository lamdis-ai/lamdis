"use client";
import { InputHTMLAttributes, forwardRef } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  inline?: boolean;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, inline=false, className='', ...props }, ref) {
  return (
    <label className={`group select-none ${inline? 'inline-flex items-center gap-2':'flex items-start gap-2'} text-sm cursor-pointer`}>
      <span className="relative inline-block h-4 w-4">
        <input
          ref={ref}
          type="checkbox"
          className={`peer absolute inset-0 h-4 w-4 rounded border border-slate-600/70 bg-slate-900/40 text-brand-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none transition-colors ${className}`}
          {...props}
        />
        {/* focus ring around box only */}
        <span className="pointer-events-none absolute inset-0 rounded -m-0.5 peer-focus:ring-2 peer-focus:ring-brand-500/30"/>
        {/* checkmark centered inside box */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 m-auto w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10.5 8.5 14 15 6"/></svg>
      </span>
      <span className={`mt-[1px] leading-snug ${inline? '':'flex flex-col'}`}>
        {label && <span className="text-slate-200 peer-disabled:text-slate-500 flex items-center gap-1">{label}</span>}
        {description && <span className="text-[11px] text-slate-500 peer-disabled:text-slate-600 mt-0.5">{description}</span>}
      </span>
    </label>
  );
});

export default Checkbox;
