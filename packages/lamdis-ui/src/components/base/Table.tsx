"use client";
import type { ReactNode } from 'react';

type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

type TableProps<T> = {
  columns: Column<T>[];
  data: T[];
  empty?: ReactNode;
  rowClassName?: (row: T, index: number) => string | undefined;
  containerClassName?: string;
  tableClassName?: string;
  theadClassName?: string;
  tbodyClassName?: string;
  headerCellClassName?: string;
  cellClassName?: string;
  variant?: 'framed' | 'plain';
};

export default function Table<T extends Record<string, any>>({
  columns,
  data,
  empty,
  rowClassName,
  containerClassName,
  tableClassName,
  theadClassName,
  tbodyClassName,
  headerCellClassName,
  cellClassName,
  variant = 'framed',
}: TableProps<T>) {
  const framed = variant === 'framed';
  return (
    <div
      className={
        [
          'overflow-x-auto',
          framed ? 'border border-slate-700 rounded-xl overflow-hidden bg-slate-900/40' : '',
          containerClassName || '',
        ].filter(Boolean).join(' ')
      }
    >
      <table
        className={
          [
            'w-full text-sm text-left',
            framed ? '' : 'min-w-full text-slate-300',
            tableClassName || '',
          ].filter(Boolean).join(' ')
        }
      >
        <thead className={[framed ? 'bg-slate-800/50' : '', theadClassName || ''].filter(Boolean).join(' ')}>
          <tr>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                className={
                  [
                    framed
                      ? 'text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide'
                      : 'px-3 py-2 font-medium text-slate-400',
                    headerCellClassName || '',
                    c.className || '',
                  ].filter(Boolean).join(' ')
                }
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={[framed ? 'divide-y divide-slate-800' : '', tbodyClassName || ''].filter(Boolean).join(' ')}>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={
                  framed
                    ? 'px-4 py-10 text-center text-slate-500'
                    : 'px-3 py-6 text-center text-slate-500'
                }
              >
                {empty || 'No data'}
              </td>
            </tr>
          ) : (
            data.map((row, i) => {
              const extra = rowClassName ? rowClassName(row, i) : '';
              return (
                <tr
                  key={i}
                  className={
                    [
                      framed
                        ? 'hover:bg-slate-800/30 transition-colors'
                        : 'border-b border-slate-800 hover:bg-slate-800/40',
                      extra || '',
                    ].filter(Boolean).join(' ')
                  }
                >
                  {columns.map((c) => (
                    <td
                      key={String(c.key)}
                      className={
                        [
                          framed
                            ? 'px-4 py-3 align-top text-slate-200'
                            : 'px-3 py-2 align-top text-slate-200',
                          cellClassName || '',
                          c.className || '',
                        ].filter(Boolean).join(' ')
                      }
                    >
                      {c.render ? c.render(row) : String(row[c.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
