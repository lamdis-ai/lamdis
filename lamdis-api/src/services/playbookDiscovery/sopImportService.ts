/**
 * SOP Import Service
 *
 * Accepts a customer-uploaded SOP / runbook of any file type, extracts text
 * (or raw bytes for non-text formats), then asks Bedrock Claude to produce a
 * structured PlaybookDraft. Anything the model can't structure ends up in
 * `unresolved` for the user to fix during confirmation.
 */

import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import type { PlaybookDraft } from './types.js';

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

export interface SopImportInput {
  orgId: string;
  outcomeTypeId: string;
  outcomeTypeName: string;
  /** Original filename for the prompt context. */
  fileName: string;
  /** Best-effort extracted text. For binary files this may be a placeholder. */
  extractedText: string;
  /** Optional base64 of the original bytes for image/PDF passes (deferred). */
  rawBase64?: string;
  createdBy?: string;
}

const SYSTEM_PROMPT = `You are a process-extraction assistant for Lamdis. Your job is to read a customer's Standard Operating Procedure document and produce a structured Outcome Playbook draft.

Extract:
- name, summary
- ordered procedure steps (sequence, title, description, requiresApproval if obvious)
- systems mentioned (Google Drive, Salesforce, Slack, DocuSign, fax, etc.) with bindingRole
- approver roles (e.g. "Credentialing Director")
- required documents (e.g. "state license", "NPI verification")

Respond with ONLY a JSON object matching this schema (no markdown, no preamble):
{
  "name": "...",
  "summary": "...",
  "steps": [{ "sequence": 1, "title": "...", "description": "...", "requiresApproval": false }],
  "systems": [{ "label": "...", "connectorTypeKey": "google_drive", "bindingRole": "document_store" }],
  "approvers": [{ "roleLabel": "...", "members": [{"email": "..."}] }],
  "documents": [{ "key": "...", "name": "...", "required": true }],
  "unresolved": ["free-form notes about anything you couldn't structure"]
}

Use bindingRole values from: document_store, approver_directory, evidence_archive, notification, signature, crm, fax, custom.
Use connectorTypeKey values from: google_drive, salesforce, slack, docusign, fax_http, generic_http (or omit if uncertain).`;

function safeParseJson(raw: string): any {
  try {
    return JSON.parse(raw.trim());
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fallthrough */ }
    }
    return null;
  }
}

export const sopImportService = {
  async buildDraft(input: SopImportInput): Promise<PlaybookDraft> {
    const userPrompt = `Outcome type: ${input.outcomeTypeName}
File: ${input.fileName}

--- DOCUMENT START ---
${input.extractedText.slice(0, 60_000)}
--- DOCUMENT END ---

Produce the JSON playbook draft now.`;

    const response = await bedrockChatOnce({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: userPrompt }],
      system: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.2,
      meterContext: {
        orgId: input.orgId,
        serviceKey: 'sopImport.buildDraft',
        outcomeTypeId: input.outcomeTypeId,
        userId: input.createdBy,
      },
    });

    const parsed = safeParseJson(response);
    if (!parsed) {
      // Fallback: store the entire response as one unresolved blob.
      return {
        source: 'import',
        orgId: input.orgId,
        outcomeTypeId: input.outcomeTypeId,
        name: `${input.outcomeTypeName} (imported draft)`,
        summary: 'SOP import could not be structured automatically.',
        steps: [],
        systems: [],
        approvers: [],
        documents: [],
        unresolved: ['LLM response was not valid JSON', response.slice(0, 1000)],
        createdBy: input.createdBy,
      };
    }

    return {
      source: 'import',
      orgId: input.orgId,
      outcomeTypeId: input.outcomeTypeId,
      name: parsed.name || `${input.outcomeTypeName} (imported draft)`,
      summary: parsed.summary,
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      systems: Array.isArray(parsed.systems) ? parsed.systems : [],
      approvers: Array.isArray(parsed.approvers) ? parsed.approvers : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
      createdBy: input.createdBy,
    };
  },
};
