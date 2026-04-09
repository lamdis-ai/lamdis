"use client";
import { useState } from 'react';

export default function WhenBuilder({ value, onChange, onErrorChange, onErrorValue }: { value: string; onChange: (v: string)=>void; onErrorChange: (v?: 'continue'|'retry'|'halt'|'' )=>void; onErrorValue?: 'continue'|'retry'|'halt' }) {
  const isConditional = !!value;
  function setMode(mode: 'always'|'condition') {
    if (mode === 'always') onChange('');
  }
  const [left, setLeft] = useState<string>(value || '');
  const [op, setOp] = useState<string>('exists');
  const [right, setRight] = useState<string>('');

  function apply() {
    let expr = '';
    if (op === 'exists') expr = left || '';
    else if (op === 'not_exists') expr = `not(${left || ''})`;
    else {
      const val = /^[0-9.]+$/.test(right) ? right : `'${right.replace(/'/g, "\\'")}'`;
      expr = `${left || ''} ${op === 'eq' ? '==' : '!='} ${val}`;
    }
    onChange(expr);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label className="block md:col-span-2">
        <div className="text-xs text-slate-400 mb-1">Run</div>
        <div className="flex gap-2">
          <select value={isConditional ? 'condition' : 'always'} onChange={(e)=>setMode(e.target.value as any)} className="rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100">
            <option value="always">Always</option>
            <option value="condition">Only if…</option>
          </select>
          {isConditional && (
            <div className="flex-1 grid grid-cols-12 gap-2">
              <input value={left} onChange={(e)=>setLeft(e.target.value)} placeholder="$.steps.lookup_customer.output.exists" className="col-span-7 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100" />
              <select value={op} onChange={(e)=>setOp(e.target.value)} className="col-span-2 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 text-xs">
                <option value="exists">exists</option>
                <option value="not_exists">not exists</option>
                <option value="eq">=</option>
                <option value="neq">!=</option>
              </select>
              <input value={right} onChange={(e)=>setRight(e.target.value)} placeholder="true | 123 | text" className="col-span-3 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100" />
              <button type="button" onClick={apply} className="col-span-12 rounded border border-slate-700 px-2 py-1 text-slate-200 mt-2">Apply</button>
            </div>
          )}
        </div>
      </label>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">On Error</div>
        <select value={onErrorValue || ''} onChange={(e)=>onErrorChange((e.target.value || '') as any)} className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100">
          <option value="">default</option>
          <option value="continue">continue</option>
          <option value="retry">retry</option>
          <option value="halt">halt</option>
        </select>
      </label>
    </div>
  );
}
