"use client";
import Link from 'next/link';
import { FiActivity, FiZap, FiTool, FiFile, FiFileText, FiShield, FiFolder, FiCheckCircle, FiMessageSquare, FiArrowRight } from 'react-icons/fi';

const cards = [
  { href: '/dashboard/library/build', icon: <FiActivity />, title: 'Build with AI', desc: 'Use the AI builder to spin up a new objective from a goal description.' },
  { href: '/dashboard/library/objectives', icon: <FiActivity />, title: 'Objectives', desc: 'Named business outcomes the agent works toward.' },
  { href: '/dashboard/library/channels', icon: <FiMessageSquare />, title: 'Channels', desc: 'Where work flows in: chat, email, webhooks, integrations.' },
  { href: '/dashboard/library/actions', icon: <FiZap />, title: 'Action Library', desc: 'Concrete things the agent can do — API calls, scripts, workflows.' },
  { href: '/dashboard/library/action-bindings', icon: <FiTool />, title: 'Action Bindings', desc: 'Map actions to specific connections, environments, or credentials.' },
  { href: '/dashboard/library/code', icon: <FiFile />, title: 'Code Sandbox', desc: 'Custom code the agent can call as a tool.' },
  { href: '/dashboard/library/policies', icon: <FiFileText />, title: 'Policies', desc: 'Rules that constrain what the agent is allowed to do.' },
  { href: '/dashboard/library/boundaries', icon: <FiShield />, title: 'Decision Boundaries', desc: 'Where the agent stops and asks for human input.' },
  { href: '/dashboard/library/categories', icon: <FiFolder />, title: 'Categories', desc: 'Tagging system for organizing policies and outcomes.' },
  { href: '/dashboard/library/suites', icon: <FiCheckCircle />, title: 'Test Suites', desc: 'Reusable test cases that exercise your objectives end-to-end.' },
];

export default function LibraryOverview() {
  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Library</h1>
        <p className="text-sm text-slate-400 mt-1">The definitions your agents use to do work — objectives, actions, policies, and tests.</p>
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
