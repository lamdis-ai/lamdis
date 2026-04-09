"use client";
import React from 'react';
import SectionNav, { SectionNavGroup } from '@/components/layout/SectionNav';
import { FiPlayCircle, FiBarChart2, FiZap, FiClipboard, FiFileText, FiCheckCircle } from 'react-icons/fi';

const groups: SectionNavGroup[] = [
  {
    label: 'Live work',
    items: [
      { label: 'Active Instances', href: '/dashboard/activity/instances', icon: <FiPlayCircle />, startsWith: true },
      { label: 'Runs', href: '/dashboard/activity/runs', icon: <FiBarChart2 />, startsWith: true },
      { label: 'Action Executions', href: '/dashboard/activity/action-executions', icon: <FiZap />, startsWith: true },
    ],
  },
  {
    label: 'Trail',
    items: [
      { label: 'Decisions', href: '/dashboard/activity/proof', icon: <FiClipboard />, startsWith: true },
      { label: 'Audit Log', href: '/dashboard/activity/audit', icon: <FiFileText />, startsWith: true },
    ],
  },
  {
    label: 'Testing',
    items: [
      { label: 'Test Results', href: '/dashboard/activity/test-results', icon: <FiCheckCircle />, startsWith: true },
      { label: 'Event Simulator', href: '/dashboard/activity/event-simulator', icon: <FiZap />, startsWith: true },
    ],
  },
];

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionNav
        title="Activity"
        description="What the agent is doing — and what it has done."
        groups={groups}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6 min-h-full">{children}</div>
    </>
  );
}
