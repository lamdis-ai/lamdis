import { db } from '../../db.js';
import { eq, and } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Read-Only Tool Registry
 *
 * A secure, read-only version of the tool registry that only allows
 * listing and viewing operations. No create, update, or delete operations
 * are permitted to protect against LLM-based attacks.
 *
 * Security Features:
 * 1. Only 'list' and 'get' operations permitted
 * 2. Sensitive fields (credentials, secrets) are automatically redacted
 * 3. Org-scoped data access enforced
 * 4. Rate limiting ready (execution count tracked)
 */

export interface ReadOnlyToolDefinition {
  name: string;
  description: string;
  category: 'list' | 'get' | 'search' | 'docs';
  model?: string;
  params: ReadOnlyToolParam[];
  returns: string;
  example: string;
}

export interface ReadOnlyToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  enum?: string[];
}

interface TableMetadata {
  table: PgTable<any>;
  name: string;
  plural: string;
  description: string;
  orgScoped: boolean;
  sensitiveFields: string[];
  uiHref?: string;
}

// Fields that are ALWAYS excluded from responses (security)
const SENSITIVE_FIELDS = new Set([
  // Credentials and secrets
  'password', 'secret', 'token', 'apiKey', 'api_key', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token', 'privateKey', 'private_key', 'secretKey', 'secret_key',
  'authToken', 'auth_token', 'bearerToken', 'bearer_token', 'clientSecret', 'client_secret',
  
  // Environment/auth config that may contain secrets
  'authConfig', 'auth_config', 'credentials', 'encryptedValue', 'encrypted_value',
  'value', // OrgVariable values are encrypted secrets
  
  // Headers that may contain auth
  'headers', // Often contains Authorization headers
]);

// Fields to exclude from list responses (internal/system)
const EXCLUDED_FROM_LIST = new Set([
  '_id', '__v', 'createdAt', 'updatedAt', 'orgId',
]);

// Model descriptions for read-only context
const MODEL_DESCRIPTIONS: Record<string, { description: string; plural: string; sensitiveFields?: string[] }> = {
  TestSuite: {
    description: 'Collection of related tests organized by purpose or compliance area',
    plural: 'test_suites',
  },
  Test: {
    description: 'Individual test case with steps that validate AI assistant behavior',
    plural: 'tests',
  },
  TestFolder: {
    description: 'Organizational folder for grouping tests hierarchically',
    plural: 'test_folders',
  },
  Environment: {
    description: 'Connection configuration for test targets (base URL, channel)',
    plural: 'environments',
    sensitiveFields: ['authConfig', 'headers'], // Auth config contains credentials
  },
  Setup: {
    description: 'Test environment configuration linking assistants and environments',
    plural: 'setups',
  },
  Action: {
    description: 'Reusable API request definition with inputs/outputs',
    plural: 'actions',
    sensitiveFields: ['headers'], // May contain auth headers
  },
  ActionBinding: {
    description: 'Maps actions to specific environments for execution',
    plural: 'action_bindings',
  },
  Persona: {
    description: 'User simulation profile for testing different user types',
    plural: 'personas',
  },
  OrgVariable: {
    description: 'Organization-scoped variable (values are encrypted and hidden)',
    plural: 'org_variables',
    sensitiveFields: ['value', 'encryptedValue'], // Values are encrypted secrets
  },
  TestRun: {
    description: 'Test run execution record with results',
    plural: 'test_runs',
  },
  Assistant: {
    description: 'AI assistant configuration within the organization',
    plural: 'assistants',
    sensitiveFields: ['apiKey', 'authConfig'],
  },
};

/**
 * Redact sensitive fields from an object
 */
