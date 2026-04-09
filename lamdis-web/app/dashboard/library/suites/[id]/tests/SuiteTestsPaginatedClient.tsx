"use client";
import React from 'react';
import Pagination from '@/components/base/Pagination';
import SuiteTestsTableClient from './SuiteTestsTableClient';

type Persona = { id: string; name: string };

export default function SuiteTestsPaginatedClient({ tests, suiteId, personas, pageSize = 10 }: { tests: any[]; suiteId: string; personas?: Persona[]; pageSize?: number }) {
  const [page, setPage] = React.useState(1);
  const total = Array.isArray(tests) ? tests.length : 0;
  const start = (page - 1) * pageSize;
  const slice = Array.isArray(tests) ? tests.slice(start, start + pageSize) : [];

  return (
    <div className="space-y-2">
      <SuiteTestsTableClient tests={slice as any} suiteId={suiteId} personas={personas} />
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
