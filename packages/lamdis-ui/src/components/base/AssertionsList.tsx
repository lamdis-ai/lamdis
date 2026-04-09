import React from 'react';
import Badge from './Badge';

export interface AssertionItem {
  type: string;
  pass?: boolean;
  severity?: 'info' | 'warn' | 'error';
  details?: any;
  config?: any;
}

export default function AssertionsList({ assertions }: { assertions: AssertionItem[] }) {
  if (!Array.isArray(assertions) || assertions.length === 0) return null;
  return (
    <div className="space-y-1">
      {assertions.map((a, i) => {
        const variant = a.pass ? 'success' : (a.severity === 'info' ? 'neutral' : 'danger');
        const lbl = a.type === 'semantic'
          ? `Semantic${typeof a?.details?.score === 'number' ? ` ${(() => { const s=Number(a.details.score); if (!isFinite(s)) return ''; if (s<=1) return `${Math.round(s*100)}%`; if (s<=10) return `${Math.round((s/10)*100)}%`; return `${Math.round(s)}%`; })()}` : ''}${a?.details?.threshold!=null ? ` (≥ ${(() => { const t=Number(a.details.threshold); if (!isFinite(t)) return ''; return t<=1 ? `${Math.round(t*100)}%` : `${Math.round(t)}%`; })()})` : ''}`
          : a.type === 'includes'
          ? `Includes${typeof a?.details?.score === 'number' ? ` ${(() => { const s=Number(a.details.score); if (!isFinite(s)) return ''; if (s<=1) return `${Math.round(s*100)}%`; if (s<=10) return `${Math.round((s/10)*100)}%`; return `${Math.round(s)}%`; })()}` : ''}`
          : String(a.type || 'assertion');
        const reason = a.type === 'semantic' ? (a.details?.reasoning || '') : (a.details?.misses ? `Missing: ${(a.details.misses||[]).join(', ')}` : '');
        const scope = a.type === 'includes' && a.config?.scope ? ` • scope: ${a.config.scope}` : '';
        return (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <div className="text-slate-300 truncate">
              <span className="mr-2"><Badge variant={variant as any}>{lbl}</Badge></span>
              {reason && <span className="text-slate-500">{reason}{scope}</span>}
            </div>
            {a.severity && <span className="text-[10px] uppercase text-slate-500">{a.severity}</span>}
          </div>
        );
      })}
    </div>
  );
}
