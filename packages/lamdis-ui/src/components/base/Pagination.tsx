"use client";
import React from 'react';
import Button from './Button';

export function usePagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
  const clampedPage = Math.min(Math.max(1, page), pages);
  const hasPrev = clampedPage > 1;
  const hasNext = clampedPage < pages;
  const from = (clampedPage - 1) * pageSize + 1;
  const to = Math.min(clampedPage * pageSize, total);
  return { pages, page: clampedPage, hasPrev, hasNext, from, to };
}

export default function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (next: number) => void }) {
  const { pages, hasPrev, hasNext, from, to } = usePagination({ page, pageSize, total });
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
      <div>
        {total > 0 ? (
          <span>Showing {from}-{to} of {total}</span>
        ) : (
          <span>No results</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={!hasPrev} onClick={() => hasPrev && onChange(page - 1)}>Prev</Button>
        <span className="text-slate-500">Page {page} / {pages}</span>
        <Button variant="outline" disabled={!hasNext} onClick={() => hasNext && onChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