function redactSensitiveFields(obj: any, additionalSensitive: string[] = []): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveFields(item, additionalSensitive));
  }
  
  const redacted: any = {};
  const allSensitive = new Set([...Array.from(SENSITIVE_FIELDS), ...additionalSensitive]);
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive fields
    if (allSensitive.has(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    
    // Check for nested objects
    if (value && typeof value === 'object') {
      redacted[key] = redactSensitiveFields(value, additionalSensitive);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Generate read-only tools for a table (list and get only)
 */
function generateReadOnlyTools(meta: TableMetadata): ReadOnlyToolDefinition[] {
  const tools: ReadOnlyToolDefinition[] = [];
  const tableNameLower = meta.name.toLowerCase();

  // List tool
  tools.push({
    name: `list_${meta.plural}`,
    description: `List all ${meta.plural.replace(/_/g, ' ')}. ${meta.description} (Read-only)`,
    category: 'list',
    model: meta.name,
    params: [
      { name: 'limit', type: 'number', required: false, description: 'Maximum number of results (default 50, max 100)' },
      { name: 'filter', type: 'object', required: false, description: 'Filter criteria (limited to safe fields)' },
    ],
    returns: `Array of ${meta.plural} with id, name, and key fields (sensitive data redacted)`,
    example: `{ "tool": "list_${meta.plural}", "params": {} }`,
  });

  // Get single item tool
  tools.push({
    name: `get_${tableNameLower}`,
    description: `Get details of a specific ${tableNameLower} by ID (Read-only, credentials redacted)`,
    category: 'get',
    model: meta.name,
    params: [
      { name: 'id', type: 'string', required: true, description: `The ${tableNameLower} ID` },
    ],
    returns: `${meta.name} object with all non-sensitive fields`,
    example: `{ "tool": "get_${tableNameLower}", "params": { "id": "..." } }`,
  });

  return tools;
}

/**
 * Read-Only Tool Registry
 */
class ReadOnlyToolRegistry {
  private tools: Map<string, ReadOnlyToolDefinition> = new Map();
  private tables: Map<string, TableMetadata> = new Map();
  private executionCount: number = 0;
  private docsUrl: string;

  constructor(docsUrl: string = 'https://docs.lamdis.ai') {
    this.docsUrl = docsUrl;

    // Register documentation tool
    this.registerDocsTools();
  }
  
  /**
   * Register documentation access tools
   */
  private registerDocsTools() {
    // Search docs tool
    this.tools.set('search_docs', {
      name: 'search_docs',
      description: 'Search Lamdis documentation for information about concepts, features, and best practices',
      category: 'docs',
      params: [
        { name: 'query', type: 'string', required: true, description: 'Search query for documentation' },
        { name: 'section', type: 'string', required: false, description: 'Specific doc section (testing, workflows, compliance, integrations)' },
      ],
      returns: 'Relevant documentation snippets',
      example: '{ "tool": "search_docs", "params": { "query": "how to write test steps" } }',
    });
    
    // Get doc page tool
    this.tools.set('get_doc_page', {
      name: 'get_doc_page',
      description: 'Get content from a specific Lamdis documentation page',
      category: 'docs',
      params: [
        { name: 'path', type: 'string', required: true, description: 'Documentation page path (e.g., "getting-started", "testing/index", "concepts/test-steps")' },
      ],
      returns: 'Documentation page content',
      example: '{ "tool": "get_doc_page", "params": { "path": "getting-started" } }',
    });
  }
  
  /**
   * Register a Drizzle table for read-only tool generation
   */
  registerTable(table: PgTable<any>, tableName: string, options?: { description?: string; plural?: string; sensitiveFields?: string[]; orgScoped?: boolean }) {
    const defaultMeta = MODEL_DESCRIPTIONS[tableName] || {
      description: `${tableName} resource`,
      plural: tableName.toLowerCase() + 's',
    };

    const metadata: TableMetadata = {
      table,
      name: tableName,
      plural: options?.plural || defaultMeta.plural,
      description: options?.description || defaultMeta.description,
      orgScoped: options?.orgScoped !== undefined ? options.orgScoped : true,
      sensitiveFields: options?.sensitiveFields || defaultMeta.sensitiveFields || [],
      uiHref: undefined,
    };

    this.tables.set(tableName, metadata);

    // Generate and register read-only tools
    const tableTools = generateReadOnlyTools(metadata);
    for (const tool of tableTools) {
      this.tools.set(tool.name, tool);
    }

    return this;
  }
  
  /**
   * Get all registered tools
   */
  getAllTools(): ReadOnlyToolDefinition[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Get a specific tool by name
   */
  getTool(name: string): ReadOnlyToolDefinition | undefined {
    return this.tools.get(name);
  }
  
  /**
   * Get tools by category
   */
  getToolsByCategory(category: ReadOnlyToolDefinition['category']): ReadOnlyToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }
  
  /**
   * Generate tool documentation for the AI prompt
   */
  generateToolDocumentation(): string {
    const lines: string[] = ['## Available Tools (Read-Only)\n'];
    lines.push('**IMPORTANT**: All tools are READ-ONLY. You cannot create, update, or delete any resources.\n');
    lines.push('Sensitive data (credentials, secrets, API keys) is automatically redacted from responses.\n');
    
    // List tools
    const listTools = this.getToolsByCategory('list');
    if (listTools.length > 0) {
      lines.push('### List Tools\n');
      for (const tool of listTools) {
        lines.push(`#### ${tool.name}`);
        lines.push(tool.description);
        if (tool.params.length > 0) {
          lines.push('Parameters:');
          for (const p of tool.params) {
            const reqLabel = p.required ? '(required)' : '(optional)';
            lines.push(`  - ${p.name} ${reqLabel}: ${p.description}`);
          }
        }
        lines.push(`Example: ${tool.example}\n`);
      }
    }
    
    // Get tools
    const getTools = this.getToolsByCategory('get');
    if (getTools.length > 0) {
      lines.push('### Get Tools\n');
      for (const tool of getTools) {
        lines.push(`#### ${tool.name}`);
        lines.push(tool.description);
        if (tool.params.length > 0) {
          lines.push('Parameters:');
          for (const p of tool.params) {
            const reqLabel = p.required ? '(required)' : '(optional)';
            lines.push(`  - ${p.name} ${reqLabel}: ${p.description}`);
          }
        }
        lines.push(`Example: ${tool.example}\n`);
      }
    }
    
    // Docs tools
    const docsTools = this.getToolsByCategory('docs');
    if (docsTools.length > 0) {
      lines.push('### Documentation Tools\n');
      for (const tool of docsTools) {
        lines.push(`#### ${tool.name}`);
        lines.push(tool.description);
        if (tool.params.length > 0) {
          lines.push('Parameters:');
          for (const p of tool.params) {
            const reqLabel = p.required ? '(required)' : '(optional)';
            lines.push(`  - ${p.name} ${reqLabel}: ${p.description}`);
          }
        }
        lines.push(`Example: ${tool.example}\n`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Execute a tool call (read-only operations only)
   */
  async executeTool(
    orgId: string,
    toolName: string,
    params: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    this.executionCount++;
    
    // Rate limiting check (can be enhanced with Redis)
    if (this.executionCount > 100) {
      console.warn(`[ReadOnlyToolRegistry] High execution count: ${this.executionCount}`);
    }
    
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }
    
    // SECURITY: Only allow list, get, and docs operations
    if (!['list', 'get', 'docs'].includes(tool.category)) {
      return { 
        success: false, 
        error: `Operation not permitted: ${tool.category}. Only read operations are allowed.` 
      };
    }
    
    // Handle documentation tools
    if (tool.category === 'docs') {
      return this.executeDocsToolCall(toolName, params);
    }
    
    // Handle table-based tools
    if (!tool.model) {
      return { success: false, error: 'Tool has no table association' };
    }

    const metadata = this.tables.get(tool.model);
    if (!metadata) {
      return { success: false, error: `Table not registered: ${tool.model}` };
    }

    const table = metadata.table;

    try {
      switch (tool.category) {
        case 'list': {
          // Enforce max limit
          const limit = Math.min(params.limit || 50, 100);

          // SECURITY: Sanitize filter to prevent injection (simplified for Drizzle)
          // Note: Advanced filtering would require more sophisticated query building

          let query: any = db.select().from(table);

          if (metadata.orgScoped) {
            query = query.where(eq((table as any).orgId, orgId));
          }

          query = query.limit(limit);

          const docs = await query;

          // Redact sensitive fields from results
          const redactedDocs = docs.map((doc: any) => {
            const redacted = redactSensitiveFields(doc, metadata.sensitiveFields);
            return {
              id: String(doc.id),
              name: doc.name || doc.key || doc.title,
              ...this.pickSafeListFields(redacted),
            };
          });

          return {
            success: true,
            result: {
              count: redactedDocs.length,
              [metadata.plural]: redactedDocs,
            },
          };
        }

        case 'get': {
          // SECURITY: Validate ID format
          if (!params.id || typeof params.id !== 'string' || params.id.length > 50) {
            return { success: false, error: 'Invalid ID format' };
          }

          const conditions: any[] = [eq((table as any).id, params.id)];

          if (metadata.orgScoped) {
            conditions.push(eq((table as any).orgId, orgId));
          }

          const docs = await db
            .select()
            .from(table)
            .where(and(...conditions));

          if (docs.length === 0) {
            return { success: false, error: `${tool.model} not found` };
          }

          // Redact sensitive fields
          const redacted = redactSensitiveFields(docs[0], metadata.sensitiveFields);
          delete redacted.orgId; // Remove orgId from response

          return { success: true, result: redacted };
        }

        default:
          return { success: false, error: `Unsupported operation: ${tool.category}` };
      }
    } catch (err: any) {
      console.error(`[ReadOnlyToolRegistry] Tool execution error:`, err);
      return { success: false, error: 'Tool execution failed' };
    }
  }
  
  /**
   * Execute documentation tool calls
   */
  private async executeDocsToolCall(
    toolName: string,
    params: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      if (toolName === 'search_docs') {
        // Search documentation (would integrate with lamdis-docs API)
        const query = String(params.query || '').slice(0, 200);
        const section = params.section ? String(params.section).slice(0, 50) : undefined;
        
        // For now, return a helpful message. In production, this would call the docs API
        return {
          success: true,
          result: {
            query,
            section,
            message: 'Documentation search is available. Use get_doc_page for specific pages.',
            availableSections: [
              'getting-started',
              'testing/index',
              'workflows/index',
              'compliance/index',
              'integrations/index',
              'concepts/test-steps',
              'concepts/variables',
              'concepts/requests-auth',
              'troubleshooting',
              'faq',
            ],
          },
        };
      }
      
      if (toolName === 'get_doc_page') {
        const path = String(params.path || '').slice(0, 100);
        
        // SECURITY: Validate path format
        if (!/^[a-z0-9\-\/]+$/i.test(path)) {
          return { success: false, error: 'Invalid documentation path format' };
        }
        
        try {
          // Fetch documentation from lamdis-docs service
          const docsBaseUrl = process.env.LAMDIS_DOCS_URL || 'http://localhost:3002';
          const response = await fetch(`${docsBaseUrl}/api/content/${path}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000), // 5s timeout
          });
          
          if (response.ok) {
            const content = await response.json();
            return { success: true, result: content };
          }
          
          // Fallback if docs service unavailable
          return {
            success: true,
            result: {
              path,
              message: `Documentation page '${path}' requested. The docs service may be unavailable.`,
              docsUrl: `${this.docsUrl}/${path}`,
            },
          };
        } catch {
          // Docs service unavailable, return URL reference
          return {
            success: true,
            result: {
              path,
              message: `For documentation on '${path}', visit: ${this.docsUrl}/${path}`,
              docsUrl: `${this.docsUrl}/${path}`,
            },
          };
        }
      }
      
      return { success: false, error: 'Unknown docs tool' };
    } catch (err: any) {
      console.error(`[ReadOnlyToolRegistry] Docs tool error:`, err);
      return { success: false, error: 'Documentation tool failed' };
    }
  }
  
  /**
   * Sanitize filter object to prevent injection attacks
   */
  private sanitizeFilter(filter: any): any {
    if (!filter || typeof filter !== 'object') return {};
    
    const safeFilter: any = {};
    const allowedOperators = ['$eq', '$ne', '$in', '$nin'];
    const blockedFields = ['orgId', 'password', 'secret', 'token', 'apiKey', '$where', '$function'];
    
    for (const [key, value] of Object.entries(filter)) {
      // Block dangerous fields and operators
      if (blockedFields.some(blocked => key.includes(blocked))) continue;
      if (key.startsWith('$') && !allowedOperators.includes(key)) continue;
      
      // Only allow simple string/number/boolean values or safe operators
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safeFilter[key] = value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Check for safe operators
        const sanitizedValue: any = {};
        for (const [op, opVal] of Object.entries(value as any)) {
          if (allowedOperators.includes(op)) {
            sanitizedValue[op] = opVal;
          }
        }
        if (Object.keys(sanitizedValue).length > 0) {
          safeFilter[key] = sanitizedValue;
        }
      }
    }
    
    return safeFilter;
  }
  
  /**
   * Pick safe fields for list responses
   */
  private pickSafeListFields(doc: any): Record<string, any> {
    const summary: Record<string, any> = {};
    
    // Safe summary fields
    const safeFields = [
      'description', 'status', 'tags', 'labels', 'disabled', 'enabled',
      'category', 'type', 'channel', 'method', 'path', 'baseUrl',
      'passRate', 'totalTests', 'passedTests', 'failedTests',
    ];
    
    for (const field of safeFields) {
      if (doc[field] !== undefined && !SENSITIVE_FIELDS.has(field)) {
        summary[field] = doc[field];
      }
    }
    
    // Count arrays (like steps)
    if (Array.isArray(doc.steps)) {
      summary.stepCount = doc.steps.length;
    }
    if (Array.isArray(doc.tests)) {
      summary.testCount = doc.tests.length;
    }
    if (Array.isArray(doc.assertions)) {
      summary.assertionCount = doc.assertions.length;
    }
    
    return summary;
  }
  
  /**
   * Get execution statistics
   */
  getStats() {
    return {
      toolCount: this.tools.size,
      tableCount: this.tables.size,
      executionCount: this.executionCount,
    };
  }
}

// Global read-only tool registry instance
export const readOnlyToolRegistry = new ReadOnlyToolRegistry();

/**
 * Initialize the read-only tool registry with all tables
 */
export async function initializeReadOnlyToolRegistry() {
  // Import Drizzle schema tables
  const {
    environments,
    actions,
    actionBindings,
    personas,
    orgVariables,
    assistants,
    workflows,
    workflowSuites,
    policyChecks,
    runs,
  } = await import('@lamdis/db/schema');

  // Register tables (read-only access only)
  readOnlyToolRegistry
    .registerTable(environments, 'Environment', { sensitiveFields: ['authConfig', 'headers'] })
    .registerTable(actions, 'Action', { sensitiveFields: ['headers'] })
    .registerTable(actionBindings, 'ActionBinding')
    .registerTable(personas, 'Persona')
    .registerTable(orgVariables, 'OrgVariable', { sensitiveFields: ['ciphertext', 'iv', 'tag'] })
    .registerTable(assistants, 'Assistant')
    .registerTable(workflows, 'OutcomeType')
    .registerTable(workflowSuites, 'OutcomeGroup')
    .registerTable(policyChecks, 'ProofExpectation')
    .registerTable(runs, 'Run');

  const stats = readOnlyToolRegistry.getStats();
  console.log(`[ReadOnlyToolRegistry] Initialized with ${stats.toolCount} tools from ${stats.tableCount} tables (READ-ONLY mode)`);

  return readOnlyToolRegistry;
}