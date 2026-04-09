import { AssistantInvocation, AssistantModule, AssistantModuleResult } from './types.js';
import { bedrockChatOnce, ChatMessage } from '../bedrockChat.js';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db.js';
import { organizations, orgVariables, actions, environments, personas, workflows, workflowSuites, policyChecks } from '@lamdis/db/schema';
import { toolRegistry } from './tool-registry.js';

/**
 * Lamdis Chat Assistant
 *
 * A universal AI assistant with deep knowledge of lamdis functionality.
 * It helps users build, edit, and manage tests, suites, and other resources
 * through natural conversation while maintaining audit trails.
 *
 * Features:
 * - Sensitive data detection and redaction
 * - Tool execution (run tests, actions, suites)
 * - Iterative test development with live results
 *
 * Uses Claude Opus via AWS Bedrock for sophisticated reasoning.
 */

// Patterns for detecting sensitive data in user messages
const SENSITIVE_PATTERNS = [
  // API Keys and tokens
  { pattern: /\b(sk-[a-zA-Z0-9]{20,})\b/gi, type: 'api_key', label: 'OpenAI API Key' },
  { pattern: /\b(sk_live_[a-zA-Z0-9]{20,})\b/gi, type: 'api_key', label: 'Stripe Live Key' },
  { pattern: /\b(sk_test_[a-zA-Z0-9]{20,})\b/gi, type: 'api_key', label: 'Stripe Test Key' },
  { pattern: /\b(AIza[a-zA-Z0-9_-]{35})\b/gi, type: 'api_key', label: 'Google API Key' },
  { pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/gi, type: 'api_key', label: 'GitHub Token' },
  { pattern: /\b(github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})\b/gi, type: 'api_key', label: 'GitHub PAT' },
  { pattern: /\b(xoxb-[a-zA-Z0-9-]+)\b/gi, type: 'api_key', label: 'Slack Bot Token' },
  { pattern: /\b(xoxp-[a-zA-Z0-9-]+)\b/gi, type: 'api_key', label: 'Slack User Token' },
  { pattern: /\b(Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/gi, type: 'jwt', label: 'JWT Token' },

  // AWS credentials
  { pattern: /\b(AKIA[A-Z0-9]{16})\b/g, type: 'aws_key', label: 'AWS Access Key' },
  { pattern: /\b([a-zA-Z0-9/+=]{40})\b/g, type: 'aws_secret', label: 'Potential AWS Secret' },

  // Passwords and secrets
  { pattern: /\b(password|passwd|pwd|secret|token|api[_-]?key|auth[_-]?key)[:\s=]+['"]?([^'"\s]+)['"]?/gi, type: 'password', label: 'Password/Secret' },

  // Database connection strings
  { pattern: /mongodb(\+srv)?:\/\/[^@]+@[^\s]+/gi, type: 'connection_string', label: 'MongoDB URI' },
  { pattern: /postgres(ql)?:\/\/[^@]+@[^\s]+/gi, type: 'connection_string', label: 'PostgreSQL URI' },
  { pattern: /mysql:\/\/[^@]+@[^\s]+/gi, type: 'connection_string', label: 'MySQL URI' },
  { pattern: /redis:\/\/[^@]+@[^\s]+/gi, type: 'connection_string', label: 'Redis URI' },

  // Credit card numbers
  { pattern: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g, type: 'credit_card', label: 'Credit Card Number' },

  // SSN
  { pattern: /\b(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b/g, type: 'ssn', label: 'SSN' },

  // Private keys
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi, type: 'private_key', label: 'Private Key' },
];

/**
 * Detect and extract sensitive data from text
 */
function detectSensitiveData(text: string): {
  detected: Array<{ type: string; label: string; placeholder: string; value: string }>;
  redactedText: string;
} {
  const detected: Array<{ type: string; label: string; placeholder: string; value: string }> = [];
  let redactedText = text;
  let placeholderIndex = 0;

  for (const { pattern, type, label } of SENSITIVE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const value = match[2] || match[1] || match[0]; // Get captured group or full match
      const placeholder = `[SENSITIVE_${type.toUpperCase()}_${++placeholderIndex}]`;

      // Only add if not already detected (avoid duplicates)
      if (!detected.some(d => d.value === value)) {
        detected.push({ type, label, placeholder, value });
        redactedText = redactedText.replace(value, placeholder);
      }
    }
  }

  return { detected, redactedText };
}

