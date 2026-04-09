"use client";
import React from 'react';
import SectionNav, { SectionNavGroup } from '@/components/layout/SectionNav';
import { FiUser, FiUsers, FiKey, FiShield, FiCreditCard } from 'react-icons/fi';

const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';

const groups: SectionNavGroup[] = [
  {
    label: 'You',
    items: [
      { label: 'My Profile', href: '/dashboard/settings/profile', icon: <FiUser />, startsWith: true },
    ],
  },
  {
    label: 'Organization',
    items: [
      { label: 'Users & Licenses', href: '/dashboard/settings/users', icon: <FiUsers />, startsWith: true },
      { label: 'Roles & Permissions', href: '/dashboard/settings/roles', icon: <FiKey />, startsWith: true },
      { label: 'API Keys', href: '/dashboard/settings/api-keys', icon: <FiKey />, startsWith: true },
      ...(!isSelfHosted ? [{ label: 'SSO / SAML', href: '/dashboard/settings/sso', icon: <FiShield />, startsWith: true }] : []),
      { label: isSelfHosted ? 'License' : 'Billing', href: '/dashboard/settings/billing', icon: <FiCreditCard />, startsWith: true },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionNav
        title="Settings"
        description="Account, organization, and access management."
        groups={groups}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6 min-h-full">{children}</div>
    </>
  );
}
