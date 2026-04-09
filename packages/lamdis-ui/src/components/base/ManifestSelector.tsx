"use client";
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type Manifest = { id: string; slug: string; name: string; description?: string; visibility: 'public'|'private'; isDefault?: boolean };

export default function ManifestSelector({
  label = 'Manifest',
  onChange,
  className,
}: {
  label?: string;
  onChange: (m: Manifest | null) => void;
  className?: string;
}) {
  const [list, setList] = useState<Manifest[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const selected = useMemo(() => list.find(m => m.id === selectedId) || null, [list, selectedId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch('/api/orgs/manifests', { cache: 'no-store' });
        const d = await r.json();
        const ms: Manifest[] = d.manifests || [];
        if (!active) return;
        setList(ms);
        // Determine selection from URL (?m= id or slug) or default
  const mParam = params?.get('m');
        if (mParam) {
          const byParam = ms.find(m => m.id === mParam || m.slug === mParam) || null;
          if (byParam) { setSelectedId(byParam.id); onChange(byParam); return; }
        }
        const def = ms.find(m => m.isDefault) || ms[0] || null;
        if (def) { setSelectedId(def.id); onChange(def); }
        else { onChange(null); }
      } catch {
        setList([]); onChange(null);
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When selection changes, sync URL ?m= to slug for readability
  useEffect(() => {
    if (!selected) return;
  const usp = new URLSearchParams(params ? Array.from(params.entries()) : []);
    usp.set('m', selected.slug);
    router.replace(`${pathname}?${usp.toString()}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className={className}>
      <label className="text-xs uppercase tracking-wide text-slate-400 mr-2">{label}</label>
      <select
        className="bg-slate-900 border border-slate-600/70 hover:border-slate-500/70 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
        value={selectedId}
        onChange={(e) => {
          const id = (e.target as HTMLSelectElement).value;
          setSelectedId(id);
          const m = list.find(x => x.id === id) || null;
          onChange(m);
        }}
      >
        {list.length === 0 && <option value="">No manifests</option>}
        {list.map(m => (
          <option key={m.id} value={m.id}>{m.name} {m.isDefault ? '(default)' : ''}</option>
        ))}
      </select>
      <a className="ml-2 text-xs underline text-slate-300 hover:text-slate-100" href="/dashboard/manifests/multi">Manage</a>
    </div>
  );
}
