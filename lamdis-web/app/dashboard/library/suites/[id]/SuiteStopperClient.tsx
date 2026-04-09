"use client";
import React from 'react';
import Button from '@/components/base/Button';
import { useToast } from '@/components/base/Toast';
import { useRouter } from 'next/navigation';

export default function SuiteStopperClient({ runs }: { runs: any[] }) {
  const toast = useToast();
  const router = useRouter();
  // Only show stop when a run is actually running (not merely queued)
  const active = Array.isArray(runs) ? runs.find((r:any)=> String(r.status||'').toLowerCase() === 'running') : null;
  if (!active) return null;
  const onStop = async () => {
    try {
      const resp = await fetch(`/api/ci/stop/${encodeURIComponent(String(active.id))}`, { method: 'POST' });
      if (resp.ok) { toast.success('Run stop requested'); router.refresh(); } else { const t = await resp.text(); toast.error(`Stop failed: ${t||resp.status}`); }
    } catch (e:any) { toast.error(e?.message || 'Stop failed'); }
  };
  return (
    <Button onClick={onStop} variant="danger" className="h-8 text-xs px-3">Stop running run</Button>
  );
}
