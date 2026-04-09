"use client";

import { type Product } from '@/lib/productContext';

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
        className={`${sizeClasses[size]} rounded-md font-medium transition-all bg-fuchsia-600/90 text-white shadow-lg shadow-fuchsia-900/30`}
      >
        Runs
      </button>
    </div>
  );
}

// Product switcher for the navigation (dropdown style)
export function ProductSwitcher({ product, onChange }: { product: Product; onChange: (product: Product) => void }) {
  return (
    <div className="relative group">
      <button className="flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/60 hover:border-slate-600/80 transition-all">
        <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
        <span className="capitalize">{product}</span>
      </button>
    </div>
  );
}
