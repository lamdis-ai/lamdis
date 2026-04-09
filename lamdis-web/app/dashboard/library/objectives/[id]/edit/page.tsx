"use client";
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import OutcomeWizardForm, { type OutcomeFormData } from '@/components/outcomes/OutcomeWizardForm';

export const dynamic = 'force-dynamic';

export default function EditOutcomePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<Partial<OutcomeFormData> | null>(null);
  const [originalProofIds, setOriginalProofIds] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/orgs/outcomes/${id}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/orgs/outcomes/${id}/proof-expectations`, { cache: 'no-store' }).then(r => r.json()),
    ])
      .then(([outcome, proofs]) => {
        const proofList = Array.isArray(proofs) ? proofs : [];
        setOriginalProofIds(proofList.map((p: any) => p.id));
        setInitialData({
          name: outcome.name || '',
          description: outcome.description || '',
          riskClass: outcome.riskClass || 'medium',
          category: outcome.category || 'operational',
          successCriteria: (outcome.successCriteria || []).map((c: any) => ({
            id: c.id || crypto.randomUUID(),
            name: c.name || '',
            description: c.description || '',
            threshold: c.threshold ?? 0.95,
            unit: c.unit || '%',
          })),
          keyDecisions: (outcome.keyDecisions || []).map((d: any) => ({
            id: d.id || crypto.randomUUID(),
            name: d.name || '',
            description: d.description || '',
            automationMode: d.automationMode || 'supervised',
            requiresHumanApproval: d.requiresHumanApproval ?? false,
          })),
          boundaries: (outcome.automationBoundaries || []).map((b: any) => ({
            id: b.id || crypto.randomUUID(),
            name: b.name || '',
            description: b.description || '',
            maxAutonomyLevel: b.maxAutonomyLevel || 'supervised',
            escalationTrigger: b.escalationTrigger || '',
          })),
          proofExpectations: proofList.map((p: any) => ({
            id: p.id,
            name: p.name || '',
            proofType: p.checkType || 'event_presence',
            description: p.description || '',
            required: p.severity === 'error',
          })),
          connectedSystems: (outcome.connectedSystems || []).map((s: any) => ({
            id: s.id || crypto.randomUUID(),
            systemId: s.systemId,
            name: s.name || '',
            role: s.role || '',
            endpoint: s.endpoint || '',
          })),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleEdit = async (data: OutcomeFormData) => {
    // Update the outcome type
    const res = await fetch(`/api/orgs/outcomes/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        riskClass: data.riskClass,
        category: data.category,
        successCriteria: data.successCriteria.filter(c => c.name.trim()).map(({ id: _id, ...rest }) => rest),
        keyDecisions: data.keyDecisions.filter(d => d.name.trim()).map(({ id: _id, ...rest }) => rest),
        automationBoundaries: data.boundaries.filter(b => b.name.trim()).map(({ id: _id, ...rest }) => rest),
        connectedSystems: data.connectedSystems.filter(s => s.name.trim()).map(({ id: _id, ...rest }) => rest),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Failed to update objective (${res.status})`);
    }

    // Sync proof expectations: diff old vs new
    const validProofs = data.proofExpectations.filter(p => p.name.trim());
    const newProofIds = new Set(validProofs.map(p => p.id));

    // Delete removed proofs
    for (const oldId of originalProofIds) {
      if (!newProofIds.has(oldId)) {
        await fetch(`/api/orgs/outcomes/${id}/proof-expectations/${oldId}`, { method: 'DELETE' });
      }
    }

    // Create new or update existing proofs
    for (const proof of validProofs) {
      if (originalProofIds.includes(proof.id)) {
        // Update existing
        await fetch(`/api/orgs/outcomes/${id}/proof-expectations/${proof.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: proof.name,
            description: proof.description,
            checkType: proof.proofType,
            severity: proof.required ? 'error' : 'warning',
          }),
        });
      } else {
        // Create new
        await fetch(`/api/orgs/outcomes/${id}/proof-expectations`, {
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
    }

    router.push(`/dashboard/library/objectives/${id}`);
  };

  if (loading) return <div className="text-center text-slate-500 py-12">Loading...</div>;
  if (!initialData) return <div className="text-center text-slate-500 py-12">Objective not found</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Link href="/dashboard/library/objectives" className="hover:text-slate-200">Objectives</Link>
          <span>/</span>
          <Link href={`/dashboard/library/objectives/${id}`} className="hover:text-slate-200">Detail</Link>
          <span>/</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Edit Objective</h1>
        <p className="text-sm text-slate-400 mt-1">Modify the objective definition, proof expectations, and connected systems.</p>
      </div>
      <OutcomeWizardForm
        mode="edit"
        initialData={initialData}
        onSubmit={handleEdit}
        submitLabel="Save Changes"
      />
    </div>
  );
}
