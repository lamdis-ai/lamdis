"use client";
import Link from 'next/link';
import { FiPlayCircle, FiBarChart2, FiZap, FiClipboard, FiFileText, FiCheckCircle, FiArrowRight } from 'react-icons/fi';

const cards = [
  { href: '/dashboard/activity/instances', icon: <FiPlayCircle />, title: 'Active Instances', desc: 'Outcome instances currently running, paused, or waiting on input.' },
  { href: '/dashboard/activity/runs', icon: <FiBarChart2 />, title: 'Runs', desc: 'Historical batches of objective executions grouped by run.' },
  { href: '/dashboard/activity/action-executions', icon: <FiZap />, title: 'Action Executions', desc: 'Every action the agent has taken — successes, failures, retries.' },
  { href: '/dashboard/activity/proof', icon: <FiClipboard />, title: 'Decisions', desc: 'Decision dossiers showing why the agent chose to act.' },
  { href: '/dashboard/activity/audit', icon: <FiFileText />, title: 'Audit Log', desc: 'Compliance-grade event log of agent and user activity.' },
  { href: '/dashboard/activity/test-results', icon: <FiCheckCircle />, title: 'Test Results', desc: 'Outcomes from your test suites — pass, fail, regressions.' },
  { href: '/dashboard/activity/event-simulator', icon: <FiZap />, title: 'Event Simulator', desc: 'Fire synthetic events through the pipeline for debugging.' },
];

export default function ActivityOverview() {
  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Activity</h1>
        <p className="text-sm text-slate-400 mt-1">What the agent is doing right now, and the trail of what it has done.</p>
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
