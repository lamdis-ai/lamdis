import { db } from '../../db.js';
import { eq, and } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Tool Registry - Auto-discovers and generates tools from Drizzle tables
 *
 * This system eliminates the need to manually define tools for each table.
 * Tools are automatically generated based on:
 * 1. Table schemas (field names, types, required fields)
 * 2. Table metadata (descriptions, UI hints)
 * 3. Standard CRUD operations
 */

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'list' | 'get' | 'create' | 'update' | 'delete' | 'action';
  model?: string;
  params: ToolParam[];
  returns: string;
  example: string;
}

export interface ToolParam {
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
  uiHref?: string;
}

type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array';

// Manual descriptions for core models (can be extended via decorators later)
const MODEL_DESCRIPTIONS: Record<string, { description: string; plural: string; uiHref?: string }> = {
  TestSuite: {
    description: 'Collection of related tests organized by purpose or compliance area',
    plural: 'test_suites',
    uiHref: '/dashboard/suites/{id}',
  },
  Test: {
    description: 'Individual test case with steps that validate AI assistant behavior',
    plural: 'tests',
    uiHref: '/dashboard/tests?testId={id}',
  },
  TestFolder: {
    description: 'Organizational folder for grouping tests hierarchically',
    plural: 'test_folders',
    uiHref: '/dashboard/tests',
  },
  Environment: {
    description: 'Connection configuration for test targets (base URL, auth, headers)',
    plural: 'environments',
    uiHref: '/dashboard/environments',
  },
  Setup: {
    description: 'Test environment configuration linking assistants and environments',
    plural: 'setups',
    uiHref: '/dashboard/setups',
  },
  Action: {
    description: 'Reusable API request definition with inputs/outputs',
    plural: 'actions',
    uiHref: '/dashboard/actions',
  },
  ActionBinding: {
    description: 'Maps actions to specific environments for execution',
    plural: 'action_bindings',
    uiHref: '/dashboard/action-bindings',
  },
  Persona: {
    description: 'User simulation profile for testing different user types',
    plural: 'personas',
    uiHref: '/dashboard/personas',
  },
  OrgVariable: {
    description: 'Encrypted organization-scoped variable (secrets, config)',
    plural: 'org_variables',
    uiHref: '/dashboard/variables',
  },
  Assistant: {
    description: 'AI assistant configuration within the organization',
    plural: 'assistants',
    uiHref: '/dashboard/assistants',
  },
};

// Fields to exclude from tool params (internal/system fields)
const EXCLUDED_FIELDS = new Set([
  '_id', '__v', 'createdAt', 'updatedAt', 'orgId', 
]);

// Fields that should be read-only in create/update operations
const READONLY_FIELDS = new Set([
  '_id', 'createdAt', 'updatedAt',
]);

// Note: With Drizzle, we don't dynamically extract field metadata.
// Instead, we rely on the static MODEL_DESCRIPTIONS and generate basic tools.

/**
 * Generate tools for a single table
 */
function generateTableTools(meta: TableMetadata): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  const tableNameSnake = meta.plural;

  // List tool
  tools.push({
    name: `list_${tableNameSnake}`,
    description: `List all ${meta.plural.replace(/_/g, ' ')}. ${meta.description}`,
    category: 'list',
    model: meta.name,
    params: [
      { name: 'limit', type: 'number', required: false, description: 'Maximum number of results (default 50)' },
      { name: 'filter', type: 'object', required: false, description: 'Filter criteria' },
    ],
    returns: `Array of ${tableNameSnake} with id, name, and key fields`,
    example: `{ "tool": "list_${tableNameSnake}", "params": {} }`,
  });

  // Get single item tool
  tools.push({
    name: `get_${meta.name.toLowerCase()}`,
    description: `Get details of a specific ${meta.name.toLowerCase()} by ID`,
    category: 'get',
    model: meta.name,
    params: [
      { name: 'id', type: 'string', required: true, description: `The ${meta.name.toLowerCase()} ID` },
    ],
    returns: `Full ${meta.name.toLowerCase()} object with all fields`,
    example: `{ "tool": "get_${meta.name.toLowerCase()}", "params": { "id": "..." } }`,
  });

  // Create tool - with basic params (name, description)
  const createParams: ToolParam[] = [
    { name: 'name', type: 'string', required: true, description: 'Name of the resource' },
    { name: 'description', type: 'string', required: false, description: 'Description of the resource' },
  ];

  tools.push({
    name: `create_${meta.name.toLowerCase()}`,
    description: `Create a new ${meta.name.toLowerCase()}. ${meta.description}`,
    category: 'create',
    model: meta.name,
    params: createParams,
    returns: `The created ${meta.name.toLowerCase()} with its ID`,
    example: `{ "tool": "create_${meta.name.toLowerCase()}", "params": { "name": "Example" } }`,
  });

  // Update tool
  tools.push({
    name: `update_${meta.name.toLowerCase()}`,
    description: `Update an existing ${meta.name.toLowerCase()}`,
    category: 'update',
    model: meta.name,
    params: [
      { name: 'id', type: 'string', required: true, description: `The ${meta.name.toLowerCase()} ID to update` },
      ...createParams.map(p => ({ ...p, required: false })),
    ],
    returns: `The updated ${meta.name.toLowerCase()}`,
    example: `{ "tool": "update_${meta.name.toLowerCase()}", "params": { "id": "...", "name": "Updated" } }`,
  });

  // Delete tool
  tools.push({
    name: `delete_${meta.name.toLowerCase()}`,
    description: `Delete a ${meta.name.toLowerCase()} by ID`,
    category: 'delete',
    model: meta.name,
    params: [
      { name: 'id', type: 'string', required: true, description: `The ${meta.name.toLowerCase()} ID to delete` },
    ],
    returns: 'Success confirmation',
    example: `{ "tool": "delete_${meta.name.toLowerCase()}", "params": { "id": "..." } }`,
  });

  return tools;
}

