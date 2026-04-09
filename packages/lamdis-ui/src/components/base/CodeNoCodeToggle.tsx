"use client";
import { useEffect, useMemo, useState } from 'react';
import KeyValueEditor from './KeyValueEditor';
import JsonAccordion from './JsonAccordion';
import JsonSchemaBuilder from './JsonSchemaBuilder';

type Mode = 'code' | 'no-code';

export default function CodeNoCodeToggle({ kind, value, onChange, variant = 'dark' }: {
  kind: 'headers' | 'json' | 'schema';
  value: string;
  onChange: (next: string) => void;
  variant?: 'dark' | 'light';
}) {
  const [mode, setMode] = useState<Mode>('no-code');
  const parsed = useMemo(() => {
    try { return value ? JSON.parse(value) : (kind === 'headers' ? {} : {}); } catch { return kind === 'headers' ? {} : {}; }
  }, [value, kind]);

  // Keep code in sync when no-code editor changes
  function emit(obj: any) {
    try { onChange(JSON.stringify(obj, null, 2)); } catch { onChange(''); }
  }

  useEffect(() => {
    // keep mode if user toggled; do nothing on mount
  }, []);

  const dark = variant === 'dark';
  const toggleWrapper = dark
    ? 'mb-3 inline-flex rounded-full border border-slate-700/60 overflow-hidden bg-slate-800/40 backdrop-blur-sm'
    : 'mb-3 inline-flex rounded-full border border-slate-200 overflow-hidden bg-slate-100/60';
  const activeBtn = dark
    ? 'bg-slate-700 text-slate-100'
    : 'bg-white text-slate-900';
  const inactiveBtn = dark
    ? 'text-slate-400 hover:text-slate-200'
    : 'text-slate-500 hover:text-slate-700';
  const baseBtn = 'px-4 py-1.5 text-xs font-medium transition-colors';
  const textareaCls = dark
    ? 'w-full rounded-card border border-slate-700/60 px-3 py-2 h-48 font-mono text-[12px] bg-slate-900/70 text-slate-100 placeholder-slate-500'
    : 'w-full rounded-card border border-slate-200 px-3 py-2 h-48 font-mono text-[12px] bg-slate-50 text-slate-800 placeholder-slate-400';
  const jsonContainer = dark
    ? 'max-h-64 overflow-y-auto rounded-card border border-slate-700/60 bg-slate-900/50 backdrop-blur p-2'
    : 'max-h-64 overflow-y-auto rounded-card border border-slate-200 bg-white p-2';

  return (
    <div>
      <div className={toggleWrapper}>
        <button className={`${baseBtn} ${mode==='no-code' ? activeBtn : inactiveBtn}`} onClick={() => setMode('no-code')}>No-code</button>
        <button className={`${baseBtn} ${mode==='code' ? activeBtn : inactiveBtn}`} onClick={() => setMode('code')}>Code</button>
      </div>
      {mode === 'code' ? (
        <textarea className={textareaCls} value={value} onChange={e=>onChange(e.target.value)} />
      ) : kind === 'headers' ? (
        <KeyValueEditor value={parsed} onChange={emit} allowEmpty variant={variant} />
      ) : kind === 'schema' ? (
        <JsonSchemaBuilder value={parsed} onChange={emit} variant={variant} />
      ) : (
        <div className={jsonContainer}>
          <JsonAccordion value={parsed} onChange={emit} variant={variant} />
        </div>
      )}
    </div>
  );
}
