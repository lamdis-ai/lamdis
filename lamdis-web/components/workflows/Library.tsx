"use client";
import { useEffect, useMemo, useState } from 'react';
import { STEP_TEMPLATES, StepTemplate } from './helpers';
import Input from '@/components/base/Input';

export default function Library({ onAdd }: { onAdd: (tmpl: StepTemplate)=>void }){
  const [search, setSearch] = useState('');
  const categories = useMemo(()=> (['App','Control','Transform','Data','Notify','AI'] as const), []);
  function add(t: StepTemplate){ onAdd(t); }
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 h-full">
      <div className="text-sm font-medium text-slate-200 mb-2">Step Library</div>
      <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" sizeVariant="sm" />
      <div className="space-y-2 mt-2 max-h-[60vh] overflow-auto pr-1">
        {categories.map(cat => (
          <div key={cat}>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{cat}</div>
            <div className="space-y-1">
              {STEP_TEMPLATES.filter(t=>t.category===cat && (!search || t.title.toLowerCase().includes(search.toLowerCase()) || t.key.includes(search))).map(t => (
                <div key={t.key}
                     draggable
                     onDragStart={(e)=>e.dataTransfer.setData('application/json', JSON.stringify(t))}
                     className="flex items-center gap-2 rounded border border-slate-800/70 bg-slate-900/40 hover:bg-slate-900/70 cursor-grab px-2 py-1">
                  <span className="text-lg">{t.icon || '🔧'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm truncate">{t.title}</div>
                    <div className="text-slate-400 text-[11px] font-mono truncate">{t.key}</div>
                  </div>
                  <button type="button" onClick={()=>add(t)} className="text-xs rounded border border-slate-700 px-2 py-0.5 text-slate-300">Add</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
