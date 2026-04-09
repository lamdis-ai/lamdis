"use client";
import { Suspense } from 'react';
import AgentWorkspace from '@/components/agent/AgentWorkspace';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading workspace...</div>
      </div>
    }>
      <AgentWorkspace />
    </Suspense>
  );
}
