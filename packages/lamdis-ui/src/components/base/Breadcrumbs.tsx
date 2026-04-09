import Link from 'next/link';
import React from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav className={`flex items-center text-xs ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center flex-wrap gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <svg
                  className="w-3 h-3 text-slate-600 mx-1.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-slate-400 hover:text-slate-200 transition-colors truncate max-w-[200px]"
                  title={item.label}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`truncate max-w-[200px] ${isLast ? 'text-slate-200' : 'text-slate-400'}`}
                  title={item.label}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
