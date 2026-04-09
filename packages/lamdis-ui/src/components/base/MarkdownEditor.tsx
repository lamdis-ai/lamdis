"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Dynamically import to avoid SSR issues. Cast to any to avoid TS complaints if types not yet installed.
const MDEditor: any = dynamic(() => import('@uiw/react-md-editor').then(m => m.default), { ssr: false });

export interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  height?: number;
}

export default function MarkdownEditor({ value, onChange, placeholder, height = 400 }: MarkdownEditorProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(()=>{ setMounted(true); },[]);

  return (
    <div data-color-mode="dark" className="rounded border border-slate-700 overflow-hidden" style={{ background:'#0f172a' }}>
      {mounted ? (
        <MDEditor
          value={value}
          height={height}
          onChange={(v: string | undefined)=> onChange(v || '')}
          textareaProps={{ placeholder }}
          preview="live" /* show editor + preview */
          visiableDragbar={false}
        />
      ) : (
        <textarea
          className="w-full h-[400px] bg-transparent p-3 text-sm font-mono outline-none"
          value={value}
          onChange={e=> onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
