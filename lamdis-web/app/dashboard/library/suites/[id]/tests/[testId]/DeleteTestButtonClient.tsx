"use client";
import Button from '@/components/base/Button';
import { useRouter } from 'next/navigation';

export default function DeleteTestButtonClient({ suiteId, testId }: { suiteId: string; testId: string }) {
  const router = useRouter();
  async function handleDelete() {
    const ok = typeof window !== 'undefined' ? window.confirm('Delete this test? This cannot be undone.') : true;
    if (!ok) return;
    const res = await fetch(`/api/orgs/suites/${encodeURIComponent(suiteId)}/tests/${encodeURIComponent(testId)}`, { method: 'DELETE' });
    if (res.ok) {
      router.push(`/dashboard/library/suites/${suiteId}/tests`);
      return;
    }
    try { const j = await res.json(); console.error('delete failed', j); } catch {}
    if (typeof window !== 'undefined') alert('Failed to delete test');
  }
  return (
    <Button variant="outline" onClick={handleDelete} className="text-red-400 border-red-500/50">Delete</Button>
  );
}