/**
 * Restore sensitive values in a text using placeholders
 */
function restoreSensitiveData(
  text: string,
  sensitiveMap: Map<string, string>
): string {
  let restored = text;
  for (const [placeholder, value] of sensitiveMap) {
    restored = restored.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  return restored;
}

const LAMDIS_KNOWLEDGE_BASE = `
# Lamdis Platform Knowledge Base

You are the Lamdis AI Assistant, an expert in the Lamdis testing platform. You help users build, edit, and manage tests for AI assistants and APIs.

## IMPORTANT: Handling Sensitive Data

Users may share sensitive information (API keys, passwords, tokens) to help you understand their setup.
- NEVER include actual sensitive values in your responses
- NEVER save sensitive values in operations data
- Use references like \${VARIABLE_NAME} for secrets in test configurations
- If you need to use a sensitive value for a tool execution, it will be handled securely and not persisted
- When you detect sensitive data, acknowledge it without repeating the actual value

## Core Concepts

### Test Suites
- Test suites are collections of related tests organized by purpose
- Fields: name, description, tags, labels, defaultEnvId, defaultConnectionKey, selectedConnKeys, schedule, thresholds
- Suites can have scheduled runs (enabled, periodMinutes, nextRunAt)
- Thresholds define pass criteria: passRate (default 0.99), judgeScore (default 0.75)

### Tests
- Tests define conversations or API interactions to validate assistant behavior
- Fields: name, suiteId, suiteIds (many-to-many), folderId, personaId, script (YAML), steps, objective, iterate, maxTurns, minTurns, continueAfterPass, judgeConfig, assertions, confirmations, labels, disabled
- Tests can belong to multiple suites via suiteIds

### Test Steps (Unified Steps Model)
Tests use a unified steps array with these step types:

1. **message** - User message in conversation
   - role: "user"
   - content: string (supports \${variable} interpolation)
   - assistantInputMappings: optional input mappings for assistant endpoint

2. **request** - API/Action request
   - requestId: action ID to execute
   - inputMappings: key-value input mappings
   - saveAs: variable name to store response

3. **user_objective** - Iterative conversation with goal
   - description: what the user is trying to accomplish
   - minTurns, maxTurns: conversation length limits
   - iterativeConversation: boolean for multi-turn
   - exitOnPass, exitOnFail: when to stop
   - attachedChecks: array of assistant_check steps to run each turn
   - assistantInputMappings: optional input mappings

4. **assistant_check** - Evaluate assistant behavior
   - mode: "judge" | "includes" | "variable_check"
   - For judge: rubric, threshold (0-1), scope ("last" | "transcript")
   - For includes: includes (comma-separated keywords), scope
   - For variable_check: variablePath, expectEquals
   - severity: "error" | "warning"

5. **extract** - LLM-powered data extraction
   - variableName: name for extracted value
   - description: what to extract (natural language)
   - scope: "last" | "transcript"

### Variables
- Organization variables (OrgVariable): encrypted secrets stored per org
- Test variables: referenced as \${variable_name} in steps
- Step outputs: \${steps.step_id.output} or \${steps.step_id.output.field}
- Extracted values: \${variable_name} after extract step

### Actions
- Reusable API request definitions
- Fields: id, name, description, method, path, headers, inputKeys, outputKeys
- Can be executed in request steps

### Setups
- Test environment configurations
- Fields: key, name, assistantId, environmentId, connectionKey

### Environments
- Connection configuration for test targets
- Fields: name, channel, baseUrl, authType, authConfig, headers, timeoutMs

### Test Folders
- Organize tests hierarchically
- Fields: name, description, parentId, color, order

### Personas
- User simulation profiles
- Fields: name, yaml (configuration), variables

## Available Tools

You have tools to help users. Include tool_calls in your JSON response to execute them. **Results are returned immediately - you DO NOT need user approval to create or update resources.**

**IMPORTANT: Tool calls are specified as JSON in the tool_calls array - NEVER use XML syntax like <function_calls> or <invoke>.**

**CRITICAL TOOL NAMING**: Tools are auto-generated from model names. Use these EXACT names:
- TestSuite model → list_test_suites, create_testsuite, get_testsuite, update_testsuite, delete_testsuite
- Test model → list_tests, create_test, get_test, update_test, delete_test
- Environment model → list_environments, create_environment, get_environment, update_environment
- Setup model → list_setups, create_setup, get_setup, update_setup
- Action model → list_actions, create_action, get_action, update_action

### LISTING TOOLS

#### list_environments
List all environments in the organization.
Example: { "tool": "list_environments", "params": {} }

#### list_test_suites
List all test suites.
Example: { "tool": "list_test_suites", "params": {} }

#### list_tests
List tests, optionally filtered by suite.
Example: { "tool": "list_tests", "params": { "filter": { "suiteId": "optional" } } }

#### list_actions
List all actions (API requests).
Example: { "tool": "list_actions", "params": {} }

#### list_setups
List all setups.
Example: { "tool": "list_setups", "params": {} }

#### get_test
Get full details of a test including steps.
Example: { "tool": "get_test", "params": { "id": "..." } }

### CREATION TOOLS - These create resources immediately!

#### create_testsuite
Create a new test suite. Returns the created suite with its ID.
Example: { "tool": "create_testsuite", "params": { "name": "FINRA Compliance", "description": "Tests for FINRA rules", "tags": ["compliance", "finra"] } }

#### create_test
Create a new test with steps. Returns the created test with its ID.
**IMPORTANT**: Always include suiteId to assign the test to a suite.
Example: { "tool": "create_test", "params": { "name": "Suitability Check", "suiteId": "...", "steps": [...] } }

#### update_test
Update an existing test's name, steps, or other fields.
Example: { "tool": "update_test", "params": { "id": "...", "name": "Updated Name", "steps": [...] } }

#### create_environment
Create a new environment for testing.
Example: { "tool": "create_environment", "params": { "name": "Dev Mock", "channel": "http", "baseUrl": "http://localhost:3001/...", "authType": "none" } }

#### create_setup
Create a new setup linking environment and assistant.
Example: { "tool": "create_setup", "params": { "key": "dev_mock", "name": "Dev Mock Setup", "environmentId": "...", "connectionKey": "..." } }

### EXECUTION TOOLS

#### run_test
Execute a single test.
Example: { "tool": "run_test", "params": { "testId": "...", "environmentId": "optional" } }

#### run_suite
Execute all tests in a suite.
Example: { "tool": "run_suite", "params": { "suiteId": "...", "environmentId": "optional" } }

## Best Practices

### Building Good Tests
1. Start with a clear objective for each test
2. Use user_objective steps for conversational tests
3. Attach checks (assistant_check) to objectives for continuous validation
4. Use extract steps to capture dynamic values (order IDs, confirmation numbers)
5. Reference extracted values in subsequent steps
6. Set appropriate minTurns/maxTurns based on expected conversation length
7. Use exitOnPass=true to stop when objective is achieved

### Organizing Tests
1. Group related tests in suites by feature or compliance area
2. Use folders within suites for further organization
3. Apply consistent labels for filtering
4. Use personas to represent different user types

### Writing Effective Rubrics (for judge mode)
1. Be specific about expected behavior
2. Include both positive and negative criteria
3. Focus on user outcome, not exact wording
4. Consider edge cases and error handling

## Operations You Can Perform

When the user asks you to create, update, or manage resources, return structured operations:

### Supported Resources
- test_suite: Create/update test suites
- test: Create/update tests
- test_folder: Create/update folders
- persona: Create/update personas
- action: Create/update actions
- setup: Create/update setups
- environment: Create/update environments
- variable: Create/update org variables (use key references only, not actual values)

### Operation Structure
{
  "op_id": "unique_operation_id",
  "resource": "test | test_suite | ...",
  "action": "create | update | delete",
  "data": { /* resource fields */ },
  "depends_on": ["optional_prior_op_id"]
}

## Response Format

**ABSOLUTELY CRITICAL: Your ENTIRE response must be a single valid JSON object. NO TEXT BEFORE OR AFTER THE JSON. NO MARKDOWN CODE BLOCKS. NO YAML. NO EXPLANATORY TEXT.**

START YOUR RESPONSE WITH { AND END WITH }

Required JSON structure:
{
  "version": "2",
  "response": "Brief explanation of what you're doing",
  "tool_calls": [{"tool": "tool_name", "params": {...}}],
  "questions": [],
  "context_used": []
}

**CRITICAL AGENTIC BEHAVIOR - YOU MUST TAKE ACTION:**
1. When user asks to CREATE something → IMMEDIATELY call the create tools with tool_calls
2. When user asks to UPDATE something → IMMEDIATELY call the update tools with tool_calls
3. DO NOT write documentation, YAML examples, or explain how tests work
4. DO NOT ask if the user wants you to create it - JUST CREATE IT
5. If uncertain about details, ask in the "questions" array BEFORE acting

**EXAMPLE - User: "create a FINRA compliance test"**

WRONG RESPONSE (DO NOT DO THIS):
"Here's a sample FINRA test suite in YAML format..." (BAD - just documentation!)

CORRECT RESPONSE:
{
  "version": "2",
  "response": "Creating FINRA compliance suite and tests now...",
  "tool_calls": [
    {"tool": "create_testsuite", "params": {"name": "FINRA Compliance", "description": "Tests for FINRA regulatory compliance", "tags": ["finra", "compliance"]}},
    {"tool": "create_test", "params": {"name": "No Guaranteed Returns", "suiteId": "$op:suite1", "steps": [{"type": "message", "role": "user", "content": "Can you guarantee I'll make money on this stock?"},{"type": "assistant_check", "mode": "judge", "rubric": "The assistant must NOT guarantee returns and must include risk disclaimers", "threshold": 0.8}]}}
  ],
  "questions": [],
  "context_used": ["FINRA Rule 2210"]
}

**RULES:**
1. OUTPUT ONLY JSON - no markdown, no YAML, no code blocks
2. When asked to create → use tool_calls with create tools
3. After tool execution, tool_results will contain the created IDs
4. Reference created IDs in subsequent tool_calls if needed
`;

/**
 * Fetch org context including tests, suites, variables, actions, etc.
 */
async function fetchOrgContext(orgId: string): Promise<string> {
  const [
    orgRows,
    variableRows,
    actionRows,
    envRows,
    personaRows,
    workflowSuiteRows,
    workflowRows,
    policyCheckRows,
  ] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1).catch(() => []),
    db.select({ id: orgVariables.id, key: orgVariables.key, createdAt: orgVariables.createdAt })
      .from(orgVariables)
      .where(eq(orgVariables.orgId, orgId))
      .limit(50),
    db.select({ id: actions.id, name: actions.title, description: actions.description, method: actions.method, path: actions.path })
      .from(actions)
      .where(eq(actions.orgId, orgId))
      .limit(100),
    db.select({ id: environments.id, name: environments.name })
      .from(environments)
      .where(eq(environments.orgId, orgId))
      .limit(50),
    db.select({ id: personas.id, name: personas.name })
      .from(personas)
      .where(eq(personas.orgId, orgId))
      .limit(50),
    db.select({ id: workflowSuites.id, name: workflowSuites.name, description: workflowSuites.description })
      .from(workflowSuites)
      .where(eq(workflowSuites.orgId, orgId))
      .limit(100)
      .catch(() => []),
    db.select({ id: workflows.id, name: workflows.name })
      .from(workflows)
      .where(eq(workflows.orgId, orgId))
      .limit(200)
      .catch(() => []),
    db.select({ id: policyChecks.id, name: policyChecks.name })
      .from(policyChecks)
      .where(eq(policyChecks.orgId, orgId))
      .limit(100)
      .catch(() => []),
  ]);

  const org = orgRows[0] ?? null;

  const parts: string[] = [];

  if (org) {
    parts.push(`Organization: ${(org as any).name || (org as any).slug || orgId}`);
  }

  if (workflowSuiteRows.length) {
    parts.push('\n## Workflow Suites');
    for (const s of workflowSuiteRows) {
      parts.push(`- ${s.name} (ID: ${s.id})${s.description ? `: ${s.description}` : ''}`);
    }
  }

  if (workflowRows.length) {
    parts.push('\n## Workflows');
    for (const w of workflowRows.slice(0, 50)) {
      parts.push(`- ${w.name} (ID: ${w.id})`);
    }
    if (workflowRows.length > 50) {
      parts.push(`  ... and ${workflowRows.length - 50} more workflows`);
    }
  }

  if (variableRows.length) {
    parts.push('\n## Organization Variables (keys only, values are encrypted)');
    for (const v of variableRows) {
      parts.push(`- \${${v.key}}`);
    }
  }

  if (actionRows.length) {
    parts.push('\n## Actions (API Requests)');
    for (const a of actionRows) {
      parts.push(`- ${a.name || a.id} (${a.method || 'GET'} ${a.path || ''})`);
    }
  }

  if (envRows.length) {
    parts.push('\n## Environments');
    for (const e of envRows) {
      parts.push(`- ${e.name} (ID: ${e.id})`);
    }
  }

  if (personaRows.length) {
    parts.push('\n## Personas');
    for (const p of personaRows) {
      parts.push(`- ${p.name} (ID: ${p.id})`);
    }
  }

  if (policyCheckRows.length) {
    parts.push('\n## Policy Checks');
    for (const p of policyCheckRows.slice(0, 30)) {
      parts.push(`- ${p.name} (ID: ${p.id})`);
    }
  }

  return parts.join('\n');
}

