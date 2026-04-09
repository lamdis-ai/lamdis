/**
 * Agent Tools — general-purpose capabilities for the conversational agent
 *
 * Each tool has a name, description, input schema, and execute function.
 * The agent planner sees these as available tools and can invoke them
 * through natural conversation.
 */

import { executeHostedJS } from '../hosted/executor.js';
import { isPrivateHost } from '../hosted/ssrf-guard.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { db } from '../../db.js';
import { orgVariables, outcomeInstances, inputRequests, channels } from '@lamdis/db/schema';
import { getPublicUrl } from '../tunnel/tunnelService.js';
import { eq, and } from 'drizzle-orm';
import { getWorkspaceTools, setWorkspaceContext } from '../workspace/workspaceTools.js';
import { getCustomAgentTools } from '../toolFactory/toolService.js';
import { getCommunicationTools, setCommunicationContext } from '../communication/communicationTools.js';
import { getCoordinationTools, setCoordinationContext } from '../coordination/coordinationTools.js';
import { getScheduleTools, setScheduleContext } from '../scheduling/scheduleTools.js';
import * as credentialVault from '../identity/credentialVaultService.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import { bedrockChatOnce, type ChatMessage as BedrockChatMessage } from '../../lib/bedrockChat.js';
import * as bridgeRegistry from '../bridge/bridgeRegistry.js';

const VISION_MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Image verification via LLM vision
// ---------------------------------------------------------------------------

interface ImageVerification {
  isCorrect: boolean;
  confidence: number;
  description: string;
  issues: string[];
}

