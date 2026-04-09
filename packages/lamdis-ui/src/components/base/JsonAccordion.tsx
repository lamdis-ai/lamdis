"use client";
import { useMemo, useState } from 'react';

type Json = null | string | number | boolean | Json[] | { [k: string]: Json };

export default function JsonAccordion({ value, onChange, rootTitle = 'JSON', variant = 'dark' }: {
  value: Json | undefined;
  onChange?: (next: Json) => void;
  rootTitle?: string;
  variant?: 'dark' | 'light';
}) {
  const dark = variant === 'dark';
  const wrapper = dark
    ? 'border border-slate-700/60 rounded-card divide-y divide-slate-700/60 bg-slate-900/50 backdrop-blur text-[13px] leading-5'
    : 'border border-slate-200 rounded-card divide-y divide-slate-200 bg-white text-[13px] leading-5';
  return (
	<div className={wrapper}>
      <Node name={rootTitle} value={value ?? {}} depth={0} onChange={onChange} isRoot variant={variant} />
    </div>
  );
}

type ValueType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

function detectType(v: Json): ValueType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

function nextDefaultValue(t: ValueType): Json {
  switch (t) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'null': return null;
    case 'object': return {};
    case 'array': return [];
    default: return '';
  }
}

function TypeSelect({ valueType, onChange, variant }: { valueType: ValueType; onChange: (t: ValueType) => void; variant: 'dark' | 'light' }) {
  const dark = variant === 'dark';
  const cls = dark
    ? 'text-[11px] rounded border border-slate-700/60 bg-slate-950/70 text-slate-200 px-1.5 py-0.5'
    : 'text-[11px] rounded border border-slate-300 bg-white text-slate-700 px-1.5 py-0.5';
  return (
    <select className={cls} value={valueType} onChange={(e)=>onChange(e.target.value as ValueType)}>
      <option value="string">string</option>
      <option value="number">number</option>
      <option value="boolean">boolean</option>
      <option value="null">null</option>
      <option value="object">object</option>
      <option value="array">array</option>
    </select>
  );
}