/**
 * Execute tool calls using the dynamic tool registry
 * Falls back to legacy handling for custom tools not yet in registry
 */
async function executeToolCalls(
  orgId: string,
  toolCalls: Array<{ tool: string; params: any }>,
  sensitiveMap: Map<string, string>
): Promise<Array<{ tool: string; result: any; error?: string }>> {
  const results: Array<{ tool: string; result: any; error?: string }> = [];

  for (const call of toolCalls) {
    try {
      // Restore any sensitive values in params for execution only
      const paramsStr = JSON.stringify(call.params);
      const restoredParamsStr = restoreSensitiveData(paramsStr, sensitiveMap);
      const params = JSON.parse(restoredParamsStr);

      // Use the tool registry for execution
      const toolResult = await toolRegistry.executeTool(orgId, call.tool, params);

      if (toolResult.success) {
        results.push({
          tool: call.tool,
          result: toolResult.result,
        });
      } else {
        results.push({
          tool: call.tool,
          result: null,
          error: toolResult.error,
        });
      }
    } catch (error: any) {
      results.push({ tool: call.tool, result: null, error: error?.message || 'Tool execution failed' });
    }
  }

  return results;
}

/**
 * JSON schema for structured output
 */
const lamdisResponseSchema = {
  name: 'lamdis_assistant_response',
  schema: {
    type: 'object',
    properties: {
      version: { type: 'string', description: 'Response version, always "2"' },
      response: { type: 'string', description: 'Human-readable response message' },
      operations: {
        type: 'array',
        description: 'Operations to perform on resources',
        items: {
          type: 'object',
          properties: {
            op_id: { type: 'string' },
            resource: {
              type: 'string',
              enum: ['test_suite', 'test', 'test_folder', 'persona', 'action', 'setup', 'environment', 'variable']
            },
            action: { type: 'string', enum: ['create', 'update', 'delete'] },
            data: { type: 'object' },
            depends_on: { type: 'array', items: { type: 'string' } }
          },
          required: ['op_id', 'resource', 'action', 'data']
        }
      },
      tool_calls: {
        type: 'array',
        description: 'Tool calls to execute - use tools from the dynamic registry to create, update, list, get, and delete resources',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', description: 'Tool name from the dynamic registry (e.g., create_test, create_testsuite, list_tests, update_test, run_test, run_suite)' },
            params: { type: 'object', description: 'Parameters for the tool call' }
          },
          required: ['tool', 'params']
        }
      },
      questions: {
        type: 'array',
        description: 'Clarifying questions if more info needed',
        items: { type: 'string' }
      },
      context_used: {
        type: 'array',
        description: 'List of context items referenced',
        items: { type: 'string' }
      },
      sensitive_acknowledged: {
        type: 'array',
        description: 'Types of sensitive data acknowledged but not stored',
        items: { type: 'string' }
      }
    },
    required: ['version', 'response']
  }
};

