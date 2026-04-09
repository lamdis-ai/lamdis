"use client";
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

interface PlaybookDetail {
  id: string;
  name: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  source: string;
  summary?: string | null;
  procedureSteps?: Array<{ sequence: number; title: string; description?: string; requiresApproval?: boolean }>;
  bindings?: Array<{ id: string; role: string; connectorInstanceId: string | null }>;
  documents?: Array<{ id: string; documentTemplateId: string; required: boolean }>;
  approvalChainId?: string | null;
}

export default function PlaybookDetailPage({ params }: { params: Promise<{ id: string; playbookId: string }> }) {
  const { id: outcomeTypeId, playbookId } = use(params);
  const router = useRouter();
  const [pb, setPb] = useState<PlaybookDetail | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/orgs/playbooks/${playbookId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setPb)
      .catch(() => {});
  }, [playbookId]);

  async function activate() {
    setBusy(true);
    try {
      await fetch(`/api/orgs/playbooks/${playbookId}/activate`, { method: 'POST' });
      router.refresh();
      const r = await fetch(`/api/orgs/playbooks/${playbookId}`, { cache: 'no-store' });
      setPb(await r.json());
    } finally {
      setBusy(false);
    }
  }

  if (!pb) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{pb.name}</h1>
          <Badge>{`v${pb.version}`}</Badge>
          <Badge>{pb.status}</Badge>
          <span className="text-xs text-gray-400">via {pb.source}</span>
        </div>
        {pb.summary && <p className="mt-1 text-sm text-gray-500">{pb.summary}</p>}
      </div>

      {pb.status === 'draft' && (
        <Card>
          <div className="flex items-center justify-between p-4">
            <div className="text-sm">This playbook is a draft. Activate it to start running outcome instances against it.</div>
            <button onClick={activate} disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Activate
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4">
          <h2 className="font-medium">Procedure</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm">
            {(pb.procedureSteps ?? []).map((s) => (
              <li key={s.sequence}>
                <div className="font-medium">{s.title} {s.requiresApproval && <Badge>approval</Badge>}</div>
                {s.description && <div className="text-gray-500">{s.description}</div>}
              </li>
            ))}
            {(pb.procedureSteps ?? []).length === 0 && <li className="text-gray-500">No steps yet.</li>}
          </ol>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-medium">System bindings</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(pb.bindings ?? []).map((b) => (
              <li key={b.id}>
                <strong>{b.role}</strong> →{' '}
                {b.connectorInstanceId ? <code className="text-xs">{b.connectorInstanceId.slice(0, 8)}…</code> : <span className="text-orange-600">unresolved</span>}
              </li>
            ))}
            {(pb.bindings ?? []).length === 0 && <li className="text-gray-500">No system bindings.</li>}
          </ul>
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-medium">Required documents</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(pb.documents ?? []).map((d) => (
              <li key={d.id}>
                <code className="text-xs">{d.documentTemplateId.slice(0, 8)}…</code>{' '}
                {d.required && <Badge>required</Badge>}
              </li>
            ))}
            {(pb.documents ?? []).length === 0 && <li className="text-gray-500">No required documents.</li>}
          </ul>
        </div>
      </Card>

      {pb.approvalChainId && (
        <Card>
          <div className="p-4 text-sm">
            Approval chain: <code className="text-xs">{pb.approvalChainId}</code>
          </div>
        </Card>
      )}
    </div>
  );
}
