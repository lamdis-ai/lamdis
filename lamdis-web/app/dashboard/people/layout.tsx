"use client";
import React from 'react';
import SectionNav, { SectionNavGroup } from '@/components/layout/SectionNav';
import { FiUsers, FiShield, FiUserCheck } from 'react-icons/fi';

const groups: SectionNavGroup[] = [
  {
    items: [
      { label: 'Members', href: '/dashboard/people', icon: <FiUsers /> },
      { label: 'Roles', href: '/dashboard/people/roles', icon: <FiShield />, startsWith: true },
      { label: 'Teams', href: '/dashboard/people/teams', icon: <FiUserCheck />, startsWith: true },
    ],
  },
];

export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionNav
        title="People"
        description="Manage who's in your org, what they can do, and what teams they're on."
        groups={groups}
      />
      <div className="flex-1 overflow-y-auto px-8 py-6 min-h-full">{children}</div>
    </>
  );
}