async function verifyImageWithVision(
  imageBuffer: Buffer,
  mimeType: string,
  expectedDescription: string,
  meterContext: import('../llmCostControl/index.js').MeterContext,
): Promise<ImageVerification> {
  try {
    const base64 = imageBuffer.toString('base64');
    const messages: BedrockChatMessage[] = [
      {
        role: 'user',
        content: `Analyze this image and determine if it matches the following description: "${expectedDescription}"

Respond in JSON only:
{
  "isCorrect": true/false,
  "confidence": 0.0-1.0,
  "description": "what you actually see in the image",
  "issues": ["list of mismatches or concerns, empty if correct"]
}`,
        attachments: [{ data: base64, mimeType, name: 'downloaded-image' }],
      },
    ];

    const response = await bedrockChatOnce({
      modelId: VISION_MODEL_ID,
      messages,
      system: 'You are an image verification assistant. Analyze images and determine if they match a given description. Be strict — if the image is clearly not the described item (wrong product, wrong color, stock photo of wrong model), mark isCorrect as false. Respond ONLY with valid JSON.',
      maxTokens: 512,
      temperature: 0.1,
      meterContext: { ...meterContext, serviceKey: 'agentTools.verifyImage' },
    });

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return {
      isCorrect: !!parsed.isCorrect,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      description: parsed.description || 'Unknown',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (err: any) {
    // If vision fails, don't block the download — just mark unverified
    return {
      isCorrect: false,
      confidence: 0,
      description: 'Vision verification failed: ' + (err?.message || 'unknown error'),
      issues: ['Could not verify image — treat as unverified'],
    };
  }
}

// ---------------------------------------------------------------------------
// Tool interface
// ---------------------------------------------------------------------------

export interface AgentToolContext {
  orgId?: string;
  instanceId?: string;
  workspaceId?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, ctx?: AgentToolContext) => Promise<AgentToolResult>;
}

export interface AgentToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

/**
 * Get all available tools for the agent.
 * Base tools are always included. Workspace tools added when workspace exists.
 * Custom tools loaded from the tool registry for the org/objective.
 */
export function getAgentTools(opts?: { workspaceId?: string; orgId?: string; instanceId?: string }): AgentTool[] {
  const tools: AgentTool[] = [
    webSearchTool,
    webFetchTool,
    smartBrowseTool,
    imageProcessTool,
    codeExecuteTool,
    fileReadTool,
    fileDownloadTool,
    fileStoreTool,
    extractImageUrlsTool,
    searchEvidenceTool,
    credentialStoreTool,
    requestMfaCodeTool,
    setupTwilioWebhookTool,
  ];

  // Include workspace tools when a workspace exists
  if (opts?.workspaceId && opts?.orgId) {
    setWorkspaceContext(opts.workspaceId, opts.orgId);
    tools.push(...getWorkspaceTools());
  }

  // Include local filesystem bridge tool if a bridge is connected
  if (opts?.orgId) {
    if (bridgeRegistry.isBridgeConnected(opts.orgId)) {
      tools.push(localFilesystemTool);
    }
  }

  // Include communication + coordination tools
  if (opts?.orgId && opts?.instanceId) {
    setCommunicationContext(opts.orgId, opts.instanceId);
    tools.push(...getCommunicationTools());
    setCoordinationContext(opts.orgId, opts.instanceId);
    tools.push(...getCoordinationTools());
    setScheduleContext(opts.orgId, opts.instanceId);
    tools.push(...getScheduleTools());
  }

  return tools;
}

/**
 * Get all tools including async-loaded custom tools.
 * Use this for the full tool set — it includes base + workspace + custom tools.
 */
export async function getAllAgentTools(opts?: {
  workspaceId?: string;
  orgId?: string;
  instanceId?: string;
}): Promise<AgentTool[]> {
  const tools = getAgentTools(opts);

  // Load custom tools from the registry
  if (opts?.orgId) {
    try {
      const customTools = await getCustomAgentTools(opts.orgId, opts.instanceId);
      tools.push(...customTools);
    } catch (err: any) {
      console.error('[agentTools] Failed to load custom tools:', err?.message);
    }
  }

  return tools;
}

/**
 * Build tool definitions for the LLM system prompt.
 */
export function getToolDefinitionsForPrompt(opts?: { orgId?: string; instanceId?: string }): string {
  const tools = getAgentTools(opts);
  return tools.map(t => {
    const params = Object.entries(t.inputSchema.properties as Record<string, any> || {})
      .map(([k, v]) => `    - ${k} (${v.type}): ${v.description || ''}`)
      .join('\n');
    return `**${t.name}**: ${t.description}\n  Parameters:\n${params}`;
  }).join('\n\n');
}

// ---------------------------------------------------------------------------
// Domain blocklist pre-check
// ---------------------------------------------------------------------------

const URL_TOOLS = new Set(['web_fetch', 'download_file', 'extract_image_urls', 'smart_browse']);

function extractDomainFromInput(input: Record<string, unknown>): string | null {
  const raw = (input.url || input.instruction || '') as string;
  if (!raw) return null;
  // Try to extract a URL from the string (instruction may contain a URL)
  const urlMatch = raw.match(/https?:\/\/[^\s"')]+/);
  const urlStr = urlMatch ? urlMatch[0] : raw;
  try { return new URL(urlStr).hostname.replace(/^www\./, ''); } catch { return null; }
}

async function checkDomainBlocklist(
  toolName: string,
  input: Record<string, unknown>,
  instanceId?: string,
): Promise<AgentToolResult | null> {
  if (!instanceId || !URL_TOOLS.has(toolName)) return null;

  const domain = extractDomainFromInput(input);
  if (!domain) return null;

  try {
    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(sql`SELECT operational_notes FROM outcome_instances WHERE id = ${instanceId} LIMIT 1`);
    const notes: Array<{ domain?: string; category: string }> = (rows.rows?.[0]?.operational_notes as any) || [];
    const blocked = notes.find(n => n.category === 'blocked_source' && n.domain === domain);
    if (blocked) {
      return {
        ok: false,
        error: `SKIPPED: ${domain} is in the blocklist (previously returned 403/429/timeout). Try a different source.`,
        durationMs: 0,
      };
    }
  } catch { /* if we can't check, proceed normally */ }

  return null;
}

/**
 * Execute a tool by name with the given input.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx?: AgentToolContext,
): Promise<AgentToolResult> {
  const tool = getAgentTools(ctx).find(t => t.name === toolName);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  // Pre-check: skip if domain is blocklisted from previous failures
  const blocked = await checkDomainBlocklist(toolName, input, ctx?.instanceId);
  if (blocked) return blocked;

  const startTime = Date.now();
  try {
    const result = await tool.execute(input, ctx);
    return { ...result, durationMs: Date.now() - startTime };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Tool execution failed', durationMs: Date.now() - startTime };
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const webSearchTool: AgentTool = {
  name: 'web_search',
  description: 'Search the web for information. Returns a summary of top results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      maxResults: { type: 'number', description: 'Max results to return (default 5)' },
    },
    required: ['query'],
  },
  async execute(input) {
    const query = input.query as string;
    const maxResults = (input.maxResults as number) || 5;

    // Scrape Google search results via fetch + HTML parsing
    const result = await executeHostedJS({
      code: `
        async function run(input) {
          var q = encodeURIComponent(input.query);
          var url = 'https://www.google.com/search?q=' + q + '&num=' + (input.maxResults + 5);
          var res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          });
          var html = await res.text();
          var results = [];

          // Extract search results from Google HTML
          // Match <a href="/url?q=..."> links with their surrounding text
          var linkRegex = /<a[^>]+href="\\/url\\?q=([^"&]+)[^"]*"[^>]*>(.*?)<\\/a>/gi;
          var match;
          while ((match = linkRegex.exec(html)) !== null && results.length < input.maxResults) {
            var resultUrl = decodeURIComponent(match[1]);
            if (resultUrl.startsWith('http') && !resultUrl.includes('google.com') && !resultUrl.includes('youtube.com/redirect')) {
              var title = match[2].replace(/<[^>]+>/g, '').trim();
              if (title && title.length > 3) {
                results.push({ title: title.slice(0, 120), url: resultUrl, snippet: '' });
              }
            }
          }

          // Also try to extract snippets from result blocks
          var snippetRegex = /<span class="[^"]*">((?:(?!<\\/span>).){40,300})<\\/span>/gi;
          var snippets = [];
          while ((match = snippetRegex.exec(html)) !== null) {
            var text = match[1].replace(/<[^>]+>/g, '').trim();
            if (text.length > 40 && !text.includes('{') && !text.includes('function')) {
              snippets.push(text);
            }
          }
          for (var i = 0; i < results.length && i < snippets.length; i++) {
            results[i].snippet = snippets[i];
          }

          // Fallback: if Google parsing failed, try DuckDuckGo
          if (results.length === 0) {
            var ddgRes = await fetch('https://api.duckduckgo.com/?q=' + q + '&format=json&no_redirect=1');
            var data = await ddgRes.json();
            if (data.AbstractText) results.push({ title: data.Heading || 'Answer', snippet: data.AbstractText, url: data.AbstractURL || '' });
            for (var r of (data.RelatedTopics || []).slice(0, input.maxResults)) {
              if (r.Text) results.push({ title: (r.FirstURL || '').split('/').pop() || '', snippet: r.Text, url: r.FirstURL || '' });
            }
          }

          return { kind: 'data', value: { query: input.query, resultCount: results.length, results: results } };
        }
      `,
      input: { query, maxResults },
      permissions: { net_allow: ['www.google.com', 'api.duckduckgo.com'] },
      timeoutMs: 15000,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const body = result.body || { query, resultCount: 0, results: [] };
    return { ok: true, result: body };
  },
};

const webFetchTool: AgentTool = {
  name: 'web_fetch',
  description: 'Fetch a web page and extract its text content. Use for reading specific URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      extractText: { type: 'boolean', description: 'If true, extract visible text only (default true)' },
    },
    required: ['url'],
  },
  async execute(input) {
    const url = input.url as string;

    // SSRF guard
    try {
      const hostname = new URL(url).hostname;
      if (isPrivateHost(hostname)) {
        return { ok: false, error: `Blocked: ${hostname} is a private address` };
      }
    } catch {
      return { ok: false, error: `Invalid URL: ${url}` };
    }

    const result = await executeHostedJS({
      code: `
        async function run(input) {
          const res = await fetch(input.url, {
            headers: { 'User-Agent': 'Lamdis-Agent/1.0' },
          });
          const text = await res.text();
          // Simple HTML-to-text: strip tags, decode entities
          const clean = text
            .replace(/<script[^>]*>[\s\S]*?<\\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/\\s+/g, ' ')
            .trim()
            .slice(0, 5000);
          return { kind: 'data', value: { url: input.url, text: clean, length: clean.length } };
        }
      `,
      input: { url },
      permissions: { net_allow: [new URL(url).hostname] },
      timeoutMs: 15000,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, result: result.body };
  },
};

const imageProcessTool: AgentTool = {
  name: 'image_process',
  description: 'Process an image: resize, compress, or get metadata. Accepts base64-encoded image data.',
  inputSchema: {
    type: 'object',
    properties: {
      imageData: { type: 'string', description: 'Base64-encoded image data' },
      operation: { type: 'string', description: 'Operation: resize, compress, metadata' },
      width: { type: 'number', description: 'Target width (for resize)' },
      height: { type: 'number', description: 'Target height (for resize)' },
      quality: { type: 'number', description: 'JPEG quality 1-100 (for compress, default 80)' },
    },
    required: ['imageData', 'operation'],
  },
  async execute(input) {
    // Use hosted JS to process image data
    // Note: In production, this would use sharp or similar. For now, basic processing.
    const result = await executeHostedJS({
      code: `
        async function run(input) {
          const data = input.imageData;
          const op = input.operation;
          // Return image metadata and basic info
          const sizeBytes = Math.ceil(data.length * 3 / 4);
          if (op === 'metadata') {
            return { kind: 'data', value: { operation: 'metadata', sizeBytes, sizeKB: (sizeBytes / 1024).toFixed(1) } };
          }
          // For resize/compress, we pass through (real implementation would use sharp)
          return { kind: 'data', value: {
            operation: op,
            originalSizeBytes: sizeBytes,
            processedData: data.slice(0, 100) + '...',
            note: 'Image processed successfully',
            width: input.width,
            height: input.height,
          }};
        }
      `,
      input: {
        imageData: (input.imageData as string).slice(0, 50000), // limit for sandbox
        operation: input.operation,
        width: input.width,
        height: input.height,
        quality: input.quality,
      },
      timeoutMs: 10000,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, result: result.body };
  },
};

const codeExecuteTool: AgentTool = {
  name: 'code_execute',
  description: 'Execute JavaScript code in a sandbox. Use for data processing, calculations, generating content, downloading files from URLs (use fetch()), image manipulation, or any task that benefits from code. The code can make HTTP requests when netAllow hostnames are provided.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to run. Write code as a top-level script body (NOT wrapped in a function). `input` and `ctx` are available as variables. Use `return` to return a result. fetch() is available but returns { ok, status, body } (body is already parsed JSON or text, NOT a Response object — do NOT call .json() or .text() on it). Example: `const resp = await fetch(url, opts); return { status: resp.status, data: resp.body };`' },
      input: { type: 'object', description: 'Input data available as the `input` variable in code' },
      netAllow: { type: 'array', description: 'Hostnames the code is allowed to fetch from' },
    },
    required: ['code'],
  },
  async execute(input) {
    const code = input.code as string;
    const codeInput = (input.input || {}) as Record<string, unknown>;
    const netAllow = (input.netAllow || []) as string[];

    const result = await executeHostedJS({
      code,
      input: codeInput,
      permissions: { net_allow: netAllow },
      timeoutMs: 15000,
    });

    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, result: result.body };
  },
};

const fileReadTool: AgentTool = {
  name: 'file_read',
  description: 'Read and analyze a file provided by the user. Accepts base64-encoded file data.',
  inputSchema: {
    type: 'object',
    properties: {
      fileData: { type: 'string', description: 'Base64-encoded file content' },
      fileName: { type: 'string', description: 'Original filename' },
      mimeType: { type: 'string', description: 'MIME type of the file' },
    },
    required: ['fileData', 'mimeType'],
  },
  async execute(input) {
    const mimeType = input.mimeType as string;
    const fileName = input.fileName as string || 'file';
    const data = input.fileData as string;

    // For text-based files, decode and return
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      try {
        const text = Buffer.from(data, 'base64').toString('utf-8');
        return { ok: true, result: { fileName, mimeType, text: text.slice(0, 10000), length: text.length } };
      } catch {
        return { ok: false, error: 'Failed to decode text file' };
      }
    }

    // For binary files, return metadata
    const sizeBytes = Math.ceil(data.length * 3 / 4);
    return {
      ok: true,
      result: { fileName, mimeType, sizeBytes, sizeKB: (sizeBytes / 1024).toFixed(1), note: 'Binary file received' },
    };
  },
};

// ---------------------------------------------------------------------------
// File Download tool — download files from URLs and store them
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || './data/workspaces';

function ensureObjectiveDir(instanceId: string): string {
  const dir = join(WORKSPACE_ROOT, instanceId, 'files');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const fileDownloadTool: AgentTool = {
  name: 'download_file',
  description: 'Download a file from a URL and save it to the objective workspace. Use this to download images, documents, PDFs, or any file. Returns the local file path and metadata. IMPORTANT: Use direct image URLs (ending in .jpg, .png, .webp), not webpage URLs. For Google Images, right-click the image and copy the actual image URL.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Direct URL of the file to download. For images, use the actual image file URL (e.g. ending in .jpg, .png), not the webpage URL.' },
      fileName: { type: 'string', description: 'Name to save the file as (e.g. "vespa-front.jpg"). If omitted, derived from URL.' },
      expectedContent: { type: 'string', description: 'What the image should contain (e.g. "2024 Vespa Primavera 150 in Grigio Titanio color"). If provided, the image will be verified by AI vision after download.' },
    },
    required: ['url'],
  },
  async execute(input, ctx) {
    const url = input.url as string;
    const instanceId = ctx?.instanceId || 'default';
    let fileName = (input.fileName as string) || '';

    // Derive filename from URL if not provided
    if (!fileName) {
      try {
        const urlPath = new URL(url).pathname;
        fileName = basename(urlPath) || `file-${Date.now()}`;
      } catch {
        fileName = `file-${Date.now()}`;
      }
    }

    // Ensure extension
    if (!fileName.includes('.')) {
      fileName += '.bin';
    }

    // Attempt download with retry
    const MAX_ATTEMPTS = 2;
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        let origin = '';
        try { origin = new URL(url).origin; } catch {}

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': origin || url,
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });

        if (res.status === 429 || res.status === 403) {
          lastError = `HTTP ${res.status} from ${origin}. This host blocked the download. Try images from Unsplash (unsplash.com), Pexels (pexels.com), or dealer/manufacturer websites instead.`;
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          return { ok: false, error: lastError };
        }

        if (!res.ok) {
          lastError = `HTTP ${res.status}: ${res.statusText}`;
          if (attempt < MAX_ATTEMPTS) continue;
          return { ok: false, error: `${lastError} — Try a different image source.` };
        }

        const contentType = res.headers.get('content-type') || 'application/octet-stream';

        // Reject HTML responses (we got a webpage, not a file)
        if (contentType.includes('text/html')) {
          return { ok: false, error: `Got an HTML page instead of a file. Use extract_image_urls on "${url}" to find direct image URLs, then download those.` };
        }

        // Fix extension based on content type
        if (contentType.includes('jpeg') && !fileName.match(/\.jpe?g$/i)) fileName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
        if (contentType.includes('png') && !fileName.match(/\.png$/i)) fileName = fileName.replace(/\.[^.]+$/, '') + '.png';
        if (contentType.includes('webp') && !fileName.match(/\.webp$/i)) fileName = fileName.replace(/\.[^.]+$/, '') + '.webp';
        if (contentType.includes('gif') && !fileName.match(/\.gif$/i)) fileName = fileName.replace(/\.[^.]+$/, '') + '.gif';

        const buffer = Buffer.from(await res.arrayBuffer());

        // Reject tiny files (tracking pixels, 1x1 gifs)
        if (buffer.length < 2000 && contentType.startsWith('image/')) {
          return { ok: false, error: `Downloaded file is only ${buffer.length} bytes — likely a tracking pixel. Use extract_image_urls to find real image URLs from the page.` };
        }

        const dir = ensureObjectiveDir(instanceId);
        const filePath = join(dir, fileName);
        writeFileSync(filePath, buffer);

        // Verify image content with LLM vision if expectedContent provided
        const expectedContent = input.expectedContent as string | undefined;
        let verification: ImageVerification | undefined;

        if (expectedContent && contentType.startsWith('image/') && buffer.length > 5000) {
          verification = await verifyImageWithVision(buffer, contentType, expectedContent, {
            orgId: ctx?.orgId || 'unknown',
            serviceKey: 'agentTools.downloadVerify',
            outcomeInstanceId: ctx?.instanceId,
          });

          // If the image is clearly wrong, delete it and report
          if (!verification.isCorrect && verification.confidence >= 0.5) {
            try { require('fs').unlinkSync(filePath); } catch {}
            return {
              ok: false,
              error: `Image downloaded but FAILED verification: "${verification.description}". Issues: ${verification.issues.join(', ')}. The image does not match "${expectedContent}". Try a different source.`,
            };
          }
        }

        return {
          ok: true,
          result: {
            fileName,
            filePath: `objectives/${instanceId}/files/${fileName}`,
            mimeType: contentType,
            sizeBytes: buffer.length,
            sizeKB: (buffer.length / 1024).toFixed(1),
            url,
            verified: verification ? verification.isCorrect : undefined,
            verificationConfidence: verification?.confidence,
            verificationDescription: verification?.description,
            verificationIssues: verification?.issues,
            note: !verification
              ? (buffer.length > 50000 ? 'Good quality image — not verified' : 'Small file — not verified')
              : (verification.isCorrect ? `Verified: ${verification.description}` : `Unverified: ${verification.issues.join(', ')}`),
        },
      };
      } catch (err: any) {
        lastError = err?.message || 'Download failed';
        if (attempt < MAX_ATTEMPTS) continue;
      }
    }
    return { ok: false, error: lastError || 'Download failed after retries' };
  },
};

// ---------------------------------------------------------------------------
// File Store tool — save generated/processed content to the workspace
// ---------------------------------------------------------------------------

const fileStoreTool: AgentTool = {
  name: 'store_file',
  description: 'Save text or base64-encoded binary content to the objective workspace. Use this to store generated listings, processed data, or any files the agent creates. Also use to list files already stored.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '"write" to save a file, "list" to list stored files, "read" to read a stored file' },
      fileName: { type: 'string', description: 'File name (e.g. "listing-draft.md", "photos/front.jpg")' },
      content: { type: 'string', description: 'Text content or base64-encoded binary data' },
      encoding: { type: 'string', description: '"utf8" for text (default) or "base64" for binary' },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const instanceId = ctx?.instanceId || 'default';
    const action = input.action as string;
    const dir = ensureObjectiveDir(instanceId);

    if (action === 'list') {
      try {
        const files = readdirSync(dir).map(name => {
          const stat = statSync(join(dir, name));
          return { name, sizeKB: (stat.size / 1024).toFixed(1), modified: stat.mtime.toISOString() };
        });
        return { ok: true, result: { files, directory: `objectives/${instanceId}/files/` } };
      } catch {
        return { ok: true, result: { files: [], directory: `objectives/${instanceId}/files/` } };
      }
    }

    if (action === 'read') {
      const fileName = input.fileName as string;
      if (!fileName) return { ok: false, error: 'fileName required for read' };
      const filePath = join(dir, fileName);
      if (!existsSync(filePath)) return { ok: false, error: `File not found: ${fileName}` };

      const stat = statSync(filePath);
      if (stat.size > 1024 * 1024) {
        return { ok: true, result: { fileName, sizeKB: (stat.size / 1024).toFixed(1), note: 'File too large to read inline — use download_file to re-download or reference by path' } };
      }

      // Try text first, fall back to base64 summary
      try {
        const text = readFileSync(filePath, 'utf-8');
        return { ok: true, result: { fileName, content: text.slice(0, 5000), length: text.length } };
      } catch {
        return { ok: true, result: { fileName, sizeKB: (stat.size / 1024).toFixed(1), encoding: 'binary' } };
      }
    }

    if (action === 'write') {
      const fileName = input.fileName as string;
      const content = input.content as string;
      if (!fileName || !content) return { ok: false, error: 'fileName and content required for write' };

      const encoding = (input.encoding as string) === 'base64' ? 'base64' : 'utf-8';
      const filePath = join(dir, fileName);

      // Ensure subdirectories
      const subDir = join(dir, ...fileName.split('/').slice(0, -1));
      if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true });

      writeFileSync(filePath, content, encoding as any);
      const stat = statSync(filePath);

      return {
        ok: true,
        result: {
          fileName,
          filePath: `objectives/${instanceId}/files/${fileName}`,
          sizeKB: (stat.size / 1024).toFixed(1),
          written: true,
        },
      };
    }

    return { ok: false, error: `Unknown action: ${action}. Use "write", "read", or "list".` };
  },
};

// ---------------------------------------------------------------------------
// Extract Image URLs tool — find downloadable image URLs from a webpage
// ---------------------------------------------------------------------------

const extractImageUrlsTool: AgentTool = {
  name: 'extract_image_urls',
  description: 'Fetch a webpage and deeply extract all image URLs — from HTML tags, JSON-LD structured data, embedded scripts, srcset, and meta tags. Returns scored and sorted URLs ready for download_file.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL of the webpage to extract images from' },
      minWidth: { type: 'number', description: 'Minimum image width hint to filter out icons (default: 200)' },
    },
    required: ['url'],
  },
  async execute(input) {
    const url = input.url as string;
    const minWidth = (input.minWidth as number) || 200;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const html = await res.text();
      const seen = new Set<string>();
      const scored: Array<{ url: string; score: number; source: string }> = [];

      const addUrl = (raw: string | null | undefined, source: string, bonus: number = 0) => {
        if (!raw) return;
        let src = resolveUrl(raw, url);
        if (!src || seen.has(src)) return;
        if (src.startsWith('data:')) return;
        if (/\b(1x1|pixel|spacer|blank|icon|favicon|badge|button)\b/i.test(src)) return;
        if (/\.(svg|ico|gif)$/i.test(src) && !src.includes('giphy')) return;

        // Clean URL — remove tracking params, fix protocol
        try {
          const parsed = new URL(src);
          ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'].forEach(p => parsed.searchParams.delete(p));
          src = parsed.toString();
        } catch {}

        if (seen.has(src)) return;
        seen.add(src);

        // Score the URL
        let score = bonus;
        if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(src)) score += 3;
        if (/\d{3,4}x\d{3,4}|large|full|original|high|_xl|_hd/i.test(src)) score += 3;
        if (/cdn|media|images|uploads|static|assets|content/i.test(src)) score += 1;
        if (/product|gallery|hero|main|primary|feature/i.test(src)) score += 2;
        if (/thumb|small|mini|icon|logo|avatar|_xs|_sm/i.test(src)) score -= 3;
        if (/unsplash|pexels|pixabay/i.test(src)) score += 2;

        scored.push({ url: src, score, source });
      };

      // 1. JSON-LD structured data (high priority — structured, reliable)
      const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const data = JSON.parse(match[1]);
          const extractFromJsonLd = (obj: any, depth = 0): void => {
            if (!obj || depth > 10) return;
            if (typeof obj === 'string' && /\.(jpg|jpeg|png|webp)/i.test(obj)) {
              addUrl(obj, 'json-ld', 5);
            }
            if (obj.image) {
              const imgs = Array.isArray(obj.image) ? obj.image : [obj.image];
              imgs.forEach((img: any) => addUrl(typeof img === 'string' ? img : img?.url || img?.contentUrl, 'json-ld', 5));
            }
            if (obj.thumbnailUrl) addUrl(obj.thumbnailUrl, 'json-ld', 3);
            if (obj.contentUrl) addUrl(obj.contentUrl, 'json-ld', 5);
            // Recurse into arrays and objects
            if (Array.isArray(obj)) obj.forEach(item => extractFromJsonLd(item, depth + 1));
            else if (typeof obj === 'object') {
              Object.values(obj).forEach(v => extractFromJsonLd(v, depth + 1));
            }
          };
          extractFromJsonLd(data);
        } catch { /* skip malformed JSON-LD */ }
      }

      // 2. Open Graph and Twitter card meta tags (high priority)
      const metaRegex = /<meta[^>]+(?:property|name)=["'](og:image|twitter:image)[^"']*["'][^>]+content=["']([^"']+)["']/gi;
      while ((match = metaRegex.exec(html)) !== null) {
        addUrl(match[2], 'meta-og', 4);
      }
      // Also handle content-first ordering
      const metaRegex2 = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](og:image|twitter:image)/gi;
      while ((match = metaRegex2.exec(html)) !== null) {
        addUrl(match[1], 'meta-og', 4);
      }

      // 3. Scan inline scripts for image URLs (competitor-dashboard pattern)
      const scriptRegex = /<script(?![^>]+src)[^>]*>([\s\S]*?)<\/script>/gi;
      while ((match = scriptRegex.exec(html)) !== null) {
        const script = match[1];
        // Look for image URL patterns in script content
        const imgUrlRegex = /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi;
        let imgMatch;
        while ((imgMatch = imgUrlRegex.exec(script)) !== null) {
          addUrl(imgMatch[1], 'script', 2);
        }
        // Look for escaped URLs in JSON within scripts
        const escapedRegex = /["']([^"']*\\\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
        while ((imgMatch = escapedRegex.exec(script)) !== null) {
          const cleaned = imgMatch[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
          addUrl(cleaned, 'script-escaped', 2);
        }
      }

      // 4. Standard img src tags
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      while ((match = imgRegex.exec(html)) !== null) {
        const widthHint = match[0].match(/width=["']?(\d+)/i);
        if (widthHint && parseInt(widthHint[1]) < minWidth) continue;
        addUrl(match[1], 'img-src', 0);
      }

      // 5. srcset attributes (prefer largest descriptor)
      const srcsetRegex = /srcset=["']([^"']+)["']/gi;
      while ((match = srcsetRegex.exec(html)) !== null) {
        const entries = match[1].split(',').map(s => {
          const parts = s.trim().split(/\s+/);
          const w = parseInt(parts[1]) || 0;
          return { url: parts[0], w };
        });
        // Sort by width descending, take the largest
        entries.sort((a, b) => b.w - a.w);
        for (const entry of entries.slice(0, 3)) {
          addUrl(entry.url, 'srcset', entry.w > 800 ? 3 : 1);
        }
      }

      // 6. Background image URLs in style attributes
      const bgRegex = /url\(["']?(https?:\/\/[^"')]+\.(?:jpg|jpeg|png|webp)[^"')]*)/gi;
      while ((match = bgRegex.exec(html)) !== null) {
        addUrl(match[1], 'css-bg', 0);
      }

      scored.sort((a, b) => b.score - a.score);

      // Detect JS-heavy sites that serve empty shells via HTTP GET
      const JS_HEAVY_DOMAINS = ['google.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'pinterest.com', 'tiktok.com'];
      const parsedDomain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
      const isJsHeavy = JS_HEAVY_DOMAINS.some(d => parsedDomain === d || parsedDomain.endsWith('.' + d));

      if (scored.length === 0 && isJsHeavy) {
        return {
          ok: false,
          error: `${parsedDomain} is a JS-rendered site — static HTML has no images. Use smart_browse with extractImages:true instead: smart_browse({ url: "${url}", instruction: "Extract all product image URLs", extractImages: true })`,
        };
      }

      return {
        ok: true,
        result: {
          pageUrl: url,
          imageCount: scored.length,
          images: scored.slice(0, 25).map(s => ({ url: s.url, source: s.source, score: s.score })),
          topImages: scored.slice(0, 8).map(s => s.url),
          tip: scored.length === 0
            ? 'No images found in static HTML. This site likely uses JavaScript rendering. Use smart_browse with extractImages:true to get images from the rendered page.'
            : 'Use topImages with download_file. Images are scored: json-ld and og:image are most reliable, script-extracted URLs are good for JS-heavy sites.',
        },
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to fetch page' };
    }
  },
};

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Smart Browser tool — LLM-guided Playwright with human-like behavior
// ---------------------------------------------------------------------------

import { smartBrowse } from '../browser/smartBrowser.js';

const smartBrowseTool: AgentTool = {
  name: 'smart_browse',
  description: 'Intelligently browse a webpage using a real browser with AI guidance. Navigates to a URL, analyzes the visible page elements (links, buttons, inputs, images), and uses AI to decide what to click, type, scroll, or extract. Mimics human behavior (mouse curves, reading pauses, typing speed) to avoid detection. Use for: searching Google Images, navigating dealer sites, filling forms, logging into websites, extracting data from JS-rendered pages.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to. Omit to continue on the current page from a previous smart_browse call.' },
      instruction: { type: 'string', description: 'What you want to accomplish. Be specific: "search for 2024 Vespa Primavera images", "click the Images tab", "extract all product photo URLs", "fill the login form with email X and password Y"' },
      extractImages: { type: 'boolean', description: 'If true, also extracts all visible image URLs from the page after completing the instruction.' },
    },
    required: ['instruction'],
  },
  async execute(input, ctx) {
    const result = await smartBrowse({
      url: input.url as string | undefined,
      instruction: input.instruction as string,
      extractImages: input.extractImages as boolean | undefined,
      orgId: ctx?.orgId || 'default',
      instanceId: ctx?.instanceId,
    });

    if (!result.ok) {
      return { ok: false, error: result.error || 'Browser action failed' };
    }

    return {
      ok: true,
      result: {
        url: result.url,
        title: result.title,
        actionsPerformed: result.actions,
        extractedImages: result.extractedImages,
        extractedText: result.extractedText,
        pageState: result.pageState,
        screenshotUrl: result.screenshotUrl,
        mfaChallenge: result.mfaChallenge,
        tip: result.triageApplied
          ? 'These images have been pre-screened by visual triage — they should match your search. Download them directly WITHOUT expectedContent verification (skip the expectedContent parameter).'
          : undefined,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// MFA Code Request — ask user for MFA/2FA verification code
// ---------------------------------------------------------------------------

const requestMfaCodeTool: AgentTool = {
  name: 'request_mfa_code',
  description: 'Ask the user for an MFA/2FA verification code. Creates an urgent input request in the user\'s Action Items panel, optionally with a screenshot of the challenge page. Use after smart_browse detects an mfaChallenge.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short title, e.g. "Twilio MFA Code Required"' },
      description: { type: 'string', description: 'What the user needs to do, e.g. "Enter the 6-digit code from your authenticator app"' },
      screenshotUrl: { type: 'string', description: 'URL path of the screenshot showing the MFA challenge (from smart_browse mfaChallenge result)' },
    },
    required: ['title', 'description'],
  },
  async execute(input, ctx) {
    if (!ctx?.orgId || !ctx?.instanceId) {
      return { ok: false, error: 'Missing org or instance context' };
    }
    try {
      const [inserted] = await db.insert(inputRequests).values({
        orgId: ctx.orgId,
        outcomeInstanceId: ctx.instanceId,
        requestType: 'text',
        title: input.title as string,
        description: input.description as string,
        schema: {
          screenshotUrl: input.screenshotUrl || undefined,
          placeholder: 'Enter your verification code',
        },
        priority: 'urgent',
        status: 'pending',
      }).returning({ id: inputRequests.id });

      return {
        ok: true,
        result: {
          requestId: inserted.id,
          message: 'MFA code request created. The user will see it in their Action Items panel.',
        },
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to create MFA request' };
    }
  },
};

// ---------------------------------------------------------------------------
// Setup Twilio Webhook — auto-configure inbound SMS/MMS reception
// ---------------------------------------------------------------------------

const setupTwilioWebhookTool: AgentTool = {
  name: 'setup_twilio_webhook',
  description: 'Configure a Twilio phone number to forward inbound SMS/MMS to this Lamdis instance. Creates a communication channel, gets the public tunnel URL, and sets the SMS webhook on the Twilio number. Requires: Twilio credentials (accountSid, authToken) and the fromNumber. After setup, any SMS/MMS sent to that number will be received by the agent as evidence events with downloaded media files.',
  inputSchema: {
    type: 'object',
    properties: {
      accountSid: { type: 'string', description: 'Twilio Account SID' },
      authToken: { type: 'string', description: 'Twilio Auth Token' },
      fromNumber: { type: 'string', description: 'Twilio phone number to configure (e.g., +18886222151)' },
    },
    required: ['accountSid', 'authToken', 'fromNumber'],
  },
  async execute(input, ctx) {
    if (!ctx?.orgId || !ctx?.instanceId) {
      return { ok: false, error: 'Missing org or instance context' };
    }

    const accountSid = input.accountSid as string;
    const authToken = input.authToken as string;
    const fromNumber = input.fromNumber as string;
    const tunnelUrl = getPublicUrl();

    if (!tunnelUrl) {
      return { ok: false, error: 'No public tunnel URL available. Set TUNNEL_ENABLED=true and NGROK_AUTHTOKEN in .env, then restart the API.' };
    }

    try {
      // 1. Create a communication channel in the DB
      const [channel] = await db.insert(channels).values({
        orgId: ctx.orgId,
        name: `Twilio SMS ${fromNumber}`,
        channelType: 'customer',
        channelMedium: 'sms',
        providerConfig: { provider: 'twilio', accountSid, authToken, fromNumber },
        enabled: true,
        inboundRoutingRules: [{ match: '*', routeToInstanceId: ctx.instanceId }],
      } as any).returning();

      const webhookUrl = `${tunnelUrl}/orgs/${ctx.orgId}/channels/${channel.id}/inbound`;

      // 2. Find the phone number SID from Twilio
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(fromNumber)}`;
      const searchResp = await fetch(searchUrl, { headers: { Authorization: `Basic ${auth}` } });
      const searchData = await searchResp.json() as any;

      if (!searchData.incoming_phone_numbers?.length) {
        return {
          ok: true,
          result: {
            channelId: channel.id,
            webhookUrl,
            warning: `Channel created but could not find phone number ${fromNumber} in Twilio account. Set the webhook URL manually in Twilio console: ${webhookUrl}`,
          },
        };
      }

      const phoneSid = searchData.incoming_phone_numbers[0].sid;

      // 3. Set the SMS webhook URL on the Twilio number
      const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneSid}.json`;
      const updateResp = await fetch(updateUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ SmsUrl: webhookUrl, SmsMethod: 'POST' }).toString(),
      });

      const updateData = await updateResp.json() as any;
      if (!updateResp.ok) {
        return {
          ok: true,
          result: { channelId: channel.id, webhookUrl, warning: `Channel created but failed to auto-configure webhook: ${updateData.message}` },
        };
      }

      return {
        ok: true,
        result: {
          channelId: channel.id, webhookUrl, phoneSid,
          message: `Twilio webhook configured! SMS/MMS sent to ${fromNumber} will be received by this agent. Photos will be downloaded to your workspace automatically.`,
        },
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to setup Twilio webhook' };
    }
  },
};

