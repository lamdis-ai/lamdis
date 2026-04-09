"use client";
import { useRouter } from 'next/navigation';
import OutcomeWizardForm, { type OutcomeFormData } from '@/components/outcomes/OutcomeWizardForm';

export const dynamic = 'force-dynamic';

export default function NewOutcomePage() {
  const router = useRouter();

  const handleCreate = async (data: OutcomeFormData) => {
    const res = await fetch('/api/orgs/outcomes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        riskClass: data.riskClass,
        category: data.category,
        successCriteria: data.successCriteria.filter(c => c.name.trim()).map(({ id, ...rest }) => rest),
        keyDecisions: data.keyDecisions.filter(d => d.name.trim()).map(({ id, ...rest }) => rest),
        automationBoundaries: data.boundaries.filter(b => b.name.trim()).map(({ id, ...rest }) => rest),
        connectedSystems: data.connectedSystems.filter(s => s.name.trim()).map(({ id, ...rest }) => rest),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Failed to create objective (${res.status})`);
    }
    const created = await res.json();

    // Create proof expectations
    const validProofs = data.proofExpectations.filter(p => p.name.trim());
    for (const proof of validProofs) {
      await fetch(`/api/orgs/outcomes/${created.id}/proof-expectations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: proof.name,
          description: proof.description,
          checkType: proof.proofType,
          severity: proof.required ? 'error' : 'warning',
        }),
      });
    }

    router.push(`/dashboard/library/objectives/${created.id}`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">New Objective</h1>
        <p className="text-sm text-slate-400 mt-1">Define a business objective, what success looks like, and how to prove it.</p>
      </div>
      <OutcomeWizardForm
        mode="create"
        onSubmit={handleCreate}
        submitLabel="Create Objective"
      />
    </div>
  );
}
