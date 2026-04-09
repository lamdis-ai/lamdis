/**
 * Playbook Discovery Types
 *
 * Three input modes (chat interview, admin wizard, SOP file upload)
 * converge on a single PlaybookDraft that the composer normalizes and the
 * activation service promotes to an active OutcomePlaybook.
 */

export type PlaybookDraftSource = 'chat' | 'wizard' | 'import' | 'observed';

export interface DraftStep {
  /** Sequence number, 1-based. */
  sequence: number;
  title: string;
  description?: string;
  /** Human label for the system this step uses (resolved later). */
  systemHint?: string;
  /** Human label for the document this step produces or consumes. */
  documentHint?: string;
  /** Free-text role of the approver this step needs, if any. */
  approverHint?: string;
  requiresApproval?: boolean;
  successCriteria?: string[];
}

export interface DraftSystem {
  /** Free-text label as the customer described it ('Google Drive folder /Credentialing'). */
  label: string;
  /** Best-guess connector type key ('google_drive', 'salesforce', ...). */
  connectorTypeKey?: string;
  /** Role this system plays in the playbook. */
  bindingRole: 'document_store' | 'approver_directory' | 'evidence_archive' | 'notification' | 'signature' | 'crm' | 'fax' | 'custom';
  config?: Record<string, unknown>;
}

export interface DraftApprover {
  /** Free-text role label ('Credentialing Director'). */
  roleLabel: string;
  /** Optional named users — emails or names. */
  members?: Array<{ name?: string; email?: string }>;
  /** Where in the procedure this approver gates work (sequence number). */
  appliesAtStep?: number;
  parallelMode?: 'unanimous' | 'quorum' | 'first_responder';
}

export interface DraftDocument {
  /** Stable key proposed by the discovery service ('state_license'). */
  key: string;
  name: string;
  description?: string;
  required?: boolean;
}

export interface PlaybookDraft {
  source: PlaybookDraftSource;
  outcomeTypeId: string;
  orgId: string;
  name: string;
  summary?: string;
  steps: DraftStep[];
  systems: DraftSystem[];
  approvers: DraftApprover[];
  documents: DraftDocument[];
  guidelines?: Record<string, unknown>;
  createdBy?: string;
  /** Free-form notes the discovery service couldn't structure. */
  unresolved?: string[];
}
