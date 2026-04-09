/**
 * Wizard Discovery Service
 *
 * Validates a structured payload from the admin onboarding wizard and
 * produces a normalized PlaybookDraft. The wizard form is the most
 * deterministic discovery path: every field maps 1:1 to a draft field.
 */

import { z } from 'zod';
import type { PlaybookDraft } from './types.js';

const stepSchema = z.object({
  sequence: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  systemHint: z.string().optional(),
  documentHint: z.string().optional(),
  approverHint: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  successCriteria: z.array(z.string()).optional(),
});

const systemSchema = z.object({
  label: z.string().min(1),
  connectorTypeKey: z.string().optional(),
  bindingRole: z.enum(['document_store', 'approver_directory', 'evidence_archive', 'notification', 'signature', 'crm', 'fax', 'custom']),
  config: z.record(z.unknown()).optional(),
});

const approverSchema = z.object({
  roleLabel: z.string().min(1),
  members: z.array(z.object({ name: z.string().optional(), email: z.string().email().optional() })).optional(),
  appliesAtStep: z.number().int().min(1).optional(),
  parallelMode: z.enum(['unanimous', 'quorum', 'first_responder']).optional(),
});

const documentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

export const wizardPayloadSchema = z.object({
  orgId: z.string().uuid(),
  outcomeTypeId: z.string().uuid(),
  name: z.string().min(1),
  summary: z.string().optional(),
  steps: z.array(stepSchema).min(1),
  systems: z.array(systemSchema).default([]),
  approvers: z.array(approverSchema).default([]),
  documents: z.array(documentSchema).default([]),
  guidelines: z.record(z.unknown()).optional(),
  createdBy: z.string().optional(),
});

export type WizardPayload = z.infer<typeof wizardPayloadSchema>;

export const wizardDiscoveryService = {
  buildDraft(payload: unknown): PlaybookDraft {
    const parsed = wizardPayloadSchema.parse(payload);
    return {
      ...parsed,
      source: 'wizard',
    };
  },
};
