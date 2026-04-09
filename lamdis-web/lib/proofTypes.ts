export interface ProofTypeConfig {
  value: string;
  label: string;
  description: string;
  example: string;
}

export const PROOF_TYPE_CONFIG: ProofTypeConfig[] = [
  {
    value: 'event_presence',
    label: 'Event received',
    description: 'A specific event type was received',
    example: 'e.g., "payment.completed" event arrived',
  },
  {
    value: 'event_sequence',
    label: 'Event sequence',
    description: 'Multiple events arrived in expected order',
    example: 'e.g., identity.verified → credit.approved → funds.disbursed',
  },
  {
    value: 'confirmation_level',
    label: 'Confirmation level',
    description: 'Evidence reached minimum confirmation grade (A-E)',
    example: 'e.g., at least grade B confirmation from two independent sources',
  },
  {
    value: 'judge',
    label: 'LLM judge',
    description: 'An LLM evaluates evidence against a rubric',
    example: 'e.g., judge scores compliance narrative ≥ 0.8',
  },
  {
    value: 'includes',
    label: 'Text match',
    description: 'Evidence payload contains expected text',
    example: 'e.g., response body includes "APPROVED"',
  },
  {
    value: 'regex',
    label: 'Pattern match',
    description: 'Evidence payload matches a regex pattern',
    example: 'e.g., status field matches /^(approved|completed)$/',
  },
  {
    value: 'json_path',
    label: 'Data field check',
    description: 'A specific JSON field has expected value',
    example: 'e.g., $.result.decision === "accept"',
  },
  {
    value: 'timing',
    label: 'Timing constraint',
    description: 'Event arrived within time window',
    example: 'e.g., response received within 30 seconds of request',
  },
];

export const PROOF_TYPE_MAP = Object.fromEntries(
  PROOF_TYPE_CONFIG.map((pt) => [pt.value, pt])
) as Record<string, ProofTypeConfig>;

export function getProofTypeLabel(value: string): string {
  return PROOF_TYPE_MAP[value]?.label || value.replace(/_/g, ' ');
}
