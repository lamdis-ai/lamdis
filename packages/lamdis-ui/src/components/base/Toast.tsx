"use client";
import React from 'react';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; text: string };

const Ctx = React.createContext<{ success: (t: string)=>void; error: (t: string)=>void; info: (t:string)=>void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = (kind: ToastKind, text: string) => {
    const id = Date.now() + Math.floor(Math.random()*1000);
    setItems(cur => [...cur, { id, kind, text }]);
    setTimeout(() => setItems(cur => cur.filter(i => i.id !== id)), 3500);
  };
  const api = React.useMemo(() => ({
    success: (t: string)=> push('success', t),
    error: (t: string)=> push('error', t),
    info: (t: string)=> push('info', t),
  }), []);
  const color = (k: ToastKind) => k==='success' ? 'bg-emerald-600/90 border-emerald-400/50' : k==='error' ? 'bg-rose-600/90 border-rose-400/50' : 'bg-slate-700/90 border-slate-400/40';
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed z-[100] bottom-4 right-4 flex flex-col gap-2">
        {items.map(i => (
          <div key={i.id} className={`text-xs text-white px-3 py-2 rounded-md border shadow-lg ${color(i.kind)}`}>
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(Ctx);
  if (!ctx) return { success: (_:string)=>{}, error: (_:string)=>{}, info: (_:string)=>{} };
  return ctx;
}
