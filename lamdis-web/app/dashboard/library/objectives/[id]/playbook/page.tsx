"use client";
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

interface Playbook {
  id: string;
  name: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  source: string;
  summary?: string | null;
  createdAt: string;
}

export default function PlaybookListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: outcomeTypeId } = use(params);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orgs/playbooks?outcomeTypeId=${outcomeTypeId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setPlaybooks(data?.playbooks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [outcomeTypeId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Playbooks</h1>
        <Link
          href={`/dashboard/library/objectives/${outcomeTypeId}/playbook/new`}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New playbook
        </Link>
      </div>
      <p className="text-sm text-gray-500 max-w-2xl">
        A playbook captures your organization&apos;s actual process for this outcome — your systems, your
        approvers, your required documents, and the order you do them in. Lamdis runs every instance
        against the active playbook so the agent stays inside your real workflow.
      </p>

      {loading && <div>Loading…</div>}
      {!loading && playbooks.length === 0 && (
        <Card>
          <div className="p-6 text-center text-sm text-gray-500">
            No playbooks yet. Click <strong>New playbook</strong> to start an interview, fill the
            wizard, or upload an SOP.
          </div>
        </Card>
      )}
      <div className="space-y-3">
        {playbooks.map((pb) => (
          <Card key={pb.id}>
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{pb.name}</span>
                  <Badge>{`v${pb.version}`}</Badge>
                  <Badge>{pb.status}</Badge>
                  <span className="text-xs text-gray-400">via {pb.source}</span>
                </div>
                {pb.summary && <div className="mt-1 text-sm text-gray-500">{pb.summary}</div>}
              </div>
              <Link
                href={`/dashboard/library/objectives/${outcomeTypeId}/playbook/${pb.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                View
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
