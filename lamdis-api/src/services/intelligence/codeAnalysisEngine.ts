/**
 * Code Analysis Engine
 *
 * Uses LLMs with long context to analyze customer code and:
 *
 * 1. Discover workflows — identify business processes/workflows in code
 * 2. Map code to policies — understand how code paths relate to policy requirements
 * 3. Suggest instrumentation — generate precise SDK insertion points
 * 4. Detect boundaries — find where visibility ends (external calls, async queues, etc.)
 *
 * This is NOT static analysis. It uses the LLM's reasoning ability to understand
 * business logic, not just syntax. A regex parser can find HTTP calls; this engine
 * understands that a specific HTTP call is "transferring a customer to escalation
 * because self-harm was mentioned."
 *
 * Architecture:
 *   discoverWorkflows  — scan code for business workflows
 *   mapCodeToPolicies     — given policies, find where code implements/violates them
 *   suggestInstrumentation — generate specific SDK code insertions
 *   detectBoundaries      — find where observability stops
 *   analyzeCodeForInteraction — full pipeline for one interaction
 */

import { bedrockChatOnce, type ChatMessage } from '../../lib/bedrockChat.js';
import type { MeterContext } from '../llmCostControl/index.js';

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001-v1:0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeSubmission {
  /** The code to analyze */
  code: string;
  /** File path or name (for context) */
  filePath?: string;
  /** Language (typescript, python, java, go, etc.) */
  language?: string;
  /** Optional: description of what this code does */
  description?: string;
  /** Optional: related files' code for broader context */
  relatedCode?: Array<{ filePath: string; code: string }>;
}

export interface DiscoveredWorkflow {
  name: string;
  description: string;
  category: string;
  codeLocations: Array<{
    filePath: string;
    startLine?: number;
    endLine?: number;
    functionName?: string;
    description: string;
  }>;
  actors: string[];
  expectedEventTypes: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CodePolicyMapping {
  policyRequirement: string;
  implementationStatus: 'implemented' | 'partially_implemented' | 'not_implemented' | 'unclear';
  codeEvidence: Array<{
    filePath: string;
    lineRange?: string;
    snippet: string;
    explanation: string;
  }>;
  gaps: string[];
  suggestedChecks: Array<{
    name: string;
    checkType: string;
    rationale: string;
  }>;
}

export interface InstrumentationPoint {
  filePath: string;
  insertAfterLine?: number;
  insertionContext: string;
  eventType: string;
  confirmationLevel: string;
  sdkCode: string;
  explanation: string;
  importance: 'critical' | 'recommended' | 'optional';
}

export interface DetectedBoundary {
  name: string;
  boundaryType: 'external_api' | 'async_queue' | 'database' | 'third_party' | 'microservice';
  location: {
    filePath: string;
    lineRange?: string;
    functionName?: string;
  };
  description: string;
  visibilityEndsAt: string;
  confirmationAvailable: string;
  suggestedMitigation: string;
}

// ---------------------------------------------------------------------------
// 1. Discover workflows in code
// ---------------------------------------------------------------------------

export async function discoverWorkflows(submission: CodeSubmission, meterContext: MeterContext): Promise<DiscoveredWorkflow[]> {
  const codeBlock = formatCodeForPrompt(submission);

  const systemPrompt = `You are an expert at understanding business logic in code. Your job is to identify distinct business workflows/processes/journeys in the provided code.

A "workflow" is a traceable business process that a human would recognize, such as:
- "Customer Requests Account Closure"
- "Agent Handles Refund Request"
- "System Processes Payment"
- "User Reports Harmful Content"

Look for:
- HTTP endpoint handlers (routes, controllers)
- Event handlers / message processors
- Workflow orchestrations
- Business logic functions with clear input → processing → output patterns
- Decision trees that affect users or data
- Integration points that trigger downstream actions

Do NOT identify low-level utilities, helpers, or infrastructure code as workflows.

Return ONLY a valid JSON array:
[{
  "name": "Human-readable interaction name",
  "description": "What this interaction does",
  "category": "compliance|safety|quality|security|operational",
  "codeLocations": [{
    "filePath": "file path",
    "startLine": number or null,
    "endLine": number or null,
    "functionName": "function or method name",
    "description": "what this code location does in the workflow"
  }],
  "actors": ["user", "agent", "system", etc.],
  "expectedEventTypes": ["event types that should be emitted"],
  "confidence": "high|medium|low"
}]`;

  const userPrompt = `Analyze this code and identify all business workflows/processes:

${codeBlock}

Identify every distinct business workflow. For each one, trace the code path from trigger to completion and identify the actors, systems, and events involved.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 4096,
    meterContext: { ...meterContext, serviceKey: 'codeAnalysis.discoverWorkflows' },
  });

  return parseJsonResponse<DiscoveredWorkflow[]>(response);
}

// ---------------------------------------------------------------------------
// 2. Map code to policy requirements
// ---------------------------------------------------------------------------

export async function mapCodeToPolicies(
  submission: CodeSubmission,
  policies: Array<{ name: string; description: string }>,
  meterContext: MeterContext,
): Promise<CodePolicyMapping[]> {
  const codeBlock = formatCodeForPrompt(submission);

  const systemPrompt = `You are a compliance analyst who reads code. Given a set of policy requirements and source code, determine how well the code implements each policy.

For each policy, find:
1. Code that implements or enforces the policy
2. Gaps where the policy is NOT enforced
3. Suggested checks that would verify compliance at runtime

Implementation statuses:
- "implemented": Code clearly enforces this policy
- "partially_implemented": Some aspects are covered, but gaps exist
- "not_implemented": No code found that addresses this policy
- "unclear": Code exists but it's ambiguous whether it satisfies the policy

Return ONLY a valid JSON array:
[{
  "policyRequirement": "the policy name",
  "implementationStatus": "implemented|partially_implemented|not_implemented|unclear",
  "codeEvidence": [{
    "filePath": "file",
    "lineRange": "10-25",
    "snippet": "relevant code snippet (max 5 lines)",
    "explanation": "how this code relates to the policy"
  }],
  "gaps": ["list of gaps or missing enforcement points"],
  "suggestedChecks": [{
    "name": "check name",
    "checkType": "judge|event_presence|event_sequence|etc",
    "rationale": "why this check would verify compliance"
  }]
}]`;

  const policiesText = policies.map((p, i) => `${i + 1}. ${p.name}: ${p.description}`).join('\n');

  const userPrompt = `Analyze how this code implements (or fails to implement) these policy requirements:

POLICIES:
${policiesText}

CODE:
${codeBlock}

For each policy, trace through the code to find implementation evidence, identify gaps, and suggest runtime checks.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 4096,
    meterContext: { ...meterContext, serviceKey: 'codeAnalysis.mapCodeToPolicies' },
  });

  return parseJsonResponse<CodePolicyMapping[]>(response);
}