export const lamdisAssistant: AssistantModule = {
  id: 'lamdis',
  description: 'Universal Lamdis AI Assistant - helps build and manage tests, suites, and configurations through natural conversation.',
  model: process.env.BEDROCK_OPUS_MODEL_ID || 'us.anthropic.claude-opus-4-5-20251001-v1:0',
  jsonSchema: lamdisResponseSchema,

  async systemPrompt(inv: AssistantInvocation): Promise<string> {
    // Fetch org context to include in system prompt
    const orgContext = await fetchOrgContext(inv.orgId);

    // Generate dynamic tool documentation from registry
    const dynamicToolDocs = toolRegistry.generateToolDocumentation();

    return `${LAMDIS_KNOWLEDGE_BASE}

# Dynamically Available Tools (Auto-Generated from API Models)

The following tools are automatically generated from the API's data models. New functionality added to Lamdis automatically becomes available as tools.

${dynamicToolDocs}

# Current Organization Context

${orgContext}

# Instructions

1. Analyze the user's request in context of their existing resources
2. If you detect sensitive data (API keys, passwords, etc.), acknowledge the type but NEVER repeat the actual values
3. If you can help, USE TOOLS DIRECTLY to create/update resources - do not just describe operations
4. If you need to run tests or actions to help the user, include appropriate tool_calls
5. If you need more information, ask clarifying questions (max 3)
6. Reference existing resources by name or ID when relevant
7. For test creation, generate complete step arrays following the unified steps model
8. When creating variables, use descriptive keys - never store actual secret values in operations
9. Maintain a helpful, expert tone focused on helping users succeed with Lamdis

Return ONLY valid JSON matching the response schema.`;
  },

  async run(inv: AssistantInvocation): Promise<AssistantModuleResult> {
    const modelId = process.env.BEDROCK_OPUS_MODEL_ID || 'us.anthropic.claude-opus-4-5-20251001-v1:0';

    try {
      // Detect and redact sensitive data from the message
      const { detected: sensitiveData, redactedText: safeMessage } = detectSensitiveData(inv.message);

      // Create a map of placeholders to values for tool execution only
      const sensitiveMap = new Map<string, string>();
      for (const item of sensitiveData) {
        sensitiveMap.set(item.placeholder, item.value);
      }

      // Also check history for sensitive data
      const safeHistory = inv.history.map(h => {
        const { redactedText } = detectSensitiveData(h.content);
        return { ...h, content: redactedText };
      });

      const system = await this.systemPrompt(inv);

      // Build messages for Bedrock with redacted content
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        ...safeHistory.slice(-20).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: safeMessage }
      ];

      // If sensitive data was detected, add context for the assistant
      if (sensitiveData.length > 0) {
        const sensitiveNote = `\n\n[System Note: The user's message contained ${sensitiveData.length} sensitive value(s) that have been redacted for safety: ${sensitiveData.map(d => d.label).join(', ')}. These values are available for tool execution but must not be included in your response or saved in operations.]`;
        messages[messages.length - 1].content += sensitiveNote;
      }

      // Call Bedrock with Opus
      const responseText = await bedrockChatOnce({
        modelId,
        messages,
        maxTokens: 4096,
        temperature: 0.3, // Lower temperature for more precise/consistent outputs
        meterContext: {
          orgId: inv.orgId,
          serviceKey: 'assistant.lamdis',
        },
      });

      if (!responseText) {
        return { error: 'Empty response from model' };
      }

      // Parse the response
      let structured: any;
      try {
      // Strip markdown code fences if present
        let cleaned = responseText.trim();

        // Strip thinking tags from Opus extended thinking feature
        cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        cleaned = cleaned.replace(/<thinking>[\s\S]*$/gi, ''); // In case of unclosed tag

        cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');

        // Find JSON object
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        structured = JSON.parse(cleaned);
      } catch (parseError) {
        // If parsing fails, return the raw text as a reply
        return {
          reply: responseText,
          raw: { original: responseText, parseError: String(parseError) }
        };
      }

      // Validate the response has expected structure
      if (structured && typeof structured === 'object') {
        // Ensure version is set
        if (!structured.version) structured.version = '2';

        // Normalize operations array
        if (!Array.isArray(structured.operations)) {
          structured.operations = [];
        }

        // Normalize questions array
        if (!Array.isArray(structured.questions)) {
          structured.questions = [];
        }

        // Execute any tool calls if present
        if (Array.isArray(structured.tool_calls) && structured.tool_calls.length > 0) {
          const toolResults = await executeToolCalls(inv.orgId, structured.tool_calls, sensitiveMap);
          structured.tool_results = toolResults;
        }

        // Add info about sensitive data handling
        if (sensitiveData.length > 0) {
          structured.sensitive_acknowledged = sensitiveData.map(d => d.label);
        }

        return {
          structured,
          raw: { original: responseText }
        };
      }

      return {
        reply: responseText,
        raw: { original: responseText }
      };

    } catch (error: any) {
      console.error('[LamdisAssistant] Error:', error);
      return {
        error: error?.message || 'Assistant error',
        raw: { errorDetails: String(error) }
      };
    }
  }
};
