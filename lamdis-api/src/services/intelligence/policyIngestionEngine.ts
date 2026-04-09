/**
 * Policy Ingestion Engine
 *
 * Converts unstructured policy inputs (natural language requirements,
 * documents, bad outcomes, regulations) into structured Lamdis objects:
 * - Workflow definitions
 * - Policy checks with confirmation levels
 * - Expected event types
 * - SDK instrumentation snippets
 *
 * This is the "Give Lamdis a requirement" → "Lamdis suggests checks" flow.
 *
 * Architecture:
 *   1. parseRequirement     — Extract intent, interaction name, expected behaviors
 *   2. generateWorkflow  — Create structured workflow definition
 *   3. generatePolicyChecks — Create structured check definitions with confirmation levels
 *   4. generateInstrumentation — Generate SDK code snippets for each event
 *   5. suggestFromRequirement — Orchestrate the full pipeline
 */

import { bedrockChatOnce, type ChatMessage } from '../../lib/bedrockChat.js';
import type { MeterContext } from '../llmCostControl/index.js';

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001-v1:0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyRequirement {
  /** Natural language description of the requirement or bad outcome */
  text: string;
  /** Optional: category hint (compliance, safety, quality, security, operational) */
  category?: string;
  /** Optional: industry context (financial, healthcare, etc.) */
  industry?: string;
  /** Optional: existing code context for smarter suggestions */
  codeContext?: string;
}

export interface SuggestedWorkflow {
  name: string;
  description: string;
  category: string;
  expectedEventTypes: string[];
  timeoutMs: number;
  boundaryNotes: string[];
}

export interface SuggestedCheck {
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
  checkType: string;
  config: Record<string, unknown>;
  requiredEvidenceLevel: string;
  rationale: string;
}

export interface InstrumentationSnippet {
  eventType: string;
  description: string;
  confirmationLevel: string;
  sdkCode: string;
  suggestedLocation: string;
}