// ---------------------------------------------------------------------------
// 3. Suggest instrumentation points
// ---------------------------------------------------------------------------

export async function suggestInstrumentation(
  submission: CodeSubmission,
  workflowName: string,
  requiredEventTypes: string[],
  meterContext: MeterContext,
  existingChecks?: Array<{ name: string; checkType: string; requiredEvidenceLevel: string }>,
): Promise<InstrumentationPoint[]> {
  const codeBlock = formatCodeForPrompt(submission);

  const systemPrompt = `You are a developer experience expert who helps engineers instrument their code with the Lamdis SDK.

Your job is to identify the EXACT locations in the code where SDK event emissions should be inserted, and generate the code to insert.

The Lamdis SDK:
\`\`\`typescript
// Assuming 'instance' is an InteractionInstance, available via middleware or context
await instance.emit('event.type', { /* payload */ }, { level: 'A' });
\`\`\`

Confirmation levels:
- 'A': After a decision is made (e.g., "decided to escalate")
- 'B': After an outbound call is initiated (e.g., "called POST /transfer")
- 'C': After receiving a success response (e.g., "transfer API returned 200")
- 'D': After reading back source-of-truth state (e.g., "account status is now 'closed'")
- 'E': After full end-to-end confirmation (e.g., "closure confirmed, notification sent, audit logged")

Rules:
- Place events AT the right code location, not before or after
- Use the actual variable names from the customer's code in the payload
- Choose the right confirmation level based on what just happened
- Mark critical events (needed for policy checks) as importance: "critical"
- Mark nice-to-have observability as importance: "optional"

Return ONLY a valid JSON array:
[{
  "filePath": "file path",
  "insertAfterLine": line number or null,
  "insertionContext": "human description of where to insert (e.g., 'after the escalation ticket is created')",
  "eventType": "event.type",
  "confirmationLevel": "A|B|C|D|E",
  "sdkCode": "exact TypeScript/JavaScript code to insert",
  "explanation": "why this event is needed here",
  "importance": "critical|recommended|optional"
}]`;

  const checksContext = existingChecks
    ? `\nPolicy checks that need evidence:\n${existingChecks.map(c => `- ${c.name} (${c.checkType}, needs level ${c.requiredEvidenceLevel})`).join('\n')}`
    : '';

  const userPrompt = `Instrument this code for the "${workflowName}" interaction.

Required event types: ${requiredEventTypes.join(', ')}
${checksContext}

CODE:
${codeBlock}

Find the exact locations where each event should be emitted. Use the actual variable names and context from the code. Generate insertable SDK code.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 4096,
    meterContext: { ...meterContext, serviceKey: 'codeAnalysis.suggestInstrumentation' },
  });

  return parseJsonResponse<InstrumentationPoint[]>(response);
}

// ---------------------------------------------------------------------------
// 4. Detect boundaries
// ---------------------------------------------------------------------------

export async function detectBoundaries(submission: CodeSubmission, meterContext: MeterContext): Promise<DetectedBoundary[]> {
  const codeBlock = formatCodeForPrompt(submission);

  const systemPrompt = `You are a distributed systems expert. Analyze code to find where observability ends — places where the system makes calls to external services, sends messages to queues, or hands off to systems that Lamdis cannot directly observe.

A "boundary" is where Lamdis can see that a request was made but CANNOT see what happened on the other side.

Types:
- external_api: HTTP calls to third-party or external services
- async_queue: Messages sent to queues (Kafka, SQS, RabbitMQ, NATS)
- database: Direct database writes where the DB is the source of truth
- third_party: Calls to vendor APIs (Stripe, Twilio, SendGrid, etc.)
- microservice: Calls to internal microservices not instrumented with Lamdis

For each boundary, note:
- What confirmation level is available at the boundary (usually B or C)
- How to mitigate the visibility gap (instrument the downstream service, add readback, etc.)

Return ONLY a valid JSON array:
[{
  "name": "Human-readable boundary name",
  "boundaryType": "external_api|async_queue|database|third_party|microservice",
  "location": {
    "filePath": "file",
    "lineRange": "10-15",
    "functionName": "function name"
  },
  "description": "What happens at this boundary",
  "visibilityEndsAt": "What Lamdis can see (e.g., 'outbound HTTP request sent')",
  "confirmationAvailable": "What level of confirmation is achievable (e.g., 'Level C - got 200 response')",
  "suggestedMitigation": "How to extend visibility (e.g., 'Instrument downstream service' or 'Add readback after write')"
}]`;

  const userPrompt = `Analyze this code for visibility boundaries:

${codeBlock}

Find every place where the system communicates with external services, queues, databases, or other systems. These are the boundaries where Lamdis observability ends.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 4096,
    meterContext: { ...meterContext, serviceKey: 'codeAnalysis.detectBoundaries' },
  });

  return parseJsonResponse<DetectedBoundary[]>(response);
}