/**
 * The Tool Registry - manages all auto-discovered tools
 */
class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private tables: Map<string, TableMetadata> = new Map();
  private customActions: Map<string, (orgId: string, params: any) => Promise<any>> = new Map();

  /**
   * Register a Drizzle table for tool generation
   */
  registerTable(table: PgTable<any>, tableName: string, options?: { description?: string; plural?: string; uiHref?: string; orgScoped?: boolean }) {
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
      uiHref: options?.uiHref || defaultMeta.uiHref,
    };

    this.tables.set(tableName, metadata);

    // Generate and register tools for this table
    const tableTools = generateTableTools(metadata);
    for (const tool of tableTools) {
      this.tools.set(tool.name, tool);
    }

    return this;
  }
  
  /**
   * Register a custom action tool (for non-CRUD operations)
   */
  registerAction(
    name: string,
    definition: Omit<ToolDefinition, 'name'>,
    executor: (orgId: string, params: any) => Promise<any>
  ) {
    this.tools.set(name, { ...definition, name });
    this.customActions.set(name, executor);
    return this;
  }
  
  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Get a specific tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
  
  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }
  
  /**
   * Generate tool documentation for the AI prompt
   */
  generateToolDocumentation(): string {
    const categories = ['list', 'get', 'create', 'update', 'delete', 'action'] as const;
    const lines: string[] = ['## Available Tools\n'];
    
    for (const category of categories) {
      const catTools = this.getToolsByCategory(category);
      if (catTools.length === 0) continue;
      
      const catTitle = category.charAt(0).toUpperCase() + category.slice(1);
      lines.push(`### ${catTitle} Tools\n`);
      
      for (const tool of catTools) {
        lines.push(`#### ${tool.name}`);
        lines.push(tool.description);
        
        if (tool.params.length > 0) {
          lines.push('Parameters:');
          for (const p of tool.params) {
            const reqLabel = p.required ? '(required)' : '(optional)';
            const enumLabel = p.enum ? ` [${p.enum.join('|')}]` : '';
            lines.push(`  - ${p.name} ${reqLabel}: ${p.description}${enumLabel}`);
          }
        }
        
        lines.push(`Example: ${tool.example}`);
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Execute a tool call
   */
  async executeTool(
    orgId: string,
    toolName: string,
    params: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    // Check for custom action
    if (this.customActions.has(toolName)) {
      try {
        const result = await this.customActions.get(toolName)!(orgId, params);
        return { success: true, result };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Action failed' };
      }
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
          const limit = params.limit || 50;

          let query: any = db.select().from(table);

          if (metadata.orgScoped) {
            query = query.where(eq((table as any).orgId, orgId));
          }

          query = query.limit(limit);

          const docs = await query;

          return {
            success: true,
            result: {
              count: docs.length,
              [metadata.plural]: docs.map((d: any) => ({
                id: String(d.id),
                name: d.name || d.key || d.title,
                ...this.pickSummaryFields(d, metadata),
              })),
            },
          };
        }

        case 'get': {
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

          // Remove orgId from response
          const result = { ...docs[0] };
          delete result.orgId;

          return { success: true, result };
        }

        case 'create': {
          const data: any = { ...params };
          if (metadata.orgScoped) data.orgId = orgId;

          const [doc] = await db.insert(table).values(data).returning();

          return {
            success: true,
            result: {
              id: String(doc.id),
              name: (doc as any).name || (doc as any).key,
              message: `Created ${tool.model.toLowerCase()} "${(doc as any).name || (doc as any).key}"`,
              href: metadata.uiHref?.replace('{id}', String(doc.id)),
            },
          };
        }

        case 'update': {
          const { id, ...updateData } = params;
          const conditions: any[] = [eq((table as any).id, id)];

          if (metadata.orgScoped) {
            conditions.push(eq((table as any).orgId, orgId));
          }

          const docs = await db
            .update(table)
            .set(updateData)
            .where(and(...conditions))
            .returning();

          if (docs.length === 0) {
            return { success: false, error: `${tool.model} not found` };
          }

          const doc = docs[0];

          return {
            success: true,
            result: {
              id: String((doc as any).id),
              name: (doc as any).name || (doc as any).key,
              message: `Updated ${tool.model.toLowerCase()}`,
              href: metadata.uiHref?.replace('{id}', String((doc as any).id)),
            },
          };
        }

        case 'delete': {
          const conditions: any[] = [eq((table as any).id, params.id)];

          if (metadata.orgScoped) {
            conditions.push(eq((table as any).orgId, orgId));
          }

          const result = await db
            .delete(table)
            .where(and(...conditions))
            .returning();

          if (result.length === 0) {
            return { success: false, error: `${tool.model} not found` };
          }

          return {
            success: true,
            result: { message: `Deleted ${tool.model.toLowerCase()}` },
          };
        }

        default:
          return { success: false, error: `Unsupported tool category: ${tool.category}` };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Tool execution failed' };
    }
  }
  
  /**
   * Pick summary fields for list responses
   */
  private pickSummaryFields(doc: any, meta: TableMetadata): Record<string, any> {
    const summary: Record<string, any> = {};

    // Common summary fields
    const summaryFields = ['description', 'status', 'tags', 'labels', 'disabled', 'enabled'];
    for (const field of summaryFields) {
      if (doc[field] !== undefined) {
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

    return summary;
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();

/**
 * Initialize the tool registry with all tables
 * Call this during app startup
 */
export async function initializeToolRegistry() {
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

  // Register tables
  toolRegistry
    .registerTable(environments, 'Environment')
    .registerTable(actions, 'Action')
    .registerTable(actionBindings, 'ActionBinding')
    .registerTable(personas, 'Persona')
    .registerTable(orgVariables, 'OrgVariable')
    .registerTable(assistants, 'Assistant')
    .registerTable(workflows, 'OutcomeType')
    .registerTable(workflowSuites, 'OutcomeGroup')
    .registerTable(policyChecks, 'ProofExpectation')
    .registerTable(runs, 'Run');

  // Register custom action tools (non-CRUD operations)
  toolRegistry.registerAction(
    'run_test',
    {
      description: 'Queue a test for execution against an environment',
      category: 'action',
      params: [
        { name: 'testId', type: 'string', required: true, description: 'Test ID to run' },
        { name: 'environmentId', type: 'string', required: false, description: 'Environment to run against' },
      ],
      returns: 'Run queued confirmation with runId',
      example: '{ "tool": "run_test", "params": { "testId": "..." } }',
    },
    async (orgId, params) => {
      // Queue test run - would integrate with lamdis-runs
      return {
        status: 'queued',
        message: `Test queued for execution`,
        testId: params.testId,
        note: 'Full execution requires lamdis-runs service',
      };
    }
  );

  toolRegistry.registerAction(
    'run_suite',
    {
      description: 'Queue all tests in a suite for execution',
      category: 'action',
      params: [
        { name: 'suiteId', type: 'string', required: true, description: 'Suite ID to run' },
        { name: 'environmentId', type: 'string', required: false, description: 'Environment to run against' },
      ],
      returns: 'Run queued confirmation with runId',
      example: '{ "tool": "run_suite", "params": { "suiteId": "..." } }',
    },
    async (orgId, params) => {
      return {
        status: 'queued',
        message: `Suite queued for execution`,
        suiteId: params.suiteId,
        note: 'Full execution requires lamdis-runs service',
      };
    }
  );

  console.log(`[ToolRegistry] Initialized with ${toolRegistry.getAllTools().length} tools from ${10} tables`);
  return toolRegistry;
}