export interface PolicySuggestion {
  workflow: SuggestedWorkflow;
  checks: SuggestedCheck[];
  instrumentation: InstrumentationSnippet[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Step 1: Parse the unstructured requirement
// ---------------------------------------------------------------------------

interface ParsedRequirement {
  workflowName: string;
  workflowDescription: string;
  category: string;
  expectedBehaviors: string[];
  failureConditions: string[];
  actorsInvolved: string[];
  systemsInvolved: string[];
  regulatoryContext: string | null;
}

async function parseRequirement(req: PolicyRequirement, meterContext: MeterContext): Promise<ParsedRequirement> {
  const systemPrompt = `You are a policy analysis expert for AI systems. Your job is to parse a natural language requirement, bad outcome, or regulation into a structured analysis.

You work for Lamdis, a platform that monitors AI interactions to ensure they comply with policies. A "workflow" is a business process like "Customer Requests Account Closure" or "Patient Asks About Medication".

Return ONLY a valid JSON object with these fields:
{
  "workflowName": "Human-readable name for this business interaction/journey (e.g., 'Customer Requests Account Closure')",
  "workflowDescription": "1-2 sentence description of the interaction",
  "category": "one of: compliance, safety, quality, security, operational",
  "expectedBehaviors": ["list of things that SHOULD happen in this workflow"],
  "failureConditions": ["list of things that should NOT happen or bad outcomes to prevent"],
  "actorsInvolved": ["list of actors: user, agent, system, supervisor, etc."],
  "systemsInvolved": ["list of systems/services that would be involved"],
  "regulatoryContext": "relevant regulation if any, or null"
}`;

  const userPrompt = `Analyze this requirement and extract structured information:

Requirement: "${req.text}"
${req.category ? `Category hint: ${req.category}` : ''}
${req.industry ? `Industry: ${req.industry}` : ''}
${req.codeContext ? `\nCode context provided:\n${req.codeContext.slice(0, 4000)}` : ''}

Parse this into the structured format. Think about what business workflow this requirement relates to, what should and shouldn't happen, and what systems would be involved.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 2048,
    meterContext: { ...meterContext, serviceKey: 'policyIngestion.parseRequirement' },
  });

  return parseJsonResponse<ParsedRequirement>(response);
}

// ---------------------------------------------------------------------------
// Step 2: Generate workflow definition
// ---------------------------------------------------------------------------

async function generateWorkflow(parsed: ParsedRequirement, meterContext: MeterContext): Promise<SuggestedWorkflow> {
  const systemPrompt = `You are an instrumentation architect for AI systems. Given a parsed requirement, generate a workflow definition with the expected event types that should be emitted during this workflow.

Event types follow a dot-notation convention:
- message.received, message.sent — conversation events
- tool.invoked, tool.completed, tool.failed — tool/function calls
- escalation.triggered, escalation.completed — escalation events
- account.status.read, account.status.changed — state change events
- decision.made — decision points
- boundary.crossed — when visibility ends
- interaction.started, interaction.completed — lifecycle events
- validation.passed, validation.failed — validation events
- notification.sent — outbound notifications
- review.flagged, review.completed — human review events

Return ONLY a valid JSON object:
{
  "name": "Human-readable workflow name",
  "description": "1-2 sentence description",
  "category": "compliance|safety|quality|security|operational",
  "expectedEventTypes": ["list of event types this workflow should produce"],
  "timeoutMs": number (how long to wait for all events, in milliseconds),
  "boundaryNotes": ["where Lamdis visibility might end in this workflow"]
}`;

  const userPrompt = `Generate a workflow definition for:

Workflow: ${parsed.workflowName}
Description: ${parsed.workflowDescription}
Category: ${parsed.category}
Expected behaviors: ${parsed.expectedBehaviors.join('; ')}
Failure conditions: ${parsed.failureConditions.join('; ')}
Systems involved: ${parsed.systemsInvolved.join(', ')}
Actors: ${parsed.actorsInvolved.join(', ')}
${parsed.regulatoryContext ? `Regulatory context: ${parsed.regulatoryContext}` : ''}

Think about every event type that would be emitted during this workflow, from start to finish. Include events that prove each expected behavior occurred.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 2048,
    meterContext: { ...meterContext, serviceKey: 'policyIngestion.generateWorkflow' },
  });

  return parseJsonResponse<SuggestedWorkflow>(response);
}

// ---------------------------------------------------------------------------
// Step 3: Generate policy checks with confirmation levels
// ---------------------------------------------------------------------------