function Node({ name, value, depth, onChange, isRoot, variant, onRename, onDelete }: {
  name: string;
  value: Json;
  depth: number;
  onChange?: (next: Json) => void;
  isRoot?: boolean;
  variant: 'dark' | 'light';
  onRename?: (newName: string) => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const indent = Math.min(depth, 4);
  const dark = variant === 'dark';
  const metaCls = dark ? 'text-[11px] text-slate-500' : 'text-[11px] text-slate-500';
  const btnBase = dark ? 'text-left font-medium hover:text-cyan-300 transition-colors' : 'text-left font-medium hover:text-sky-600 transition-colors';
  const iconBtn = dark ? 'text-[11px] px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-300 hover:bg-slate-800/60' : 'text-[11px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50';
  const nameInputCls = dark ? 'text-[12px] px-1 py-0.5 rounded border border-slate-700/60 bg-slate-900/70 text-slate-200' : 'text-[12px] px-1 py-0.5 rounded border border-slate-300 bg-white text-slate-700';

  if (Array.isArray(value)) {
    const addItem = (t: ValueType) => {
      if (!onChange) return;
      const next = value.slice();
      (next as any).push(nextDefaultValue(t));
      onChange(next);
    };
    const removeAt = (idx: number) => {
      if (!onChange) return;
      const next = value.slice();
      next.splice(idx, 1);
      onChange(next);
    };
    return (
      <div>
        <div className="flex items-center justify-between px-3 py-2" style={{ paddingLeft: `${indent * 8}px` }}>
          <div className="flex items-center gap-2">
            <button className={btnBase} onClick={() => setOpen(!open)}>
              {name} <span className={metaCls}>[array] ({value.length})</span>
            </button>
            {!isRoot && onRename && (
              <input className={nameInputCls} defaultValue={name} onBlur={(e)=>{ if (e.target.value && e.target.value !== name) onRename(e.target.value); }} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className={metaCls}>add</label>
            <TypeSelect valueType={'string'} onChange={addItem} variant={variant} />
            {onDelete && <button className={iconBtn} onClick={onDelete}>Delete</button>}
          </div>
        </div>
        {open && (
          <div className="space-y-2 pb-2">
            {value.map((v, i) => (
              <div key={i} className="group">
                <LeafOrBranch
                  name={`${i}`}
                  value={v}
                  depth={depth + 1}
                  variant={variant}
                  onChange={(nv: Json)=>{
                    if (!onChange) return;
                    const next = value.slice();
                    (next as any)[i] = nv;
                    onChange(next);
                  }}
                  onDelete={() => removeAt(i)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, Json>);
    const addField = (t: ValueType) => {
      if (!onChange) return;
      // generate unique key
      const base = 'field';
      let idx = 1;
      const keys = Object.keys(value as any);
      let key = base;
      while (keys.includes(key)) { key = `${base}${idx++}`; }
      const next = { ...(value as any) };
      (next as any)[key] = nextDefaultValue(t);
      onChange(next);
    };
    const renameKey = (oldK: string, newK: string) => {
      if (!onChange || !newK || oldK === newK) return;
      const obj = { ...(value as any) };
      if (Object.prototype.hasOwnProperty.call(obj, newK)) return; // don't overwrite existing
      obj[newK] = obj[oldK];
      delete obj[oldK];
      onChange(obj);
    };
    const deleteKey = (k: string) => {
      if (!onChange) return;
      const obj = { ...(value as any) };
      delete (obj as any)[k];
      onChange(obj);
    };
    return (
      <div>
        <div className="flex items-center justify-between px-3 py-2" style={{ paddingLeft: `${indent * 8}px` }}>
          <div className="flex items-center gap-2">
            <button className={btnBase} onClick={() => setOpen(!open)}>
              {name} <span className={metaCls}>{isRoot ? '' : '[object]'} {`(${entries.length})`}</span>
            </button>
            {!isRoot && onRename && (
              <input className={nameInputCls} defaultValue={name} onBlur={(e)=>{ if (e.target.value && e.target.value !== name) onRename(e.target.value); }} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className={metaCls}>add</label>
            <TypeSelect valueType={'string'} onChange={addField} variant={variant} />
            {onDelete && <button className={iconBtn} onClick={onDelete}>Delete</button>}
          </div>
        </div>
        {open && (
          <div className="space-y-2 pb-2">
            {entries.map(([k, v]) => (
              <div key={k} className="group">
                <LeafOrBranch
                  name={k}
                  value={v}
                  depth={depth + 1}
                  variant={variant}
                  onChange={(nv: Json)=>{
                    if (!onChange) return;
                    const next = { ...(value as any) };
                    (next as any)[k] = nv;
                    onChange(next);
                  }}
                  onRename={(newName: string)=> renameKey(k, newName)}
                  onDelete={()=> deleteKey(k)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <Leaf name={name} value={value} depth={depth} onChange={onChange} variant={variant} onRename={onRename} onDelete={onDelete} />;
}

function LeafOrBranch(props: any) {
  const v = props.value;
  if (v && (Array.isArray(v) || typeof v === 'object')) return <Node {...props} />;
  return <Leaf {...props} />;
}

function Leaf({ name, value, depth, onChange, variant, onRename, onDelete }: { name: string; value: Json; depth: number; onChange?: (next: Json) => void; variant: 'dark' | 'light'; onRename?: (newName: string) => void; onDelete?: () => void; }) {
  const indent = Math.min(depth, 4);
  const type = value === null ? 'null' : typeof value;
  const editable = type === 'string' || type === 'number' || type === 'boolean' || type === 'null';
  const dark = variant === 'dark';
  const nameCls = dark ? 'col-span-4 truncate text-slate-400 text-[12px]' : 'col-span-4 truncate text-slate-600 text-[12px]';
  const inputCls = dark ? 'w-full border border-slate-700/60 rounded px-2 py-1 bg-slate-800/70 text-[12px] text-slate-100 placeholder-slate-500' : 'w-full border border-slate-300 rounded px-2 py-1 bg-white text-[12px]';
  const nameInputCls = dark ? 'w-full border border-slate-700/60 rounded px-2 py-1 bg-slate-900/70 text-[12px] text-slate-200 placeholder-slate-500' : 'w-full border border-slate-300 rounded px-2 py-1 bg-white text-[12px]';
  const metaCls = dark ? 'text-[11px] text-slate-500' : 'text-[11px] text-slate-500';
  const delBtnCls = dark ? 'text-[11px] px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-300 hover:bg-slate-800/60' : 'text-[11px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50';
  const valueType: ValueType = useMemo(() => detectType(value), [value]);
  return (
    <div className="grid grid-cols-12 items-center gap-2 px-3 py-1" style={{ paddingLeft: `${indent * 8}px` }}>
      <div className={nameCls}>
        {onRename ? (
          <input className={nameInputCls} defaultValue={name} onBlur={(e)=>{ const nv = e.target.value.trim(); if (nv && nv !== name) onRename(nv); }} />
        ) : (
          name
        )}
      </div>
      <div className="col-span-6">
        {editable ? (
          type === 'boolean' ? (
            <input type="checkbox" checked={Boolean(value)} onChange={e=>onChange && onChange(e.target.checked)} />
          ) : (
            <input className={inputCls} value={value === null ? '' : String(value)} onChange={e=>{
              if (!onChange) return;
              const raw = e.target.value;
              if (type === 'number') {
                const n = Number(raw);
                onChange(Number.isNaN(n) ? 0 : n);
              } else if (type === 'null') {
                onChange(raw);
              } else {
                onChange(raw);
              }
            }} />
          )
        ) : (
          <span className="text-[11px] text-slate-500">{String(value)}</span>
        )}
      </div>
      <div className="col-span-2 flex items-center gap-2">
        <span className={metaCls}>type</span>
        <TypeSelect
          valueType={valueType}
          onChange={(t)=> onChange && onChange(nextDefaultValue(t))}
          variant={variant}
        />
      </div>
      <div className="col-span-0 md:col-span-0 lg:col-span-0">
        {onDelete && (
          <button className={delBtnCls} onClick={onDelete}>Delete</button>
        )}
      </div>
    </div>
  );
}
