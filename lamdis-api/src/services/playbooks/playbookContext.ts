/**
 * Playbook Context Loader
 *
 * Loads the active outcome playbook for an outcome instance, including its
 * procedure steps, system bindings, document requirements, and approval
 * chain reference. Used by the orchestrator, planner, proof evaluator,
 * action proposer, and dossier generator to make customer-specific
 * decisions instead of generic ones.
 */

import { db } from '../../db.js';
import {
  outcomePlaybooks,
  outcomeInstances,
  outcomeTypes,
  playbookSystemBindings,
  playbookDocumentRequirements,
  documentTemplates,
  type PlaybookProcedureStep,
  type PlaybookBindingRole,
} from '@lamdis/db/schema';
import { and, eq } from 'drizzle-orm';

export interface PlaybookContext {
  playbookId: string;
  version: number;
  outcomeTypeId: string;
  name: string;
  summary: string | null;
  procedureSteps: PlaybookProcedureStep[];
  approvalChainId: string | null;
  bindings: Array<{
    id: string;
    role: PlaybookBindingRole;
    connectorInstanceId: string | null;
    dynamicToolId: string | null;
    config: Record<string, unknown>;
  }>;
  documentRequirements: Array<{
    id: string;
    documentTemplateId: string;
    documentKey: string;
    documentName: string;
    required: boolean;
  }>;
  guidelines: Record<string, unknown>;
}

export async function loadPlaybookContextForInstance(instanceId: string): Promise<PlaybookContext | null> {
  const [instance] = await db
    .select()
    .from(outcomeInstances)
    .where(eq(outcomeInstances.id, instanceId))
    .limit(1);
  if (!instance) return null;

  let playbookId = instance.activePlaybookId ?? null;

  if (!playbookId && instance.outcomeTypeId) {
    // Fall back to the outcome type's default playbook.
    const [type] = await db
      .select()
      .from(outcomeTypes)
      .where(eq(outcomeTypes.id, instance.outcomeTypeId))
      .limit(1);
    playbookId = type?.defaultPlaybookId ?? null;
  }
  if (!playbookId) return null;

  return loadPlaybookContext(playbookId);
}

export async function loadPlaybookContext(playbookId: string): Promise<PlaybookContext | null> {
  const [pb] = await db
    .select()
    .from(outcomePlaybooks)
    .where(eq(outcomePlaybooks.id, playbookId))
    .limit(1);
  if (!pb) return null;

  const bindings = await db
    .select()
    .from(playbookSystemBindings)
    .where(eq(playbookSystemBindings.playbookId, pb.id));

  const requirements = await db
    .select({
      id: playbookDocumentRequirements.id,
      documentTemplateId: playbookDocumentRequirements.documentTemplateId,
      required: playbookDocumentRequirements.required,
      documentKey: documentTemplates.key,
      documentName: documentTemplates.name,
    })
    .from(playbookDocumentRequirements)
    .leftJoin(documentTemplates, eq(documentTemplates.id, playbookDocumentRequirements.documentTemplateId))
    .where(eq(playbookDocumentRequirements.playbookId, pb.id));

  return {
    playbookId: pb.id,
    version: pb.version,
    outcomeTypeId: pb.outcomeTypeId,
    name: pb.name,
    summary: pb.summary,
    procedureSteps: (pb.procedureSteps ?? []) as PlaybookProcedureStep[],
    approvalChainId: pb.approvalChainId,
    bindings: bindings.map((b) => ({
      id: b.id,
      role: b.role as PlaybookBindingRole,
      connectorInstanceId: b.connectorInstanceId,
      dynamicToolId: b.dynamicToolId,
      config: (b.config ?? {}) as Record<string, unknown>,
    })),
    documentRequirements: requirements.map((r) => ({
      id: r.id,
      documentTemplateId: r.documentTemplateId,
      documentKey: r.documentKey ?? '',
      documentName: r.documentName ?? '',
      required: r.required ?? true,
    })),
    guidelines: (pb.guidelines ?? {}) as Record<string, unknown>,
  };
}

/**
 * Build a compact summary string for inclusion in LLM planner prompts.
 * Bindings and requirements are flattened to keep prompt budget small.
 */
export function summarizePlaybookForPrompt(ctx: PlaybookContext): string {
  const lines: string[] = [];
  lines.push(`Playbook: ${ctx.name} (v${ctx.version})`);
  if (ctx.summary) lines.push(`Summary: ${ctx.summary}`);
  if (ctx.procedureSteps.length > 0) {
    lines.push('Procedure:');
    for (const s of ctx.procedureSteps) {
      lines.push(`  ${s.sequence}. ${s.title}${s.requiresApproval ? ' [requires approval]' : ''}`);
    }
  }
  if (ctx.bindings.length > 0) {
    lines.push('Bound systems:');
    for (const b of ctx.bindings) {
      lines.push(`  - ${b.role}: ${b.connectorInstanceId ? `connector instance ${b.connectorInstanceId}` : `tool ${b.dynamicToolId}`}`);
    }
  }
  if (ctx.documentRequirements.length > 0) {
    lines.push('Required documents:');
    for (const r of ctx.documentRequirements) {
      lines.push(`  - ${r.documentName} (${r.documentKey})${r.required ? ' [required]' : ''}`);
    }
  }
  lines.push('Constraints: Use only bound systems. Do not invent new systems or document templates.');
  return lines.join('\n');
}
