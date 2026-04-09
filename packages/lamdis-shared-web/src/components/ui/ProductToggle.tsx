"use client";

import { type Product } from '../../lib/productContext';

interface ProductToggleProps {
  product: Product;
  onChange: (product: Product) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function ProductToggle({ product, onChange, size = 'md', className = '' }: ProductToggleProps) {
  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-5 py-2.5',
  };

  return (
    <div className={`inline-flex items-center rounded-lg bg-slate-900/80 border border-slate-700/60 p-1 ${className}`}>
      <button
        onClick={() => onChange('runs')}
        className={`${sizeClasses[size]} rounded-md font-medium transition-all ${
          product === 'runs'
            ? 'bg-fuchsia-600/90 text-white shadow-lg shadow-fuchsia-900/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
        }`}
      >
        Runs
      </button>
      <button
        onClick={() => onChange('embodied')}
        className={`${sizeClasses[size]} rounded-md font-medium transition-all ${
          product === 'embodied'
            ? 'bg-cyan-600/90 text-white shadow-lg shadow-cyan-900/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
        }`}
      >
        Embodied
      </button>
    </div>
  );
}

// Product switcher for the navigation (dropdown style)
export function ProductSwitcher({ product, onChange }: { product: Product; onChange: (product: Product) => void }) {
  return (
    <div className="relative group">
      <button className="flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/60 hover:border-slate-600/80 transition-all">
        <span className={`h-2 w-2 rounded-full ${product === 'runs' ? 'bg-fuchsia-400' : 'bg-cyan-400'}`} />
        <span className="capitalize">{product}</span>
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="absolute left-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="bg-slate-900 border border-slate-700/60 rounded-lg shadow-xl py-1 min-w-[140px]">
          <button
            onClick={() => onChange('runs')}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-800/70 transition-colors ${
              product === 'runs' ? 'text-fuchsia-300' : 'text-slate-300'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
            Runs
            {product === 'runs' && <span className="ml-auto text-fuchsia-400">✓</span>}
          </button>
          <button
            onClick={() => onChange('embodied')}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-800/70 transition-colors ${
              product === 'embodied' ? 'text-cyan-300' : 'text-slate-300'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            Embodied
            {product === 'embodied' && <span className="ml-auto text-cyan-400">✓</span>}
          </button>
        </div>
      </div>
    </div>
  );
}