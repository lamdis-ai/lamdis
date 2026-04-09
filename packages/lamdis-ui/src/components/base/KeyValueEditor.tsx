"use client";
import { useState, useEffect } from 'react';

type Row = { key: string; value: string };

export default function KeyValueEditor({ value, onChange, allowEmpty = false, placeholderKey = 'Key', placeholderValue = 'Value', variant = 'dark' }: {
  value?: Record<string, string> | null;
  onChange: (obj: Record<string, string>) => void;
  allowEmpty?: boolean;
  placeholderKey?: string;
  placeholderValue?: string;
  variant?: 'dark' | 'light';
}) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const obj = value || {};
    const next: Row[] = Object.keys(obj).map(k => ({ key: k, value: String(obj[k] ?? '') }));
    if (next.length === 0 && allowEmpty) next.push({ key: '', value: '' });
    setRows(next);
  }, [value, allowEmpty]);

  function pushChange(next: Row[]) {
    const obj: Record<string, string> = {};
    for (const r of next) {
      if (!r.key) continue;
      obj[r.key] = r.value;
    }
    onChange(obj);
  }

  function addRow() {
    const next = [...rows, { key: '', value: '' }];
    setRows(next);
    pushChange(next);
  }
  function update(i: number, patch: Partial<Row>) {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch } as Row;
    setRows(next);
    pushChange(next);
  }
  function remove(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next);
    pushChange(next);
  }

  const dark = variant === 'dark';
  const inputCls = dark
    ? 'border border-slate-700/60 rounded-input px-2 py-1 bg-slate-900/60 text-slate-100 placeholder-slate-500'
    : 'border border-slate-300 rounded-input px-2 py-1 bg-white text-slate-900 placeholder-slate-400';
  const removeCls = dark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-500';
  const addBtn = dark ? 'px-3 py-1.5 text-xs rounded bg-slate-800/70 border border-slate-700/60 text-slate-200 hover:bg-slate-700/60 transition' : 'px-3 py-1.5 text-xs rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition';
  return (
	<div className="space-y-2 text-[13px] leading-5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
	<input className={`col-span-5 ${inputCls}`} placeholder={placeholderKey} value={r.key} onChange={e=>update(i,{key:e.target.value})} />
	<input className={`col-span-6 ${inputCls}`} placeholder={placeholderValue} value={r.value} onChange={e=>update(i,{value:e.target.value})} />
	    <button className={`col-span-1 text-xs underline-offset-2 hover:underline ${removeCls}`} onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
	<button className={addBtn} type="button" onClick={addRow}>Add</button>
    </div>
  );
}
