"use client";
import Badge from './Badge';

type LogEntry = {
  t?: string;
  type?: string;
  subtype?: string;
  content?: string;
  details?: any;
  [k: string]: any;
};

export default function LogList({ logs, limit = 50 }: { logs: LogEntry[]; limit?: number }) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return <div className="text-slate-600 text-xs">No logs yet.</div>;
  }
  const items = limit > 0 ? logs.slice(-limit) : logs;
  const fmtTime = (iso?: string) => {
    if (!iso) return '';
    const hhmmss = String(iso).split('T')[1]?.slice(0, 8) || '';
    return hhmmss;
  };
  const typeColor = (tp?: string) => {
    const t = String(tp || '').toLowerCase();
    if (t === 'error') return 'danger';
    if (t === 'judge_check') return 'info';
    if (t === 'assistant_reply') return 'success';
    if (t === 'user_message') return 'neutral';
    if (t === 'env' || t === 'persona' || t === 'plan') return 'warning';
    return 'neutral';
  };
  return (
    <div className="text-xs text-slate-400 space-y-1 max-h-56 overflow-auto pr-1">
      {items.map((l, k) => (
        <div key={k} className="flex items-start gap-2">
          <span className="text-slate-600 shrink-0 w-12">{fmtTime(l.t)}</span>
          <div className="shrink-0">
            <Badge variant={typeColor(l.type) as any}>{String(l.type || '').toUpperCase()}</Badge>
          </div>
          <div className="text-slate-300 whitespace-pre-wrap break-words">
            {l.subtype ? <span className="text-slate-400 mr-1">[{String(l.subtype)}]</span> : null}
            {l.content ? <span>{String(l.content)}</span> : null}
            {l.details?.misses && Array.isArray(l.details.misses) && l.details.misses.length > 0 ? (
              <span className="ml-2 text-slate-400">misses: {l.details.misses.join(', ')}</span>
            ) : null}
            {typeof l.details?.score === 'number' ? (
              <span className="ml-2 text-slate-400">score: {(() => {
                const s = Number(l.details.score);
                if (!isFinite(s)) return '—';
                const dec = s <= 1 ? s : (s <= 10 ? s / 10 : s / 100);
                return dec.toFixed(2);
              })()}</span>
            ) : null}
            {l.details?.threshold != null ? (
              <span className="ml-2 text-slate-500">threshold: {(() => {
                const t = Number(l.details.threshold);
                if (!isFinite(t)) return '—';
                const dec = t <= 1 ? t : (t <= 10 ? t / 10 : t / 100);
                return dec.toFixed(2);
              })()}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
