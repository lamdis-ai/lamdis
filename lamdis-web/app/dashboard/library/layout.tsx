"use client";
import React from 'react';
import SectionNav, { SectionNavGroup } from '@/components/layout/SectionNav';
import { FiActivity, FiZap, FiTool, FiFile, FiFileText, FiShield, FiFolder, FiCheckCircle, FiMessageSquare, FiUserCheck } from 'react-icons/fi';

const groups: SectionNavGroup[] = [
  {
    label: 'Build',
    items: [
      { label: 'Build with AI', href: '/dashboard/library/build', icon: <FiActivity />, startsWith: true },
      { label: 'Objectives', href: '/dashboard/library/objectives', icon: <FiActivity />, startsWith: true },
      { label: 'Channels', href: '/dashboard/library/channels', icon: <FiMessageSquare />, startsWith: true },
    ],
  },
  {
    label: 'Actions',
    items: [
      { label: 'Action Library', href: '/dashboard/library/actions', icon: <FiZap />, startsWith: true },
      { label: 'Action Bindings', href: '/dashboard/library/action-bindings', icon: <FiTool />, startsWith: true },
      { label: 'Code Sandbox', href: '/dashboard/library/code', icon: <FiFile />, startsWith: true },
    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'Policies', href: '/dashboard/library/policies', icon: <FiFileText />, startsWith: true },
      { label: 'Approval Chains', href: '/dashboard/library/approvals', icon: <FiUserCheck />, startsWith: true },
      { label: 'Decision Boundaries', href: '/dashboard/library/boundaries', icon: <FiShield />, startsWith: true },
      { label: 'Categories', href: '/dashboard/library/categories', icon: <FiFolder />, startsWith: true },
    ],
  },
  {
    label: 'Quality',
    items: [
      { label: 'Test Suites', href: '/dashboard/library/suites', icon: <FiCheckCircle />, startsWith: true },
    ],
  },
];

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionNav
        title="Library"
        description="The definitions your agents use to do work."
        groups={groups}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6 min-h-full">{children}</div>
    </>
  );
}