async function generatePolicyChecks(
  parsed: ParsedRequirement,
  workflow: SuggestedWorkflow,
  meterContext: MeterContext,
): Promise<SuggestedCheck[]> {
  const systemPrompt = `You are a policy check designer for AI systems. Given a parsed requirement and workflow definition, generate specific policy checks.

Each check verifies one specific thing that must be true during the interaction.

Check types available:
- "judge": LLM evaluates content against a rubric. Config: { "rubric": "text", "scope": "event|transcript|all_events" }
- "includes": Keyword presence check. Config: { "keywords": ["word1"], "matchMode": "all|any" }
- "regex": Pattern matching. Config: { "pattern": "regex", "shouldMatch": true/false }
- "json_path": Value at a JSON path. Config: { "path": "dot.path", "expected": value, "operator": "eq|neq|gt|exists" }
- "event_presence": Specific events must exist. Config: { "eventTypes": ["event.type"], "withinMs": 30000 }
- "event_sequence": Events must occur in order. Config: { "eventTypes": ["first", "second"], "ordered": true, "withinMs": 60000 }
- "timing": Event must occur within time limit. Config: { "eventType": "event.type", "maxMs": 5000, "fromEvent": "trigger.event" }
- "confirmation_level": Minimum evidence strength. Config: { "minLevel": "A|B|C|D|E", "forEventTypes": ["event.types"] }

Confirmation levels:
- A: Observed intent (system decided to act)
- B: Attempted action (outbound call made)
- C: Acknowledged action (got success response)
- D: Confirmed system state (source-of-truth readback)
- E: End-to-end completed outcome

Severity: critical (must pass), error (should pass), warning (nice to have), info (informational)

Return ONLY a valid JSON array of check objects:
[{
  "name": "Human-readable check name",
  "description": "What this check verifies",
  "category": "compliance|safety|quality|security|operational",
  "severity": "critical|error|warning|info",
  "checkType": "one of the types above",
  "config": { type-specific config },
  "requiredEvidenceLevel": "A|B|C|D|E",
  "rationale": "Why this check matters for this requirement"
}]`;

  const userPrompt = `Design policy checks for this workflow:

Workflow: ${workflow.name}
Description: ${workflow.description}
Expected event types: ${workflow.expectedEventTypes.join(', ')}

Original requirement: ${parsed.workflowDescription}
Expected behaviors:
${parsed.expectedBehaviors.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Failure conditions to prevent:
${parsed.failureConditions.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${parsed.regulatoryContext ? `Regulatory context: ${parsed.regulatoryContext}` : ''}

Generate checks that:
1. Verify each expected behavior occurred
2. Detect each failure condition
3. Use the appropriate check type for each (LLM judge for content quality, event_presence for process steps, etc.)
4. Set realistic confirmation levels (don't require Level E for everything)
5. Assign appropriate severity (critical for safety, error for compliance, etc.)`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 8192,
    meterContext: { ...meterContext, serviceKey: 'policyIngestion.generatePolicyChecks' },
  });

  return parseJsonResponse<SuggestedCheck[]>(response);
}

// ---------------------------------------------------------------------------
// Step 4: Generate instrumentation snippets
// ---------------------------------------------------------------------------

