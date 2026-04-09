"use client";

import Table from '@/components/base/Table';

interface SuiteWithSchedule {
  id: string;
  name: string;
  schedule?: {
    enabled?: boolean;
    periodMinutes?: number;
    lastRunAt?: string;
  };
  lastScheduledRun?: {
    id?: string;
    createdAt?: string;
  } | null;
}

export default function SuitesScheduleTableClient({ suites }: { suites: SuiteWithSchedule[] }) {
  const columns = [
    {
      key: 'suite',
      header: 'Suite',
      render: (row: SuiteWithSchedule) => (
        <a
          className="text-brand-500 hover:underline"
          href={`/dashboard/library/suites/${encodeURIComponent(String(row.id))}`}
        >
          {row.name}
        </a>
      ),
    },
    {
      key: 'enabled',
      header: 'Scheduled',
      className: 'w-28',
      render: (row: SuiteWithSchedule) => (
        <span className={row?.schedule?.enabled ? 'text-emerald-300' : 'text-slate-400'}>
          {row?.schedule?.enabled ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'cadence',
      header: 'Cadence',
      className: 'w-40',
      render: (row: SuiteWithSchedule) => {
        const pm = Number(row?.schedule?.periodMinutes || 0);
        if (!row?.schedule?.enabled || !pm) return <span className="text-slate-500">-</span>;
        if (pm % (24 * 60) === 0) return <span>{pm / (24 * 60)} day(s)</span>;
        if (pm % 60 === 0) return <span>{pm / 60} hour(s)</span>;
        return <span>{pm} minute(s)</span>;
      },
    },
    {
      key: 'lastSched',
      header: 'Last scheduled run',
      className: 'w-64',
      render: (row: SuiteWithSchedule) => {
        const byField = row?.schedule?.lastRunAt ? new Date(row.schedule.lastRunAt) : null;
        const byRuns = row?.lastScheduledRun?.createdAt
          ? new Date(row.lastScheduledRun.createdAt)
          : null;
        const when = byField || byRuns
          ? new Date(
              byField && byRuns ? (byField > byRuns ? byField : byRuns) : (byField || byRuns)!,
            )
          : null;
        if (!when) return <span className="text-slate-500">-</span>;
        const rid = row?.lastScheduledRun?.id;
        return rid ? (
          <a
            href={`/dashboard/runs/${encodeURIComponent(String(rid))}`}
            className="text-slate-300 hover:text-white underline"
          >
            {when.toLocaleString()}
          </a>
        ) : (
          <span className="text-slate-400">{when.toLocaleString()}</span>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns as any}
      data={suites as any}
      empty={<span className="text-slate-500">No suites yet.</span>}
    />
  );
}
