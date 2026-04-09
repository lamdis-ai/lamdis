"use client";
import Link from 'next/link';
import { FiUser, FiUsers, FiKey, FiShield, FiCreditCard, FiArrowRight } from 'react-icons/fi';

const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';

const cards = [
  { href: '/dashboard/settings/profile', icon: <FiUser />, title: 'My Profile', desc: 'Display name, employee UUID, and personal preferences.' },
  { href: '/dashboard/settings/users', icon: <FiUsers />, title: 'Users & Licenses', desc: 'Invite teammates, manage seats, and assign roles.' },
  { href: '/dashboard/settings/roles', icon: <FiKey />, title: 'Roles & Permissions', desc: 'Define what each role can see and do.' },
  { href: '/dashboard/settings/api-keys', icon: <FiKey />, title: 'API Keys', desc: 'Programmatic access tokens for the Lamdis API and SDK.' },
  ...(!isSelfHosted ? [{ href: '/dashboard/settings/sso', icon: <FiShield />, title: 'SSO / SAML', desc: 'Single sign-on with your identity provider.' }] : []),
  { href: '/dashboard/settings/billing', icon: <FiCreditCard />, title: isSelfHosted ? 'License' : 'Billing', desc: isSelfHosted ? 'Self-hosted license status and entitlements.' : 'Plan, payment, and invoices.' },
];

export default function SettingsOverview() {
  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Account, organization, and access management.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(c => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-xl border border-slate-800/70 bg-slate-900/40 p-4 hover:border-fuchsia-500/40 hover:bg-slate-900/70 transition"
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg bg-slate-800/70 flex items-center justify-center text-fuchsia-300 text-lg">
                {c.icon}
              </div>
              <FiArrowRight className="text-slate-600 group-hover:text-fuchsia-300 transition" />
            </div>
            <div className="mt-3 text-sm font-medium text-slate-100">{c.title}</div>
            <div className="text-xs text-slate-500 mt-1 leading-snug">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
