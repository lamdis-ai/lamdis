import { NextRequest } from "next/server";
import { getBearerSafe } from "@/lib/auth";
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Initialize Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const API = process.env.LAMDIS_API_URL || "http://localhost:3100";
const CLAUDE_MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || "us.anthropic.claude-sonnet-4-20250514-v1:0";

// READ-ONLY ALLOWED TOOLS - only list and get operations permitted
const READONLY_ALLOWED_TOOLS = new Set([
  // List tools
  'list_test_suites',
  'list_tests',
  'list_environments',
  'list_actions',
  'list_setups',
  'list_runs',
  // Get tools
  'get_test',
  'get_testsuite',
  'get_environment',
  'get_action',
  'get_setup',
  'get_run',
  // Documentation tools
  'search_docs',
  'get_doc_page',
]);

/**
 * Streaming chat endpoint for the Lamdis Assistant (READ-ONLY MODE)
 * 
 * SECURITY: This endpoint operates in strict read-only mode:
 * - Only list and get operations are permitted
 * - All write operations (create/update/delete) are blocked
 * - Credentials and secrets are automatically redacted
 * - Prompt injection attempts are detected and blocked
 */
export async function POST(req: NextRequest) {
  const bearer = await getBearerSafe();
  if (!bearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    let orgId = body.orgId;

    // Handle nested orgId object
    if (typeof orgId === "object" && orgId?.orgId) {
      orgId = orgId.orgId;
    }

    if (!orgId) {
      return new Response(JSON.stringify({ error: "Missing orgId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { message, history = [] } = body;
    
    // SECURITY: Always force read-only mode - ignore any mode parameter from client
    const mode = "lamdis-readonly";

    // Get the system prompt from the backend API (read-only version)
    let systemPrompt = "";
    try {
      const contextRes = await fetch(`${API}/orgs/${orgId}/assistant/context?mode=${mode}`, {
        method: "GET",
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (contextRes.ok) {
        const contextData = await contextRes.json();
        systemPrompt = contextData.systemPrompt || "";
      }
    } catch (contextErr) {
      console.warn("[AssistantStream] Failed to fetch context, using fallback:", contextErr);
    }

    // If we couldn't get system prompt from API, use a secure fallback
    if (!systemPrompt) {
      systemPrompt = getReadOnlySystemPrompt();
    }

    // Build messages for Converse API
    const converseMessages = [
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: [{ text: h.content }],
      })),
      {
        role: "user" as const,
        content: [{ text: message }],
      },
    ];

    // Create a TransformStream for SSE
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Send start event
          sendEvent("start", {
            status: "processing",
            timestamp: new Date().toISOString(),
            mode,
            readOnly: true,
          });

          // Create streaming command
          const command = new ConverseStreamCommand({
            modelId: CLAUDE_MODEL_ID,
            system: [{ text: systemPrompt }],
            messages: converseMessages,
            inferenceConfig: {
              temperature: 0.2, // Lower temperature for more consistent/safe outputs
              maxTokens: 2048,
            },
          });

          // Start streaming
          const response = await bedrockClient.send(command);

          let fullText = "";

          if (response.stream) {
            for await (const event of response.stream) {
              if (event.contentBlockDelta?.delta?.text) {
                const text = event.contentBlockDelta.delta.text;
                fullText += text;
                
                // Send text chunk event
                sendEvent("text", { text });
              }
            }
          }

          // Strip thinking tags and clean response
          let cleanedText = fullText;
          cleanedText = cleanedText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
          cleanedText = cleanedText.replace(/<thinking>[\s\S]*$/gi, "");
          cleanedText = cleanedText.replace(/<\/thinking>/gi, "");
          cleanedText = cleanedText.trim();

          // Try to parse as JSON for structured response
          let structured = null;
          let responseText = cleanedText;
          let toolResults: any[] = [];
          
          try {
            // Try to extract JSON from the response
            const firstBrace = cleanedText.indexOf("{");
            const lastBrace = cleanedText.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              const jsonStr = cleanedText.slice(firstBrace, lastBrace + 1);
              structured = JSON.parse(jsonStr);
              responseText = structured.response || cleanedText;
              
              // Execute tool calls if present (READ-ONLY ONLY)
              if (Array.isArray(structured.tool_calls) && structured.tool_calls.length > 0) {
                for (const call of structured.tool_calls.slice(0, 5)) { // Limit to 5 calls
                  try {
                    const result = await executeReadOnlyToolCall(orgId, call, bearer);
                    toolResults.push({
                      tool: call.tool,
                      result: result,
                    });
                    sendEvent("tool_result", {
                      tool: call.tool,
                      result: result,
                    });
                  } catch (toolErr: any) {
                    toolResults.push({
                      tool: call.tool,
                      error: toolErr?.message || "Tool execution failed",
                    });
                    sendEvent("tool_result", {
                      tool: call.tool,
                      error: toolErr?.message || "Tool execution failed",
                    });
                  }
                }
                structured.tool_results = toolResults;
              }
              
              // SECURITY: Remove any operations that might have been included
              delete structured.operations;
            }
          } catch {
            // Not valid JSON, use the text as-is
          }

          // Sanitize response to ensure no credentials leak
          responseText = sanitizeOutput(responseText);

          // Send the final message event
          sendEvent("message", {
            response: responseText,
            structured,
            fullText: sanitizeOutput(cleanedText),
            readOnly: true,
          });

          // Send completion event
          sendEvent("done", {
            status: "complete",
            timestamp: new Date().toISOString(),
            readOnly: true,
          });
        } catch (error: any) {
          console.error("[AssistantStream] Error:", error);
          sendEvent("error", { error: "Stream error occurred" }); // Don't expose internal error details
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    console.error("[AssistantStream] Error:", err);
    return new Response(JSON.stringify({ error: "Stream error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Sanitize output to ensure no credentials leak
 */
function sanitizeOutput(text: string): string {
  const credentialPatterns = [
    /(sk-[a-zA-Z0-9]{20,})/g,
    /(sk_live_[a-zA-Z0-9]{20,})/g,
    /(sk_test_[a-zA-Z0-9]{20,})/g,
    /(AIza[a-zA-Z0-9_-]{35})/g,
    /(ghp_[a-zA-Z0-9]{36})/g,
    /(AKIA[A-Z0-9]{16})/g,
    /(Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/gi,
    /(mongodb(\+srv)?:\/\/[^\s]+)/gi,
    /(postgres(ql)?:\/\/[^\s]+)/gi,
    /(password\s*[=:]\s*["']?[^"'\s]+["']?)/gi,
    /(secret\s*[=:]\s*["']?[^"'\s]+["']?)/gi,
    /(api[_-]?key\s*[=:]\s*["']?[^"'\s]+["']?)/gi,
  ];
  
  let sanitized = text;
  for (const pattern of credentialPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

/**
 * Execute a READ-ONLY tool call via the backend API
 * SECURITY: Only list and get operations are allowed
 */
async function executeReadOnlyToolCall(orgId: string, call: { tool: string; params: any }, bearer: string): Promise<any> {
  const { tool, params } = call;
  
  // SECURITY: Block any tool that is not in the allowed list
  if (!READONLY_ALLOWED_TOOLS.has(tool)) {
    throw new Error(`Operation not permitted: ${tool}. Only read operations are allowed.`);
  }
  
  // Map tool names to API endpoints (READ-ONLY endpoints only)
  if (tool === "list_test_suites") {
    const res = await fetch(`${API}/orgs/${orgId}/suites`, {
      headers: { Authorization: bearer },
    });
    if (!res.ok) throw new Error("Failed to list suites");
    const data = await res.json();
    return sanitizeResponse(data);
  }
  
  if (tool === "list_tests") {
    const suiteId = params?.filter?.suiteId;
    const url = suiteId 
      ? `${API}/orgs/${orgId}/tests?suiteId=${suiteId}`
      : `${API}/orgs/${orgId}/tests`;
    const res = await fetch(url, {
      headers: { Authorization: bearer },
    });
    if (!res.ok) throw new Error("Failed to list tests");
    const data = await res.json();
    return sanitizeResponse(data);
  }
  
  if (tool === "get_test") {
    if (!params?.id) throw new Error("Missing test ID");
    const res = await fetch(`${API}/orgs/${orgId}/tests/${params.id}`, {
      headers: { Authorization: bearer },
    });
    if (!res.ok) throw new Error("Test not found");
    const data = await res.json();
    return sanitizeResponse(data);
  }
  
  if (tool === "list_environments") {
    const res = await fetch(`${API}/orgs/${orgId}/environments`, {
      headers: { Authorization: bearer },
    });
    if (!res.ok) throw new Error("Failed to list environments");
    const data = await res.json();
    // Extra sanitization for environments - redact auth config
    return sanitizeEnvironments(data);
  }
  
  if (tool === "get_environment") {
    if (!params?.id) throw new Error("Missing environment ID");
    const res = await fetch(`${API}/orgs/${orgId}/environments/${params.id}`, {
      headers: { Authorization: bearer },
    });
    if (!res.ok) throw new Error("Environment not found");
    const data = await res.json();
    return sanitizeEnvironments(data);
  }
  
  if (tool === "list_actions") {
    const res = await fetch(`${API}/orgs/${orgId}/actions`, {
      headers: { Authorization: bearer },
    });
    if (!res.ok) throw new Error("Failed to list actions");
    const data = await res.json();
    return sanitizeResponse(data);
  }
  
  if (tool === "list_setups") {
    const res = await fetch(`${API}/orgs/${orgId}/setups`, {
      headers: { Authorization: bearer },
    });
    if (!res.ok) throw new Error("Failed to list setups");
    const data = await res.json();
    return sanitizeResponse(data);
  }
  
  throw new Error(`Unknown tool: ${tool}`);
}

/**
 * Sanitize response data to remove sensitive fields
 */
function sanitizeResponse(data: any): any {
  if (!data) return data;
  
  const sensitiveFields = new Set([
    'password', 'secret', 'token', 'apiKey', 'api_key', 'accessToken',
    'refreshToken', 'privateKey', 'secretKey', 'authToken', 'bearerToken',
    'clientSecret', 'authConfig', 'credentials', 'encryptedValue', 'value',
    'headers', // May contain auth headers
  ]);
  
  const sanitize = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item));
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.has(key)) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        result[key] = sanitize(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  };
  
  return sanitize(data);
}

/**
 * Extra sanitization for environment data
 */
function sanitizeEnvironments(data: any): any {
  const sanitized = sanitizeResponse(data);
  
  // Additional environment-specific redaction
  const processEnv = (env: any) => {
    if (!env) return env;
    return {
      ...env,
      authConfig: env.authConfig ? { type: env.authConfig?.type || 'configured', ...Object.fromEntries(Object.keys(env.authConfig).filter(k => k !== 'type').map(k => [k, '[REDACTED]'])) } : undefined,
      headers: env.headers ? '[REDACTED - contains authorization]' : undefined,
    };
  };
  
  if (Array.isArray(sanitized)) {
    return sanitized.map(processEnv);
  }
  return processEnv(sanitized);
}

/**
 * Get a secure read-only system prompt
 */
function getReadOnlySystemPrompt(): string {
  return `You are the Lamdis Read-Only Assistant. You help users UNDERSTAND their Lamdis configuration without making any changes.

CRITICAL SECURITY RULES:
1. You are in READ-ONLY mode. You CANNOT create, update, or delete anything.
2. NEVER reveal credentials, API keys, secrets, passwords, or tokens.
3. When describing authentication, say "authentication is configured" rather than showing values.
4. You can only access data from the user's current organization.

What you CAN help with:
- Explaining test configurations and results
- Describing how suites, environments, and actions are set up
- Answering questions about Lamdis features and best practices
- Summarizing test run results and pass rates

What you CANNOT do:
- Create, update, or delete any resources
- Reveal any credentials or secrets
- Access data from other organizations
- Execute any write operations

RESPONSE FORMAT - Return valid JSON:
{
  "version": "2",
  "response": "Your helpful message here",
  "tool_calls": [{"tool": "list_tests", "params": {}}],
  "questions": [],
  "context_used": []
}

Available READ-ONLY tools:
- list_test_suites: List all test suites
- list_tests: List tests (optionally filter by suiteId)
- get_test: Get details of a specific test by ID
- list_environments: List environments (credentials redacted)
- list_actions: List actions
- list_setups: List setups

Help users understand their configuration without making any changes.`;
}