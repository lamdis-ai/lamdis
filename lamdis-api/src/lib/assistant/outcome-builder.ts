import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type ToolConfiguration,
  type ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { db } from '../../db.js';
import { outcomeTypes, proofExpectations, actions } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';

const awsCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined;

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: awsCredentials,
});

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

const SYSTEM_PROMPT = `You are Lamdis — an autonomous AI agent that helps people achieve any desired outcome. Personal or professional, simple or complex — if someone tells you what they want to accomplish, you help make it happen.

You can sell things, plan events, manage projects, automate processes, coordinate tasks, negotiate deals, monitor situations, and more. You work by gathering evidence, taking actions, making decisions, and proving that the outcome was achieved.

CRITICAL: Never refuse a request because it isn't a "business" use case. Selling a Vespa, planning a birthday party, finding an apartment — these are all valid outcomes. Engage immediately and start helping.

When someone describes what they want:
1. Understand their goal and what "done" looks like
2. Ask a few quick clarifying questions (constraints, preferences, timeline)
3. Create the outcome with success criteria and proof expectations
4. Suggest actions Lamdis can take autonomously (search, post listings, send messages, process images, monitor responses)
5. Offer to start the autonomous agent to work on it immediately, or run a simulation to show how it works

Examples of outcomes Lamdis handles:
- "Sell my Vespa for $5,000" → create listings, handle inquiries, negotiate, coordinate pickup
- "Plan my daughter's 10th birthday party" → find venues, compare prices, book, send invitations
- "Ensure every support ticket gets a response within 2 hours" → monitor tickets, escalate, notify
- "Help me find and lease an apartment in Austin under $2k" → search listings, schedule tours, track applications
- "Process insurance claims with compliance checks" → validate documents, evaluate against policy, route decisions

When a goal involves multiple distinct outcomes (e.g., selling a scooter AND buying a new one), create separate outcomes and explain how they connect.

For proof expectations, choose from:
- event_presence: A specific event occurred
- event_sequence: Events arrived in expected order
- confirmation_level: Evidence reached minimum confirmation grade (A-E)
- judge: AI evaluates evidence against a rubric
- includes: Evidence contains expected text
- regex: Evidence matches a pattern
- json_path: A specific JSON field has expected value
- timing: Event arrived within time window

Be conversational and proactive. Don't over-question — start building as soon as you have enough context. You can always refine later.

After creating proof expectations:
1. Suggest relevant actions for the goal (e.g., "Post listing on marketplace", "Send notification to buyer", "Research comparable prices")
2. Create 2-3 action definitions using the create_action tool
3. Link each action to the outcome using link_action_to_outcome
4. Tell the user: "Everything is set up! Click **Start Working on This** in the top right to launch the autonomous agent. You'll be able to upload photos, chat with the agent in real time, and it will start working on your goal immediately."

When the user says "run simulation", "simulate", "show me how it works", or similar — immediately call the run_simulation tool. Do not just describe what would happen.

When creating actions, think about what's needed for this specific goal:
- Communication (email, SMS, messaging platforms)
- Web search and research
- Image processing and optimization
- Marketplace interactions (posting, monitoring, responding)
- Scheduling and coordination
- Payment verification
- Document handling

Code execution:
- You can write and execute JavaScript code using execute_code (for testing/calculations) or create_hosted_action (for persistent actions)
- Hosted actions run in a secure sandbox with: fetch (for API calls), console, setTimeout
- When the goal needs custom logic, create a hosted action
- For persistent storage needs, create actions that connect to database APIs — never create direct database connections

For connections: ask about any systems or accounts involved, understand the integration needed, and generate the action config. Do NOT ask for API keys or secrets directly — use open_action_editor to hand off to the action editor where users securely add credentials.`;

const TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: 'create_outcome',
        description: 'Create a new outcome type definition. Call this when you have enough info about the business process.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the business outcome' },
              description: { type: 'string', description: 'What this outcome represents' },
              riskClass: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'minimal'] },
              category: { type: 'string', enum: ['operational', 'compliance', 'safety', 'quality', 'security', 'financial'] },
              successCriteria: {
                type: 'array',
                items: { type: 'object', properties: { description: { type: 'string' }, weight: { type: 'number' } }, required: ['description'] },
              },
              keyDecisions: {
                type: 'array',
                items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, automatable: { type: 'boolean' } }, required: ['name'] },
              },
            },
            required: ['name', 'description'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'create_proof_expectation',
        description: 'Add a proof expectation to an existing outcome. Call multiple times for different proofs.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              outcomeTypeId: { type: 'string', description: 'The outcome type ID to add this proof to' },
              name: { type: 'string' },
              description: { type: 'string' },
              checkType: { type: 'string', enum: ['event_presence', 'event_sequence', 'confirmation_level', 'judge', 'includes', 'regex', 'json_path', 'timing'] },
              severity: { type: 'string', enum: ['critical', 'error', 'warning', 'info'] },
            },
            required: ['outcomeTypeId', 'name', 'checkType'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'create_action',
        description: 'Create an action definition (an HTTP integration that Lamdis can execute). Set isMock=true only if the user explicitly asks for a mock.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              actionId: { type: 'string', description: 'Unique slug identifier (e.g., process-refund)' },
              title: { type: 'string' },
              description: { type: 'string' },
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
              path: { type: 'string', description: 'API endpoint path' },
              isMock: { type: 'boolean', description: 'Set true only if user explicitly requests a mock' },
            },
            required: ['actionId', 'title'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'link_action_to_outcome',
        description: 'Connect an action to an outcome as a connected system',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              outcomeTypeId: { type: 'string' },
              actionUuid: { type: 'string', description: 'The action row UUID' },
              actionName: { type: 'string' },
              role: { type: 'string', description: 'Role of this system (e.g., payment_processor, notification)' },
            },
            required: ['outcomeTypeId', 'actionUuid'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'open_action_editor',
        description: 'Direct the user to the action editor to securely configure credentials and test the connection. Never ask for secrets directly.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              actionSlug: { type: 'string', description: 'The action slug/actionId' },
              instructions: { type: 'string', description: 'What the user should configure (auth type, headers, etc.)' },
            },
            required: ['actionSlug'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'create_hosted_action',
        description: 'Create an action that runs JavaScript code in a sandboxed environment. Use this when the objective needs custom logic — data transformations, calculations, API orchestration, etc.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              actionId: { type: 'string', description: 'Slug identifier (e.g., calculate-risk-score)' },
              title: { type: 'string' },
              description: { type: 'string' },
              code: { type: 'string', description: 'JavaScript code to execute. Must be an async function body that returns { kind: "data", value: result }. Has access to: input (the action input), fetch (for API calls), console.' },
              timeoutMs: { type: 'number', description: 'Execution timeout in milliseconds (default 6000, max 30000)' },
              netAllow: { type: 'array', items: { type: 'string' }, description: 'Allowed domains for fetch calls (e.g., ["api.example.com"])' },
            },
            required: ['actionId', 'title', 'code'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'execute_code',
        description: 'Execute JavaScript code immediately in the sandbox for testing, calculations, or data transformation. Returns the result.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'JavaScript code. Return a value with: return { kind: "data", value: yourResult }' },
              input: { type: 'object', description: 'Input data available as the "input" variable in the code' },
            },
            required: ['code'],
          },
        },
      },
    },
    {
      toolSpec: {
        name: 'run_simulation',
        description: 'Run a simulation for an outcome type to demonstrate how it works. Only call after the outcome has proof expectations.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              outcomeTypeId: { type: 'string' },
            },
            required: ['outcomeTypeId'],
          },
        },
      },
    },
  ],
};