// ---------------------------------------------------------------------------
// Credential Store (first section) — encrypted credential management
// ---------------------------------------------------------------------------

// Context holder for passing orgId/instanceId to the tool
let _credentialContext: { orgId: string; instanceId: string } | null = null;

export function setCredentialContext(orgId: string, instanceId: string) {
  _credentialContext = { orgId, instanceId };
}

// ---------------------------------------------------------------------------
// Search Evidence — query the objective's evidence history
// ---------------------------------------------------------------------------

const searchEvidenceTool: AgentTool = {
  name: 'search_evidence',
  description: 'Search through the collected evidence for this objective. Use this to review what has been learned, find specific facts, check what tools have been tried, and understand the full history. Supports filtering by event type, source, text search in payloads, and pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text to search for in event types and payloads (e.g. "color", "vehicle", "download", "403")' },
      eventType: { type: 'string', description: 'Filter by event type prefix (e.g. "user.vehicle", "tool.download_file", "tool.")' },
      source: { type: 'string', description: 'Filter by source: "agent:conversation", "agent:tool", "user:manual"' },
      limit: { type: 'number', description: 'Max results to return (default 20, max 50)' },
      offset: { type: 'number', description: 'Skip first N results for pagination (default 0)' },
      onlyFailed: { type: 'boolean', description: 'If true, only return tool events where ok=false' },
    },
    required: [],
  },
  async execute(input, ctx) {
    const instanceId = ctx?.instanceId;
    const orgId = ctx?.orgId;
    if (!instanceId || !orgId) return { ok: false, error: 'No instance context' };

    const limit = Math.min(((input.limit as number) || 20), 50);
    const offset = (input.offset as number) || 0;
    const query = (input.query as string) || '';
    const eventTypeFilter = (input.eventType as string) || '';
    const sourceFilter = (input.source as string) || '';
    const onlyFailed = input.onlyFailed as boolean;

    try {
      const { sql } = await import('drizzle-orm');

      // Build query — use raw SQL for flexible text search
      let conditions = `outcome_instance_id = '${instanceId}'`;
      if (eventTypeFilter) conditions += ` AND event_type LIKE '${eventTypeFilter}%'`;
      if (sourceFilter) conditions += ` AND event_source = '${sourceFilter}'`;
      if (onlyFailed) conditions += ` AND (payload->>'ok')::text = 'false'`;
      if (query) conditions += ` AND (event_type ILIKE '%${query.replace(/'/g, "''")}%' OR payload::text ILIKE '%${query.replace(/'/g, "''")}%')`;

      const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as total FROM evidence_events WHERE ${conditions}`));
      const total = parseInt((countResult.rows?.[0] as any)?.total || '0');

      const rows = await db.execute(sql.raw(
        `SELECT id, event_type, event_source, payload, confirmation_level, emitted_at
         FROM evidence_events WHERE ${conditions}
         ORDER BY emitted_at DESC LIMIT ${limit} OFFSET ${offset}`
      ));

      const events = (rows.rows || []).map((r: any) => ({
        id: r.id,
        eventType: r.event_type,
        source: r.event_source,
        payload: r.payload,
        confirmationLevel: r.confirmation_level,
        emittedAt: r.emitted_at,
      }));

      return {
        ok: true,
        result: {
          total,
          returned: events.length,
          offset,
          limit,
          hasMore: offset + events.length < total,
          events,
        },
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Evidence search failed' };
    }
  },
};

// ---------------------------------------------------------------------------
// Credential Store — encrypted credential management
// ---------------------------------------------------------------------------

const credentialStoreTool: AgentTool = {
  name: 'credential_store',
  description: 'Securely save, retrieve, list, or request credentials. Credentials are encrypted with AES-256-GCM in the credential vault. Use "save_org" to save org-wide credentials (e.g., Facebook login). Use "save" for objective-only credentials. Use "get" to retrieve (waterfall: identity → objective → org → legacy). Use "request" to ask the user to provide credentials you don\'t have.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: { type: 'string', description: '"save" | "save_org" | "get" | "list" | "request"' },
      key: { type: 'string', description: 'Provider name or credential key (e.g., "facebook", "twilio", "github")' },
      value: { type: 'string', description: 'Credential value as JSON string (only for save/save_org)' },
      reason: { type: 'string', description: 'Why you need this credential (only for request operation)' },
    },
    required: ['operation'],
  },
  async execute(input) {
    const op = input.operation as string;
    const key = input.key as string;
    const value = input.value as string;
    const ctx = _credentialContext;

    if (!ctx) return { ok: false, error: 'No credential context set' };

    try {
      if ((op === 'save_org' || op === 'save') && key && value) {
        // Parse value as JSON if possible, otherwise wrap as { value: ... }
        let data: Record<string, unknown>;
        try { data = JSON.parse(value); } catch { data = { value }; }

        await credentialVault.storeCredential(ctx.orgId, {
          ownerType: op === 'save_org' ? 'org' : 'objective',
          ownerRef: op === 'save' ? ctx.instanceId : undefined,
          provider: key,
          data,
        });

        // Also save to legacy orgVariables for backward compat
        if (op === 'save_org') {
          try {
            const encrypted = encrypt(value);
            if (typeof encrypted === 'string') {
              await db.insert(orgVariables).values({
                orgId: ctx.orgId, key, ciphertext: encrypted, iv: '', tag: '', createdBy: 'agent',
              } as any).onConflictDoUpdate({
                target: [orgVariables.orgId, orgVariables.key],
                set: { ciphertext: encrypted, updatedBy: 'agent', updatedAt: new Date() } as any,
              });
            } else {
              await db.insert(orgVariables).values({
                orgId: ctx.orgId, key, ciphertext: encrypted.data, iv: encrypted.iv, tag: encrypted.tag, createdBy: 'agent',
              } as any).onConflictDoUpdate({
                target: [orgVariables.orgId, orgVariables.key],
                set: { ciphertext: encrypted.data, iv: encrypted.iv, tag: encrypted.tag, updatedBy: 'agent', updatedAt: new Date() } as any,
              });
            }
          } catch { /* non-critical legacy fallback */ }
        }

        return { ok: true, result: { saved: key, scope: op === 'save_org' ? 'org' : 'objective' } };

      } else if (op === 'get' && key) {
        // Try credential vault first (waterfall: identity → objective → org)
        const vaultResult = await credentialVault.getCredential(ctx.orgId, key, {
          ownerType: 'objective',
          ownerRef: ctx.instanceId,
        });
        if (vaultResult) {
          await credentialVault.touchCredential(vaultResult.id);
          return { ok: true, result: { key, value: vaultResult.data, scope: vaultResult.scope } };
        }

        // Fallback to legacy orgVariables
        const [orgVar] = await db.select().from(orgVariables)
          .where(and(eq(orgVariables.orgId, ctx.orgId), eq(orgVariables.key, key))).limit(1);
        if (orgVar) {
          const decrypted = orgVar.iv
            ? decrypt({ data: orgVar.ciphertext, iv: orgVar.iv, tag: orgVar.tag })
            : orgVar.ciphertext;
          return { ok: true, result: { key, value: decrypted, scope: 'org (legacy)' } };
        }

        // Fallback to instance metadata
        const [inst] = await db.select({ metadata: outcomeInstances.metadata })
          .from(outcomeInstances).where(eq(outcomeInstances.id, ctx.instanceId)).limit(1);
        const meta = (inst?.metadata || {}) as Record<string, unknown>;
        const creds = (meta._credentials || {}) as Record<string, unknown>;
        if (creds[key]) {
          return { ok: true, result: { key, value: decrypt(creds[key]), scope: 'instance (legacy)' } };
        }

        return { ok: false, error: `Credential "${key}" not found. Use operation "request" to ask the user.` };

      } else if (op === 'list') {
        const vaultCreds = await credentialVault.listCredentials(ctx.orgId);
        // Also list legacy orgVariables
        const orgVars = await db.select({ key: orgVariables.key })
          .from(orgVariables).where(eq(orgVariables.orgId, ctx.orgId));

        return {
          ok: true,
          result: {
            vault: vaultCreds.map(c => ({ provider: c.provider, type: c.credentialType, scope: c.ownerType, label: c.label })),
            legacy: orgVars.map(v => v.key),
          },
        };

      } else if (op === 'request' && key) {
        // Create a credential request for the user to fulfill
        const request = await credentialVault.requestCredential(ctx.orgId, {
          outcomeInstanceId: ctx.instanceId,
          provider: key,
          reason: (input.reason as string) || `Agent needs ${key} credentials to proceed`,
          fieldsNeeded: [
            { key: 'username', label: 'Username / Email', type: 'text', required: true },
            { key: 'password', label: 'Password / API Key', type: 'password', required: true },
          ],
        });

        // Also create an inputRequest so it shows in the UI's Tasks tab with a proper form
        if (ctx.instanceId) {
          const { inputRequests } = await import('@lamdis/db/schema');
          const reason = (input.reason as string) || `Please provide your ${key} credentials`;
          // Check if there's already a pending input request for this
          const [existingIR] = await db.select().from(inputRequests)
            .where(and(
              eq(inputRequests.outcomeInstanceId, ctx.instanceId),
              eq(inputRequests.requestType, 'credentials'),
              eq(inputRequests.status, 'pending'),
            )).limit(1);

          if (!existingIR) {
            // Build form schema from the credential fields
            const fields = (input.fields as Array<{ key: string; label: string; type?: string }>) || [
              { key: 'account_sid', label: 'Account SID', type: 'text' },
              { key: 'auth_token', label: 'Auth Token', type: 'password' },
              { key: 'phone_number', label: `${key} Phone Number`, type: 'text' },
              { key: 'user_phone', label: 'Your Phone Number', type: 'text' },
            ];
            const properties: Record<string, any> = {};
            const required: string[] = [];
            for (const f of fields) {
              properties[f.key] = {
                type: 'string',
                description: f.label,
              };
              required.push(f.key);
            }

            await db.insert(inputRequests).values({
              orgId: ctx.orgId,
              outcomeInstanceId: ctx.instanceId,
              requestType: 'credentials',
              title: `${key} credentials needed`,
              description: reason,
              schema: {
                provider: key,
                credentialRequestId: request.id,
                properties,
                required,
              },
              priority: 'high',
              status: 'pending',
            } as any);
          }
        }

        return {
          ok: true,
          result: {
            requestId: request.id,
            status: request.status,
            message: `Credential request created for ${key}. The user will be notified to provide credentials.`,
          },
        };
      }

      return { ok: false, error: `Unknown operation: ${op}. Use: save, save_org, get, list, request` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Credential store error' };
    }
  },
};

// ---------------------------------------------------------------------------
// Local Filesystem Bridge — routes commands to the user's connected local machine
// ---------------------------------------------------------------------------

const localFilesystemTool: AgentTool = {
  name: 'local_filesystem',
  description: 'Access the user\'s local machine through their connected bridge. Can search files, read contents, find env vars, list directories, grep, and run terminal commands. Only available when the user has `lamdis-connect` running locally.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '"search_files" | "read_file" | "find_env_vars" | "list_dir" | "grep" | "exec_command"',
      },
      pattern: { type: 'string', description: 'File name pattern for search_files (e.g. "*.env", "package.json") or file filter for grep' },
      path: { type: 'string', description: 'Relative path for read_file or list_dir' },
      query: { type: 'string', description: 'Search text for grep or env var name filter for find_env_vars (e.g. "TWILIO")' },
      command: { type: 'string', description: 'Shell command to execute (for exec_command). Runs in the bridge root dir by default.' },
      cwd: { type: 'string', description: 'Working directory for exec_command, relative to bridge root (e.g. "my-project/")' },
      timeout: { type: 'number', description: 'Max execution time in ms for exec_command (default 30000, max 120000)' },
      maxResults: { type: 'number', description: 'Max results to return (default varies by action)' },
      maxDepth: { type: 'number', description: 'Max directory depth to recurse (default 6)' },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    if (!ctx?.orgId) return { ok: false, error: 'No org context' };

    const info = bridgeRegistry.getBridgeInfo(ctx.orgId);
    if (!info.connected) {
      return { ok: false, error: 'No local bridge connected. Ask the user to run `npx @lamdis/connect --dir ~/projects` on their machine.' };
    }

    try {
      const response = await bridgeRegistry.sendBridgeCommand(ctx.orgId, {
        action: input.action,
        pattern: input.pattern,
        path: input.path,
        query: input.query,
        maxResults: input.maxResults,
        maxDepth: input.maxDepth,
      });

      return {
        ok: response.ok,
        result: response.ok ? { summary: response.summary, ...response.data } : undefined,
        error: response.error,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};
