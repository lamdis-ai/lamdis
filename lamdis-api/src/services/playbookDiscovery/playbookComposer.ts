/**
 * Playbook Composer
 *
 * Normalizes a PlaybookDraft into the rows needed to insert an
 * outcome_playbooks record at status='draft'. Resolves draft systems
 * against existing connector_instances and approverRoles by fuzzy key
 * match; anything that doesn't resolve is left as a TODO on the playbook
 * for the user to fix during confirmation.
 */

import { db } from '../../db.js';
import {
  outcomePlaybooks,
  playbookSystemBindings,
  playbookDocumentRequirements,
  documentTemplates,
  connectorInstances,
  approverRoles,
  approvalChains,
  type ApprovalChainStep,
  type PlaybookProcedureStep,
  type PlaybookBindingRole,
} from '@lamdis/db/schema';
import { and, eq } from 'drizzle-orm';
import type { PlaybookDraft, DraftSystem, DraftApprover, DraftDocument } from './types.js';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

async function resolveSystem(orgId: string, sys: DraftSystem): Promise<{ connectorInstanceId: string | null }> {
  // Try exact name match against existing connector instances.
  const candidates = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.orgId, orgId));
  const labelLc = sys.label.toLowerCase();
  const exact = candidates.find((c) => c.name.toLowerCase() === labelLc);
  if (exact) return { connectorInstanceId: exact.id };
  const fuzzy = candidates.find((c) => labelLc.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(labelLc));
  return { connectorInstanceId: fuzzy?.id ?? null };
}

async function resolveApproverRole(orgId: string, approver: DraftApprover): Promise<string | null> {
  const key = slugify(approver.roleLabel);
  const [existing] = await db
    .select()
    .from(approverRoles)
    .where(and(eq(approverRoles.orgId, orgId), eq(approverRoles.key, key)))
    .limit(1);
  if (existing) return existing.id;

  // Auto-create a draft role with whatever members the discovery surfaced.
  const [created] = await db
    .insert(approverRoles)
    .values({
      orgId,
      key,
      displayName: approver.roleLabel,
      members: (approver.members ?? []).map((m) => ({
        type: 'user' as const,
        userSub: m.email ?? m.name ?? key,
        email: m.email,
        name: m.name,
      })),
    })
    .returning();
  return created?.id ?? null;
}

async function ensureDocumentTemplate(orgId: string, doc: DraftDocument): Promise<string | null> {
  const [existing] = await db
    .select()
    .from(documentTemplates)
    .where(and(eq(documentTemplates.orgId, orgId), eq(documentTemplates.key, doc.key)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(documentTemplates)
    .values({
      orgId,
      key: doc.key,
      name: doc.name,
      description: doc.description,
    })
    .returning();
  return created?.id ?? null;
}

async function buildApprovalChain(orgId: string, draft: PlaybookDraft, roleIdByLabel: Map<string, string>): Promise<string | null> {
  const steps: ApprovalChainStep[] = [];
  for (const a of draft.approvers) {
    const roleId = roleIdByLabel.get(a.roleLabel);
    if (!roleId) continue;
    steps.push({
      roleId,
      mode: a.parallelMode ? 'parallel' : 'serial',
      parallelMode: a.parallelMode ?? 'unanimous',
    });
  }
  if (steps.length === 0) return null;
  const [chain] = await db
    .insert(approvalChains)
    .values({
      orgId,
      name: `${draft.name} approval chain`,
      description: `Auto-generated from playbook draft (${draft.source})`,
      steps,
    })
    .returning();
  return chain?.id ?? null;
}

export const playbookComposer = {
  async compose(draft: PlaybookDraft): Promise<{ playbookId: string; unresolved: string[] }> {
    const unresolved: string[] = [...(draft.unresolved ?? [])];

    // 1. Resolve approver roles (auto-create as needed).
    const roleIdByLabel = new Map<string, string>();
    for (const a of draft.approvers) {
      const roleId = await resolveApproverRole(draft.orgId, a);
      if (roleId) roleIdByLabel.set(a.roleLabel, roleId);
      else unresolved.push(`Could not resolve approver role: ${a.roleLabel}`);
    }

    // 2. Build approval chain if approvers exist.
    const approvalChainId = await buildApprovalChain(draft.orgId, draft, roleIdByLabel);

    // 3. Build procedure steps.
    const procedureSteps: PlaybookProcedureStep[] = draft.steps.map((s) => ({
      id: `step-${s.sequence}`,
      sequence: s.sequence,
      title: s.title,
      description: s.description,
      requiresApproval: s.requiresApproval,
      successCriteria: s.successCriteria,
      bindingRole: s.systemHint ? 'document_store' : undefined,
    }));

    // 4. Insert the playbook (draft status; user must confirm).
    const nextVersion = await nextDraftVersion(draft.orgId, draft.outcomeTypeId);
    const [playbook] = await db
      .insert(outcomePlaybooks)
      .values({
        orgId: draft.orgId,
        outcomeTypeId: draft.outcomeTypeId,
        version: nextVersion,
        status: 'draft',
        name: draft.name,
        summary: draft.summary,
        source: draft.source,
        procedureSteps,
        approvalChainId,
        guidelines: draft.guidelines ?? {},
        createdBy: draft.createdBy,
      })
      .returning();
    if (!playbook) throw new Error('Failed to insert playbook');

    // 5. Bind systems.
    for (const sys of draft.systems) {
      const resolved = await resolveSystem(draft.orgId, sys);
      if (!resolved.connectorInstanceId) {
        unresolved.push(`Could not bind system: ${sys.label} (install a ${sys.connectorTypeKey ?? 'matching'} connector first)`);
      }
      await db.insert(playbookSystemBindings).values({
        orgId: draft.orgId,
        playbookId: playbook.id,
        role: sys.bindingRole as PlaybookBindingRole,
        connectorInstanceId: resolved.connectorInstanceId,
        config: sys.config ?? {},
      });
    }

    // 6. Document requirements.
    for (const doc of draft.documents) {
      const docId = await ensureDocumentTemplate(draft.orgId, doc);
      if (!docId) continue;
      await db.insert(playbookDocumentRequirements).values({
        orgId: draft.orgId,
        playbookId: playbook.id,
        documentTemplateId: docId,
        required: doc.required ?? true,
      });
    }

    return { playbookId: playbook.id, unresolved };
  },
};

async function nextDraftVersion(orgId: string, outcomeTypeId: string): Promise<number> {
  const rows = await db
    .select({ version: outcomePlaybooks.version })
    .from(outcomePlaybooks)
    .where(and(eq(outcomePlaybooks.orgId, orgId), eq(outcomePlaybooks.outcomeTypeId, outcomeTypeId)));
  const max = rows.reduce((m, r) => Math.max(m, r.version ?? 0), 0);
  return max + 1;
}