// Tool execution functions
async function executeTool(toolName: string, input: any, orgId: string): Promise<{ result: any; resourceType?: string; resourceId?: string }> {
  switch (toolName) {
    case 'create_outcome': {
      // Check for existing outcome with same name
      const [existing] = await db.select().from(outcomeTypes)
        .where(and(eq(outcomeTypes.orgId, orgId), eq(outcomeTypes.name, input.name)))
        .limit(1);
      if (existing) {
        return { result: { id: existing.id, name: existing.name, message: `Outcome "${existing.name}" already exists. Using existing.` }, resourceType: 'outcome', resourceId: existing.id };
      }
      const [created] = await db.insert(outcomeTypes).values({
        orgId,
        name: input.name,
        description: input.description,
        riskClass: input.riskClass || 'medium',
        category: input.category || 'operational',
        successCriteria: (input.successCriteria || []).map((c: any) => ({ description: c.description, weight: c.weight })),
        keyDecisions: (input.keyDecisions || []).map((d: any) => ({ name: d.name, description: d.description, automatable: d.automatable })),
        automationBoundaries: {},
        connectedSystems: [],
      }).returning();
      return { result: { id: created.id, name: created.name, message: `Created outcome: ${created.name}` }, resourceType: 'outcome', resourceId: created.id };
    }

    case 'create_proof_expectation': {
      const [created] = await db.insert(proofExpectations).values({
        orgId,
        outcomeTypeId: input.outcomeTypeId,
        name: input.name,
        description: input.description || '',
        checkType: input.checkType as any,
        severity: (input.severity || 'error') as any,
        category: 'compliance' as any,
        config: {},
        requiredEvidenceLevel: 'A' as any,
        judgeThreshold: 0.75,
        onPass: [],
        onFail: [],
      }).returning();
      return { result: { id: created.id, name: created.name, checkType: input.checkType, message: `Added proof expectation: ${created.name} (${input.checkType})` }, resourceType: 'proof', resourceId: created.id };
    }

    case 'create_action': {
      const [existingAction] = await db.select().from(actions)
        .where(and(eq(actions.orgId, orgId), eq(actions.actionId, input.actionId)))
        .limit(1);
      if (existingAction) {
        await db.update(actions).set({
          title: input.title,
          description: input.description || existingAction.description,
          method: input.method || existingAction.method,
          path: input.path ?? existingAction.path,
          isMock: input.isMock ?? existingAction.isMock,
          staticResponse: input.isMock ? { content: JSON.stringify({ success: true }), content_type: 'application/json', status: 200 } : existingAction.staticResponse,
          updatedAt: new Date(),
        }).where(eq(actions.id, existingAction.id));
        return { result: { id: existingAction.id, actionId: existingAction.actionId, title: input.title, isMock: input.isMock, message: `Updated action: ${input.title}${input.isMock ? ' (mock)' : ''}` }, resourceType: 'action', resourceId: existingAction.id };
      }
      const [created] = await db.insert(actions).values({
        orgId,
        actionId: input.actionId,
        title: input.title,
        description: input.description || '',
        method: input.method || 'POST',
        path: input.path || '',
        isMock: input.isMock || false,
        staticResponse: input.isMock ? { content: JSON.stringify({ success: true }), content_type: 'application/json', status: 200 } : undefined,
      }).returning();
      return { result: { id: created.id, actionId: created.actionId, title: created.title, isMock: input.isMock, message: `Created action: ${created.title}${input.isMock ? ' (mock)' : ''}` }, resourceType: 'action', resourceId: created.id };
    }

    case 'link_action_to_outcome': {
      const [ot] = await db.select().from(outcomeTypes)
        .where(and(eq(outcomeTypes.id, input.outcomeTypeId), eq(outcomeTypes.orgId, orgId)))
        .limit(1);
      if (!ot) return { result: { error: 'Outcome not found' } };
      const existing = (ot.connectedSystems as any[]) || [];
      const updated = [...existing, { systemId: input.actionUuid, name: input.actionName || '', role: input.role || 'action' }];
      await db.update(outcomeTypes).set({ connectedSystems: updated, updatedAt: new Date() }).where(eq(outcomeTypes.id, input.outcomeTypeId));
      return { result: { message: `Linked action to outcome` } };
    }

    case 'open_action_editor': {
      return { result: { url: `/dashboard/actions`, actionSlug: input.actionSlug, instructions: input.instructions || 'Configure credentials and test the connection', message: `Open the action editor to configure: ${input.instructions || input.actionSlug}` } };
    }

    case 'create_hosted_action': {
      // Check for existing
      const [existingHosted] = await db.select().from(actions)
        .where(and(eq(actions.orgId, orgId), eq(actions.actionId, input.actionId)))
        .limit(1);
      if (existingHosted) {
        // Update the code
        await db.update(actions).set({
          hosted: { runtime: 'javascript', code: input.code, timeout_ms: input.timeoutMs || 6000, permissions: { net_allow: input.netAllow || [] } },
          updatedAt: new Date(),
        }).where(eq(actions.id, existingHosted.id));
        return { result: { id: existingHosted.id, actionId: input.actionId, title: existingHosted.title, message: `Updated hosted action: ${existingHosted.title}` }, resourceType: 'action', resourceId: existingHosted.id };
      }
      const [created] = await db.insert(actions).values({
        orgId,
        actionId: input.actionId,
        title: input.title,
        description: input.description || '',
        method: 'POST',
        path: '',
        isMock: false,
        hosted: { runtime: 'javascript', code: input.code, timeout_ms: input.timeoutMs || 6000, permissions: { net_allow: input.netAllow || [] } },
      }).returning();
      return { result: { id: created.id, actionId: created.actionId, title: created.title, message: `Created hosted action: ${created.title} (JavaScript sandbox)` }, resourceType: 'action', resourceId: created.id };
    }

    case 'execute_code': {
      try {
        const { executeHostedJS } = await import('../../services/hosted/executor.js');
        const result = await executeHostedJS({
          code: input.code,
          input: input.input || {},
          permissions: { net_allow: [], env: [] },
          timeoutMs: 6000,
        });
        if (result.ok) {
          return { result: { success: true, output: result.body, logs: result.logs, message: `Code executed successfully` } };
        } else {
          return { result: { success: false, error: result.error, logs: result.logs, message: `Code execution failed: ${result.error}` } };
        }
      } catch (err: any) {
        return { result: { success: false, error: err?.message || 'Execution failed', message: `Code execution error: ${err?.message}` } };
      }
    }

    case 'run_simulation': {
      return { result: { outcomeTypeId: input.outcomeTypeId, action: 'simulate', message: 'Ready to run simulation' }, resourceType: 'simulation', resourceId: input.outcomeTypeId };
    }

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

export interface OutcomeBuilderResult {
  reply: string;
  toolResults: Array<{ tool: string; result: any; resourceType?: string; resourceId?: string }>;
  createdResources: Array<{ type: string; id: string }>;
}

export async function runOutcomeBuilder(
  orgId: string,
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<OutcomeBuilderResult> {
  // Build conversation messages (filter out empty content)
  const messages: Message[] = [];
  for (const h of history) {
    if (!h.content) continue;
    messages.push({
      role: h.role,
      content: [{ text: String(h.content) }],
    });
  }
  messages.push({ role: 'user', content: [{ text: message }] });

  const toolResults: OutcomeBuilderResult['toolResults'] = [];
  const createdResources: OutcomeBuilderResult['createdResources'] = [];

  // Tool use loop — keep calling the model until it responds with text only
  let currentMessages = [...messages];
  const MAX_ITERATIONS = 10;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: currentMessages,
      toolConfig: TOOL_CONFIG,
      inferenceConfig: { temperature: 0.7, maxTokens: 4096 },
    });

    const resp = await bedrockClient.send(command);
    const outputContent = resp.output?.message?.content || [];
    const stopReason = resp.stopReason;

    // Check if model wants to use tools
    if (stopReason === 'tool_use') {
      // Add assistant message with tool use blocks
      currentMessages.push({ role: 'assistant', content: outputContent });

      // Process each tool use
      const toolResultBlocks: ContentBlock[] = [];
      for (const block of outputContent) {
        if ('toolUse' in block && block.toolUse) {
          const { toolUseId, name, input } = block.toolUse;
          const execResult = await executeTool(name!, input as any, orgId);
          toolResults.push({ tool: name!, result: execResult.result, resourceType: execResult.resourceType, resourceId: execResult.resourceId });
          if (execResult.resourceType && execResult.resourceId) {
            createdResources.push({ type: execResult.resourceType, id: execResult.resourceId });
          }
          toolResultBlocks.push({
            toolResult: {
              toolUseId: toolUseId!,
              content: [{ json: execResult.result }] as ToolResultContentBlock[],
            },
          });
        }
      }

      // Add tool results as user message
      currentMessages.push({ role: 'user', content: toolResultBlocks });
      continue; // Loop back to get model's next response
    }

    // Model responded with text — extract and return
    const textParts = outputContent.filter((b: any) => 'text' in b);
    const reply = textParts.map((b: any) => b.text).join('') || 'I couldn\'t generate a response. Please try again.';
    return { reply, toolResults, createdResources };
  }

  return { reply: 'The builder reached its processing limit. Please continue the conversation.', toolResults, createdResources };
}
