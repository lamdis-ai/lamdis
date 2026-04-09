import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type Variant = 'primary' | 'ghost' | 'gradient' | 'pattern' | 'ghostWhite' | 'neutral' | 'outline' | 'danger';

const base = 'btn';
// Monochrome styling: primary becomes dark neutral, gradient retained (for hero), others simplified.
const variantMap: Record<Variant,string> = {
  primary: 'bg-gradient-to-br from-fuchsia-600 to-sky-600 text-white shadow-elev-1 hover:shadow-elev-2',
  ghost: 'btn-ghost',
  gradient: 'btn-gradient',
  pattern: 'btn-ghost btn-pattern',
  ghostWhite: 'text-white/90 hover:text-white focus-visible:text-white bg-transparent hover:bg-white/10 focus-visible:bg-white/10',
  neutral: 'bg-slate-800/60 hover:bg-slate-800 text-slate-200 border border-slate-600/60 shadow-sm',
  outline: 'border border-slate-600/60 text-slate-300 hover:bg-slate-800/40 focus-visible:bg-slate-800/50 bg-transparent',
  danger: 'bg-rose-600/80 hover:bg-rose-600 text-white shadow-sm focus-visible:ring-2 focus-visible:ring-rose-400/50'
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; dataVariant?: string }
export default function Button({ className = '', children, disabled, variant = 'primary', dataVariant, ...props }: PropsWithChildren<BtnProps>) {
  const v = variantMap[variant];
  return (
    <button
  className={`${base} ${v} ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`.trim()}
      data-variant={dataVariant || variant}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
