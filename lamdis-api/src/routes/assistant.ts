import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import {
  personas, actions, environments, workflows, workflowSuites, policyChecks,
} from '@lamdis/db/schema';
import { getAssistant } from '../lib/assistant/registry.js';
import { createAuditLog, AuditContext } from '../services/auditService.js';

/**
 * Assistant Routes
 *
 * Provides a unified endpoint for AI assistant interactions.
 * Supports multiple assistant modes through the registry.
 */
export default async function assistantRoutes(app: FastifyInstance) {
  /**
   * POST /orgs/:orgId/assistant/chat
   *
   * Chat with an AI assistant. The assistant mode determines
   * which module handles the request (builder, lamdis, etc.)
   */
  app.post('/:orgId/assistant/chat', async (req, reply) => {
    const { orgId } = z.object({ orgId: z.string() }).parse(req.params as any);

    const body = z.object({
      message: z.string().min(1),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })).optional().default([]),
      mode: z.string().optional().default('lamdis'),
      planner: z.any().optional(),
      tools: z.array(z.any()).optional(),
    }).parse(req.body as any);

    const { message, history, mode, planner, tools } = body;

    // Get the appropriate assistant module
    const assistant = getAssistant(mode);
    if (!assistant) {
      return reply.code(400).send({ error: `Unknown assistant mode: ${mode}` });
    }

    // Build audit context
    const auditContext: AuditContext = {
      orgId,
      userSub: (req as any).user?.sub,
      userEmail: (req as any).user?.email,
      source: 'api',
      requestId: (req as any).id,
    };

    // Log the assistant chat request
    await createAuditLog(auditContext, 'assistant.chat', {
      category: 'assistant',
      severity: 'info',
      details: {
        mode,
        messageLength: message.length,
        historyLength: history.length,
      },
    });

    try {
      // Run the assistant
      const result = await assistant.run({
        orgId,
        message,
        history,
        mode,
        planner,
        tools,
      });

      // If there's an error, log it
      if (result.error) {
        await createAuditLog(auditContext, 'assistant.error', {
          category: 'assistant',
          severity: 'warning',
          details: {
            mode,
            error: result.error,
          },
        });
        return reply.code(400).send({ error: result.error });
      }

      // Log successful response
      const hasOperations = result.structured?.operations?.length > 0;
      await createAuditLog(auditContext, 'assistant.response', {
        category: 'assistant',
        severity: 'info',
        details: {
          mode,
          hasStructured: !!result.structured,
          operationCount: result.structured?.operations?.length || 0,
          hasQuestions: result.structured?.questions?.length > 0,
        },
      });

      // Return the result
      return reply.send({
        success: true,
        mode,
        response: result.structured?.response || result.reply || '',
        structured: result.structured,
        reply: result.reply,
      });
    } catch (error: any) {
      req.log.error({ error: error?.message, mode, orgId }, 'assistant_chat_error');

      await createAuditLog(auditContext, 'assistant.error', {
        category: 'assistant',
        severity: 'critical',
        details: {
          mode,
          error: error?.message,
        },
      });

      return reply.code(500).send({
        error: error?.message || 'Assistant error',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      });
    }
  });

  /**
   * POST /orgs/:orgId/assistant/apply
   *
   * Apply operations proposed by the assistant.
   * This endpoint executes the structured operations (create/update/delete)
   * that the assistant generated.
   */
  app.post('/:orgId/assistant/apply', async (req, reply) => {
    const { orgId } = z.object({ orgId: z.string() }).parse(req.params as any);

    const body = z.object({
      operations: z.array(z.object({
        op_id: z.string(),
        resource: z.string(),
        action: z.enum(['create', 'update', 'delete']),
        data: z.any(),
        depends_on: z.array(z.string()).optional(),
      })),
    }).parse(req.body as any);

    const { operations } = body;

    // Build audit context
    const auditContext: AuditContext = {
      orgId,
      userSub: (req as any).user?.sub,
      userEmail: (req as any).user?.email,
      source: 'api',
      requestId: (req as any).id,
    };

    // Log the apply request
    await createAuditLog(auditContext, 'assistant.apply_start', {
      category: 'assistant',
      severity: 'info',
      details: {
        operationCount: operations.length,
        resources: [...new Set(operations.map(op => op.resource))],
      },
    });

    const results: Array<{
      op_id: string;
      success: boolean;
      resource?: string;
      resourceId?: string;
      error?: string;
    }> = [];

    const resolvedIds: Record<string, string> = {};

    // Process operations in order, respecting dependencies
    for (const op of operations) {
      try {
        // Check dependencies
        if (op.depends_on?.length) {
          const missingDep = op.depends_on.find(depId => !resolvedIds[depId]);
          if (missingDep) {
            results.push({
              op_id: op.op_id,
              success: false,
              error: `Dependency not resolved: ${missingDep}`,
            });
            continue;
          }
        }

        // Resolve dependency references in data
        let data = op.data;
        if (typeof data === 'object' && data) {
          data = JSON.parse(JSON.stringify(data));
          for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && value.startsWith('$op:')) {
              const refOpId = value.slice(4);
              if (resolvedIds[refOpId]) {
                (data as any)[key] = resolvedIds[refOpId];
              }
            }
          }
        }

        // Execute the operation based on resource type
        let resourceId: string | undefined;

        // Helper to strip _id from data (leftover from Mongo payloads) and extract id
        const dataId: string | undefined = data?._id || data?.id;
        const { _id, ...cleanData } = data || {};

        switch (op.resource) {
          case 'workflow_suite': {
            if (op.action === 'create') {
              const [row] = await db.insert(workflowSuites).values({ orgId, ...cleanData }).returning();
              resourceId = row.id;
            } else if (op.action === 'update' && dataId) {
              await db.update(workflowSuites).set({ ...cleanData, updatedAt: new Date() }).where(and(eq(workflowSuites.id, dataId), eq(workflowSuites.orgId, orgId)));
              resourceId = dataId;
            } else if (op.action === 'delete' && dataId) {
              await db.delete(workflowSuites).where(and(eq(workflowSuites.id, dataId), eq(workflowSuites.orgId, orgId)));
              resourceId = dataId;
            }
            break;
          }
          case 'workflow': {
            if (op.action === 'create') {
              const [row] = await db.insert(workflows).values({ orgId, ...cleanData }).returning();
              resourceId = row.id;
            } else if (op.action === 'update' && dataId) {
              await db.update(workflows).set({ ...cleanData, updatedAt: new Date() }).where(and(eq(workflows.id, dataId), eq(workflows.orgId, orgId)));
              resourceId = dataId;
            } else if (op.action === 'delete' && dataId) {
              await db.delete(workflows).where(and(eq(workflows.id, dataId), eq(workflows.orgId, orgId)));
              resourceId = dataId;
            }
            break;
          }
          case 'persona': {
            if (op.action === 'create') {
              const [row] = await db.insert(personas).values({ orgId, ...cleanData }).returning();
              resourceId = row.id;
            } else if (op.action === 'update' && dataId) {
              await db.update(personas).set({ ...cleanData, updatedAt: new Date() }).where(and(eq(personas.id, dataId), eq(personas.orgId, orgId)));
              resourceId = dataId;
            } else if (op.action === 'delete' && dataId) {
              await db.delete(personas).where(and(eq(personas.id, dataId), eq(personas.orgId, orgId)));
              resourceId = dataId;
            }
            break;
          }
          case 'policy_check': {
            if (op.action === 'create') {
              const [row] = await db.insert(policyChecks).values({ orgId, ...cleanData }).returning();
              resourceId = row.id;
            } else if (op.action === 'update' && dataId) {
              await db.update(policyChecks).set({ ...cleanData, updatedAt: new Date() }).where(and(eq(policyChecks.id, dataId), eq(policyChecks.orgId, orgId)));
              resourceId = dataId;
            } else if (op.action === 'delete' && dataId) {
              await db.delete(policyChecks).where(and(eq(policyChecks.id, dataId), eq(policyChecks.orgId, orgId)));
              resourceId = dataId;
            }
            break;
          }
          case 'action': {
            if (op.action === 'create') {
              const [row] = await db.insert(actions).values({ orgId, ...cleanData }).returning();
              resourceId = row.id;
            } else if (op.action === 'update' && dataId) {
              await db.update(actions).set({ ...cleanData, updatedAt: new Date() }).where(and(eq(actions.id, dataId), eq(actions.orgId, orgId)));
              resourceId = dataId;
            } else if (op.action === 'delete' && dataId) {
              await db.delete(actions).where(and(eq(actions.id, dataId), eq(actions.orgId, orgId)));
              resourceId = dataId;
            }
            break;
          }
          case 'environment': {
            if (op.action === 'create') {
              const [row] = await db.insert(environments).values({ orgId, ...cleanData }).returning();
              resourceId = row.id;
            } else if (op.action === 'update' && dataId) {
              await db.update(environments).set({ ...cleanData, updatedAt: new Date() }).where(and(eq(environments.id, dataId), eq(environments.orgId, orgId)));
              resourceId = dataId;
            } else if (op.action === 'delete' && dataId) {
              await db.delete(environments).where(and(eq(environments.id, dataId), eq(environments.orgId, orgId)));
              resourceId = dataId;
            }
            break;
          }
          default:
            results.push({
              op_id: op.op_id,
              success: false,
              error: `Unsupported resource: ${op.resource}`,
            });
            continue;
        }

        if (resourceId) {
          resolvedIds[op.op_id] = resourceId;
          results.push({
            op_id: op.op_id,
            success: true,
            resource: op.resource,
            resourceId,
          });

          // Audit each successful operation
          await createAuditLog(auditContext, `${op.resource}.${op.action}`, {
            category: 'assistant',
            severity: 'info',
            resource: {
              type: op.resource,
              id: resourceId,
            },
            details: {
              source: 'assistant',
              op_id: op.op_id,
            },
          });
        } else {
          results.push({
            op_id: op.op_id,
            success: false,
            error: 'Operation did not return a resource ID',
          });
        }
      } catch (error: any) {
        req.log.error({ op, error: error?.message }, 'assistant_apply_op_error');
        results.push({
          op_id: op.op_id,
          success: false,
          error: error?.message || 'Unknown error',
        });
      }
    }

    // Log completion
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    await createAuditLog(auditContext, 'assistant.apply_complete', {
      category: 'assistant',
      severity: failCount > 0 ? 'warning' : 'info',
      details: {
        successCount,
        failCount,
        totalOperations: operations.length,
      },
    });

    return reply.send({
      success: failCount === 0,
      results,
      resolvedIds,
    });
  });

  /**
   * GET /orgs/:orgId/assistant/context
   *
   * Get the system prompt and context for the assistant.
   * This is used by the streaming frontend to get the full context.
   */
  app.get('/:orgId/assistant/context', async (req, reply) => {
    const { orgId } = z.object({ orgId: z.string() }).parse(req.params as any);
    const mode = (req.query as any)?.mode || 'lamdis';

    // Get the appropriate assistant module
    const assistant = getAssistant(mode);
    if (!assistant) {
      return reply.code(400).send({ error: `Unknown assistant mode: ${mode}` });
    }

    try {
      // Generate the system prompt
      const systemPrompt = await assistant.systemPrompt({
        orgId,
        message: '',
        history: [],
        mode,
      });

      return reply.send({
        systemPrompt,
        mode,
        model: assistant.model || 'us.anthropic.claude-opus-4-5-20251001-v1:0',
      });
    } catch (error: any) {
      req.log.error({ error: error?.message, mode, orgId }, 'assistant_context_error');
      return reply.code(500).send({
        error: error?.message || 'Failed to generate context',
      });
    }
  });

  /**
   * GET /orgs/:orgId/assistant/modes
   *
   * List available assistant modes.
   */
  app.get('/:orgId/assistant/modes', async (req) => {
    const { assistantRegistry } = await import('../lib/assistant/registry.js');

    return {
      modes: Object.values(assistantRegistry).map(assistant => ({
        id: assistant.id,
        description: assistant.description,
      })),
    };
  });

  /**
   * POST /orgs/:orgId/assistant/stream
   *
   * Streaming chat endpoint using Server-Sent Events (SSE).
   * Sends real-time events as the assistant processes the request.
   */
  app.post('/:orgId/assistant/stream', async (req, reply) => {
    const { orgId } = z.object({ orgId: z.string() }).parse(req.params as any);

    const body = z.object({
      message: z.string().min(1),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })).optional().default([]),
      mode: z.string().optional().default('lamdis'),
    }).parse(req.body as any);

    const { message, history, mode } = body;

    // Build audit context
    const auditContext: AuditContext = {
      orgId,
      userSub: (req as any).user?.sub,
      userEmail: (req as any).user?.email,
      source: 'api',
      requestId: (req as any).id,
    };

    // Log the streaming chat request
    await createAuditLog(auditContext, 'assistant.stream_start', {
      category: 'assistant',
      severity: 'info',
      details: {
        mode,
        messageLength: message.length,
        historyLength: history.length,
      },
    });

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Helper to send SSE events
    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Send start event
      sendEvent('start', {
        status: 'processing',
        timestamp: new Date().toISOString(),
        mode
      });

      // Get the assistant
      const assistant = getAssistant(mode);
      if (!assistant) {
        sendEvent('error', { error: `Unknown assistant mode: ${mode}` });
        reply.raw.end();
        return;
      }

      // Run the assistant
      const result = await assistant.run({
        orgId,
        message,
        history,
        mode,
      });

      if (result.error) {
        sendEvent('error', { error: result.error });
      } else {
        // If there are tool results (created/queried resources), send them first
        if (result.structured?.tool_results) {
          for (const toolResult of result.structured.tool_results) {
            sendEvent('tool_result', {
              tool: toolResult.tool,
              result: toolResult.result,
              error: toolResult.error,
            });
          }
        }

        // Send the main response
        sendEvent('message', {
          response: result.structured?.response || result.reply || '',
          structured: result.structured,
        });
      }

      // Send completion event
      sendEvent('done', {
        status: 'complete',
        timestamp: new Date().toISOString()
      });

      // Log completion
      await createAuditLog(auditContext, 'assistant.stream_complete', {
        category: 'assistant',
        severity: 'info',
        details: {
          mode,
          hasStructured: !!result.structured,
          toolResultCount: result.structured?.tool_results?.length || 0,
        },
      });

    } catch (error: any) {
      req.log.error({ error: error?.message, mode, orgId }, 'assistant_stream_error');
      sendEvent('error', { error: error?.message || 'Stream error' });

      await createAuditLog(auditContext, 'assistant.stream_error', {
        category: 'assistant',
        severity: 'critical',
        details: {
          mode,
          error: error?.message,
        },
      });
    } finally {
      reply.raw.end();
    }
  });
}