async function generateInstrumentation(
  workflow: SuggestedWorkflow,
  checks: SuggestedCheck[],
  meterContext: MeterContext,
): Promise<InstrumentationSnippet[]> {
  const systemPrompt = `You are a developer experience expert. Given an interaction and its policy checks, generate SDK instrumentation code snippets.

The Lamdis SDK works like this:
\`\`\`typescript
import { Lamdis } from '@lamdis/sdk';

const lamdis = new Lamdis({
  apiKey: process.env.LAMDIS_API_KEY,
  endpoint: 'https://ingest.lamdis.com',
  environment: 'production',
});

const instance = lamdis.startInteraction('interaction-key');
await instance.emit('event.type', { payload }, { level: 'A' });
await instance.complete();
\`\`\`

Confirmation levels for the \`level\` option:
- 'A': Use when you're logging a decision or intent
- 'B': Use when you're making an outbound call
- 'C': Use when you received a success response
- 'D': Use when you've read back the source-of-truth state
- 'E': Use when full end-to-end outcome is confirmed

Return ONLY a valid JSON array:
[{
  "eventType": "the.event.type",
  "description": "What this event represents",
  "confirmationLevel": "A|B|C|D|E",
  "sdkCode": "TypeScript code snippet showing how to emit this event",
  "suggestedLocation": "Where in the customer's code this should be placed (e.g., 'After the escalation handler creates the ticket')"
}]`;

  const userPrompt = `Generate SDK instrumentation snippets for:

Workflow: ${workflow.name}
Event types: ${workflow.expectedEventTypes.join(', ')}

Policy checks that need evidence:
${checks.map(c => `- ${c.name} (needs ${c.checkType} with evidence level ${c.requiredEvidenceLevel})`).join('\n')}

Generate a snippet for each event type, with the correct confirmation level and a realistic payload structure.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.3,
    maxTokens: 8192,
    meterContext: { ...meterContext, serviceKey: 'policyIngestion.generateInstrumentation' },
  });

  return parseJsonResponse<InstrumentationSnippet[]>(response);
}

// ---------------------------------------------------------------------------
// Orchestrator: Full pipeline
// ---------------------------------------------------------------------------

/**
 * Given an unstructured policy requirement, generate a complete suggestion
 * with workflow definition, policy checks, and instrumentation snippets.
 */
export async function suggestFromRequirement(req: PolicyRequirement, meterContext: MeterContext): Promise<PolicySuggestion> {
  // Step 1: Parse the requirement
  const parsed = await parseRequirement(req, meterContext);

  // Step 2: Generate workflow definition
  const workflow = await generateWorkflow(parsed, meterContext);

  // Step 3: Generate policy checks
  const checks = await generatePolicyChecks(parsed, workflow, meterContext);

  // Step 4: Generate instrumentation snippets
  const instrumentation = await generateInstrumentation(workflow, checks, meterContext);

  return {
    workflow,
    checks,
    instrumentation,
    reasoning: `Parsed requirement into workflow "${workflow.name}" with ${checks.length} policy checks and ${instrumentation.length} instrumentation points. ${workflow.boundaryNotes.length > 0 ? `Boundaries identified: ${workflow.boundaryNotes.join('; ')}` : ''}`,
  };
}

/**
 * Given an existing interaction and new policy text, generate additional
 * policy checks that should be added. Useful for iteratively refining.
 */
export async function suggestAdditionalChecks(
  workflowName: string,
  workflowDescription: string,
  existingEventTypes: string[],
  existingChecks: Array<{ name: string; checkType: string }>,
  newPolicyText: string,
  meterContext: MeterContext,
): Promise<{ checks: SuggestedCheck[]; newEventTypes: string[]; reasoning: string }> {
  const systemPrompt = `You are a policy check designer. An interaction already has some checks. The user wants to add coverage for a new policy or requirement. Generate ONLY the additional checks needed (don't duplicate existing ones) and identify any new event types required.

Return ONLY a valid JSON object:
{
  "checks": [{ same format as before }],
  "newEventTypes": ["any new event types needed that aren't already in the interaction"],
  "reasoning": "Why these checks are needed and how they complement existing coverage"
}`;

  const userPrompt = `Workflow: ${workflowName}
Description: ${workflowDescription}
Existing event types: ${existingEventTypes.join(', ')}
Existing checks: ${existingChecks.map(c => `${c.name} (${c.checkType})`).join(', ')}

New policy to add coverage for:
"${newPolicyText}"

Generate additional checks. Do NOT duplicate existing checks.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages,
    temperature: 0.2,
    maxTokens: 8192,
    meterContext: { ...meterContext, serviceKey: 'policyIngestion.suggestAdditionalChecks' },
  });

  return parseJsonResponse(response);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function parseJsonResponse<T>(response: string): T {
  let raw = response.trim()
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```\s*$/, '');

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Attempt to repair truncated JSON:
    // Close any open strings, then close brackets/braces from inside out
    // Strip trailing comma or partial key-value
    raw = raw.replace(/,\s*$/, '');
    // Close unclosed string
    const quoteCount = (raw.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) raw += '"';
    // Count open brackets/braces and close them
    let braces = 0, brackets = 0;
    let inString = false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"' && (i === 0 || raw[i - 1] !== '\\')) { inString = !inString; continue; }
      if (inString) continue;
      if (raw[i] === '{') braces++;
      else if (raw[i] === '}') braces--;
      else if (raw[i] === '[') brackets++;
      else if (raw[i] === ']') brackets--;
    }
    // Strip trailing partial value (unfinished key: "val or key: 123)
    raw = raw.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
    // Re-count after stripping
    braces = 0; brackets = 0; inString = false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"' && (i === 0 || raw[i - 1] !== '\\')) { inString = !inString; continue; }
      if (inString) continue;
      if (raw[i] === '{') braces++;
      else if (raw[i] === '}') braces--;
      else if (raw[i] === '[') brackets++;
      else if (raw[i] === ']') brackets--;
    }
    while (braces > 0) { raw += '}'; braces--; }
    while (brackets > 0) { raw += ']'; brackets--; }
    return JSON.parse(raw) as T;
  }
}
