/**
 * Code Generation Service
 *
 * LLM-powered code generation for:
 * - API docs → integration code (custom tools)
 * - Policy text → executable validation
 * - Data schema → extraction prompts
 */

import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import type { MeterContext } from '../llmCostControl/index.js';

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

// ---------------------------------------------------------------------------
// Generate integration code from API docs
// ---------------------------------------------------------------------------

export interface GeneratedToolCode {
  name: string;
  description: string;
  code: string;        // JavaScript async function run(input) { ... }
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissions: { net_allow?: string[]; env?: string[] };
  testInput: Record<string, unknown>;
}

export async function generateIntegrationCode(
  purpose: string,
  apiDocs: string,
  meterContext: MeterContext,
  credentialHints?: string,
): Promise<GeneratedToolCode> {
  const prompt = `You are a tool builder. Generate a JavaScript integration tool based on the following.

## Purpose
${purpose}

## API Documentation
${apiDocs.slice(0, 8000)}

${credentialHints ? `## Available Credentials\n${credentialHints}` : ''}

## Requirements
1. Write a single async function \`run(input)\` that takes an input object and returns \`{ kind: 'data', value: <result> }\`
2. Use fetch() for HTTP calls (available in the sandbox)
3. Handle errors gracefully — return \`{ kind: 'error', error: <message> }\` on failure
4. Keep it simple and focused on one capability

## Response Format
Respond with a JSON object (no markdown fences):
{
  "name": "tool_name_snake_case",
  "description": "One line description of what this tool does",
  "code": "async function run(input) { ... full code ... }",
  "input_schema": { "type": "object", "properties": { ... }, "required": [...] },
  "output_schema": { "type": "object", "properties": { ... } },
  "permissions": { "net_allow": ["api.example.com"] },
  "test_input": { "example_param": "example_value" }
}`;

  const raw = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are a code generation assistant. Respond only with valid JSON.',
    maxTokens: 4096,
    temperature: 0.2,
    meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'codeGeneration.integration' },
  });

  const json = parseJSON(raw);

  return {
    name: json.name || 'unnamed_tool',
    description: json.description || purpose,
    code: json.code || '',
    inputSchema: json.input_schema || json.inputSchema || {},
    outputSchema: json.output_schema || json.outputSchema || {},
    permissions: json.permissions || {},
    testInput: json.test_input || json.testInput || {},
  };
}

// ---------------------------------------------------------------------------
// Generate validation code from policy text
// ---------------------------------------------------------------------------

export async function generateValidationCode(
  policyText: string,
  meterContext: MeterContext,
  context?: string,
): Promise<{ code: string; description: string }> {
  const prompt = `Convert this policy into an executable JavaScript validation function.

## Policy
${policyText.slice(0, 4000)}

${context ? `## Context\n${context}` : ''}

## Requirements
Write an async function \`validate(data)\` that:
1. Takes a data object
2. Returns \`{ valid: true/false, reason: "..." }\`
3. Checks the conditions described in the policy

Respond with JSON:
{
  "code": "async function validate(data) { ... }",
  "description": "What this validation checks"
}`;

  const raw = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are a code generation assistant. Respond only with valid JSON.',
    maxTokens: 2048,
    temperature: 0.2,
    meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'codeGeneration.validation' },
  });

  const json = parseJSON(raw);
  return {
    code: json.code || '',
    description: json.description || '',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJSON(raw: string): any {
  try {
    return JSON.parse(raw.trim());
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1].trim());
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('Could not parse LLM response as JSON');
  }
}