// ---------------------------------------------------------------------------
// 5. Full analysis pipeline for an interaction
// ---------------------------------------------------------------------------

export interface FullCodeAnalysis {
  discoveredWorkflows: DiscoveredWorkflow[];
  boundaries: DetectedBoundary[];
  instrumentationPoints: InstrumentationPoint[];
  policyMappings?: CodePolicyMapping[];
}

/**
 * Full code analysis pipeline:
 * 1. Discover workflows in the code
 * 2. Detect boundaries
 * 3. For each discovered workflow, suggest instrumentation
 * 4. Optionally map to existing policies
 */
export async function analyzeCode(
  submission: CodeSubmission,
  meterContext: MeterContext,
  existingPolicies?: Array<{ name: string; description: string }>,
): Promise<FullCodeAnalysis> {
  // Run discovery and boundary detection in parallel
  const [discoveredWorkflows, boundaries] = await Promise.all([
    discoverWorkflows(submission, meterContext),
    detectBoundaries(submission, meterContext),
  ]);

  // For each discovered workflow, suggest instrumentation
  const allInstrumentationPoints: InstrumentationPoint[] = [];
  for (const wf of discoveredWorkflows) {
    const points = await suggestInstrumentation(
      submission,
      wf.name,
      wf.expectedEventTypes,
      meterContext,
    );
    allInstrumentationPoints.push(...points);
  }

  // Optionally map to existing policies
  let policyMappings: CodePolicyMapping[] | undefined;
  if (existingPolicies && existingPolicies.length > 0) {
    policyMappings = await mapCodeToPolicies(submission, existingPolicies, meterContext);
  }

  return {
    discoveredWorkflows,
    boundaries,
    instrumentationPoints: allInstrumentationPoints,
    policyMappings,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatCodeForPrompt(submission: CodeSubmission): string {
  const lang = submission.language || inferLanguage(submission.filePath);
  let block = '';

  if (submission.filePath) {
    block += `--- ${submission.filePath} ---\n`;
  }
  block += `\`\`\`${lang}\n${submission.code.slice(0, 30000)}\n\`\`\`\n`;

  if (submission.relatedCode) {
    for (const related of submission.relatedCode) {
      const relLang = inferLanguage(related.filePath);
      block += `\n--- ${related.filePath} ---\n`;
      block += `\`\`\`${relLang}\n${related.code.slice(0, 15000)}\n\`\`\`\n`;
    }
  }

  if (submission.description) {
    block = `Description: ${submission.description}\n\n${block}`;
  }

  return block;
}

function inferLanguage(filePath?: string): string {
  if (!filePath) return 'typescript';
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby',
    cs: 'csharp', php: 'php', kt: 'kotlin', swift: 'swift',
  };
  return langMap[ext || ''] || 'typescript';
}

function parseJsonResponse<T>(response: string): T {
  const raw = response.trim()
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```\s*$/, '');
  return JSON.parse(raw) as T;
}
