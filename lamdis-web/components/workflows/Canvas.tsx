"use client";
import { RefObject } from 'react';
import { Step, StepTemplate, STEP_TEMPLATES, iconFor, humanize, miniSummary, isLoop } from './helpers';

type CanvasProps = {
  steps: Step[];
  selected: number;
  setSelected: (idx: number)=>void;
  selectedChild?: { parent: number; index: number } | null;
  onSelectChild?: (parent: number, index: number)=>void;
  onAddAfter: (tmpl: StepTemplate, index?: number)=>void;
  onAddNested?: (tmpl: StepTemplate, parentIndex: number)=>void;
  onMoveChild?: (parentIdx: number, childIdx: number, dir: -1|1)=>void;
  onRemoveChild?: (parentIdx: number, childIdx: number)=>void;
  onMove: (idx: number, dir: -1|1)=>void;
  onRemove: (idx: number)=>void;
  // root-level drop
  onDropTemplate: (raw: string, insertIndex?: number)=>void;
  // nested drop (into loop body)
  onDropTemplateNested: (raw: string, parentIndex: number)=>void;
};

export default function Canvas({ steps, selected, setSelected, selectedChild, onSelectChild, onAddAfter, onAddNested, onMoveChild, onRemoveChild, onMove, onRemove, onDropTemplate, onDropTemplateNested }: CanvasProps){
  function onDragOverAllow(e: React.DragEvent){ e.preventDefault(); }
  function onDrop(e: React.DragEvent, idx?: number){ e.preventDefault(); const raw = e.dataTransfer.getData('application/json'); if (!raw) return; onDropTemplate(raw, idx); }
  function onDropNested(e: React.DragEvent, parentIdx: number){ e.preventDefault(); const raw = e.dataTransfer.getData('application/json'); if (!raw) return; onDropTemplateNested(raw, parentIdx); }
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3" onDragOver={onDragOverAllow} onDrop={(e)=>onDrop(e)}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-slate-200">Canvas</div>
      </div>
      {steps.length===0 ? (
        <div className="text-slate-400 text-sm p-6 text-center border border-dashed border-slate-700 rounded">Empty. Drag a step from the left.</div>
      ) : (
        <div className="space-y-3">
          {steps.map((st, idx)=> (
            <div key={idx} className={`rounded-md border ${selected===idx?'border-sky-600':'border-slate-800'} bg-slate-950/60 hover:bg-slate-950/80`}
                 onDragOver={onDragOverAllow} onDrop={(e)=>onDrop(e, idx)}>
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-400">#{idx+1}</div>
                  <div className="flex-1 cursor-pointer" onClick={()=>setSelected(idx)}>
                    <div className="text-slate-100 text-sm flex items-center gap-2">
                      <span>{iconFor(st)}</span>
                      <span>{st.title || humanize(st.id)}</span>
                      <span className="text-[11px] font-mono text-slate-400">{st.uses && st.uses.trim() ? st.uses : 'choose action'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{miniSummary(st)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded border border-slate-700 px-2 py-1 text-slate-200" onClick={()=>onMove(idx,-1)}>↑</button>
                    <button type="button" className="rounded border border-slate-700 px-2 py-1 text-slate-200" onClick={()=>onMove(idx,1)}>↓</button>
                    <button type="button" className="rounded border border-red-700 px-2 py-1 text-red-300" onClick={()=>onRemove(idx)}>✕</button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {commonNextSteps(st).slice(0,4).map(sug => (
                    <button key={sug.key} type="button" className="text-[11px] rounded border border-slate-700 px-2 py-0.5 text-slate-200" onClick={()=>onAddAfter(sug, idx+1)}>{sug.title}</button>
                  ))}
                </div>
                {isLoop(st) && (
                  <div className="mt-3 ml-4 pl-3 border-l border-slate-800 space-y-2 relative rounded-md bg-slate-900/30 ring-1 ring-inset ring-slate-800/60"
                       onDragOver={onDragOverAllow}
                       onDrop={(e)=>onDropNested(e, idx)}>
                    {(st.children||[]).length===0 && (
                      <div className="text-[11px] text-slate-500 rounded border border-dashed border-slate-700 px-2 py-3 text-center space-y-2">
                        <div>Loop body empty.</div>
                        <div className="flex flex-wrap justify-center gap-1">
                          {STEP_TEMPLATES.filter(t=>t.key!=='control.loop').slice(0,4).map(t => (
                            <button key={t.key} type="button" className="text-[10px] rounded border border-slate-700 px-2 py-0.5 text-slate-200" onClick={()=>onAddNested?.(t, idx)}>{t.title}</button>
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-600">Drag steps here or click to add.</div>
                      </div>
                    )}
                    {(st.children||[]).map((c, cIdx)=> {
                      const active = selectedChild && selectedChild.parent===idx && selectedChild.index===cIdx;
                      return (
                        <div key={cIdx} className={`rounded border ${active? 'border-sky-600 ring-1 ring-sky-600/40':'border-slate-800'} bg-slate-950/60 p-2`}>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={()=>onSelectChild?.(idx, cIdx)} className="flex-1 text-left">
                              <div className="flex items-center gap-2">
                                <div className="text-[10px] text-slate-500">{st.id}.{cIdx+1}</div>
                                <div className="text-[12px] text-slate-200">{c.title || humanize(c.id)}</div>
                                <div className="text-[10px] font-mono text-slate-500">{c.uses||'choose'}</div>
                              </div>
                            </button>
                            <div className="flex items-center gap-1">
                              <button type="button" className="text-[10px] rounded border border-slate-700 px-1 py-0.5 text-slate-300 disabled:opacity-30" disabled={cIdx===0} onClick={()=>onMoveChild?.(idx, cIdx, -1)}>↑</button>
                              <button type="button" className="text-[10px] rounded border border-slate-700 px-1 py-0.5 text-slate-300 disabled:opacity-30" disabled={cIdx===(st.children!.length-1)} onClick={()=>onMoveChild?.(idx, cIdx, 1)}>↓</button>
                              <button type="button" className="text-[10px] rounded border border-red-700 px-1 py-0.5 text-red-300" onClick={()=>onRemoveChild?.(idx, cIdx)}>✕</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(st.children||[]).length>0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {STEP_TEMPLATES.filter(t=>t.key!=='control.loop').slice(0,3).map(t => (
                          <button key={t.key} type="button" className="text-[10px] rounded border border-slate-700 px-2 py-0.5 text-slate-300" onClick={()=>onAddNested?.(t, idx)}>{t.title}</button>
                        ))}
                      </div>
                    )}
                    <div className="h-6 text-[10px] flex items-center justify-center text-slate-500 border border-dashed border-slate-700 rounded opacity-0 hover:opacity-100 transition" onDragOver={onDragOverAllow} onDrop={(e)=>onDropNested(e, idx)}>
                      Drop to add to loop
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="h-8 rounded border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-sm" onDragOver={onDragOverAllow} onDrop={(e)=>onDrop(e, steps.length)}>Drop here</div>
        </div>
      )}
    </div>
  );
}

function commonNextSteps(prev: Step): StepTemplate[] {
  // Suggest generic, vendor-agnostic next steps
  if (prev.uses.includes('find_contact')) return STEP_TEMPLATES.filter(t => ['notify.email','app.update_record','app.create_record'].includes(t.key));
  if (prev.uses.includes('create_event')) return STEP_TEMPLATES.filter(t => ['notify.sms','notify.email'].includes(t.key));
  return STEP_TEMPLATES.filter(t => ['notify.sms','notify.email'].includes(t.key));
}
