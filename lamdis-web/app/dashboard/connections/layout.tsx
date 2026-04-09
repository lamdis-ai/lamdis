"use client";
import React from 'react';
import SectionNav, { SectionNavGroup } from '@/components/layout/SectionNav';
import { FiLink, FiCompass, FiSliders } from 'react-icons/fi';

const groups: SectionNavGroup[] = [
  {
    items: [
      { label: 'All Connections', href: '/dashboard/connections', icon: <FiLink /> },
      { label: 'Environments', href: '/dashboard/connections/environments', icon: <FiCompass />, startsWith: true },
      { label: 'Variables', href: '/dashboard/connections/variables', icon: <FiSliders />, startsWith: true },
    ],
  },
];

export default function ConnectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionNav
        title="Connections"
        description="External systems your agents talk to."
        groups={groups}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6 min-h-full">{children}</div>
    </>
  );
}
