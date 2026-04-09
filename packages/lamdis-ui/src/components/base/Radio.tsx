"use client";
import { InputHTMLAttributes, forwardRef } from 'react';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  inline?: boolean;
}

const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio({ label, description, inline=true, className='', ...props }, ref) {
  return (
    <label className={`group relative select-none ${inline? 'inline-flex items-center gap-2':'flex items-start gap-2'} text-sm cursor-pointer`}>
      <input
        ref={ref}
        type="radio"
        className={`peer h-4 w-4 rounded-full border border-slate-600/70 bg-slate-900/40 text-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed appearance-none grid place-content-center transition-colors ${className}`}
        {...props}
      />
      <span className="pointer-events-none absolute inset-0 rounded-full -m-0.5 peer-focus:ring-2 peer-focus:ring-brand-500/30"/>
      <span className={`mt-[1px] leading-snug ${inline? '':'flex flex-col'}`}>
        {label && <span className="text-slate-200 peer-disabled:text-slate-500 flex items-center gap-1">{label}</span>}
        {description && <span className="text-[11px] text-slate-500 peer-disabled:text-slate-600 mt-0.5">{description}</span>}
      </span>
      <span className="pointer-events-none absolute w-2.5 h-2.5 rounded-full bg-brand-500 left-[7px] top-[7px] opacity-0 peer-checked:opacity-100 transition-opacity"/>
    </label>
  );
});

export default Radio;
