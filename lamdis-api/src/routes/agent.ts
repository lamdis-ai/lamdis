import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { outcomeInstances, evidenceEvents } from '@lamdis/db/schema';
import { agentTasks, agentActivityLog } from '@lamdis/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { hasScope } from './api-keys.js';
import { orchestratorTick } from '../services/automation/outcomeOrchestrator.js';
import { agentChat } from '../services/automation/agentConversation.js';
import { uploadFile, storageKey } from '../services/storage/mediaStorageService.js';
import * as mediaReview from '../services/generative/mediaReviewService.js';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { setFact, removeFact } from '../services/automation/factReconciler.js';

function resolveOrgId(req: FastifyRequest, reply: FastifyReply, requiredScope?: string): string | null {
  const { orgId } = req.params as { orgId: string };
  const apiKeyAuth = (req as any).apiKeyAuth as { orgId: string; scopes: string[] } | undefined;
  if (apiKeyAuth) {
    if (orgId !== apiKeyAuth.orgId) {
      reply.code(403).send({ error: 'API key does not belong to this organization' });
      return null;
    }
    if (requiredScope && !hasScope(apiKeyAuth.scopes, requiredScope)) {
      reply.code(403).send({ error: `API key missing required scope: ${requiredScope}` });
      return null;
    }
    return orgId;
  }
  return orgId;
}

export default async function agentRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // START AGENT — enable the autonomous agent loop for an outcome instance
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/start', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      goal: z.string().min(1),
      guidelines: z.record(z.unknown()).optional(),
      contact: z.object({
        phone: z.string().optional(),
        email: z.string().optional(),
        pushEnabled: z.boolean().optional(),
      }).optional(),
    }).parse(req.body as any);

    const [instance] = await db.select().from(outcomeInstances)
      .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
      .limit(1);

    if (!instance) return reply.code(404).send({ error: 'Outcome instance not found' });

    await db.update(outcomeInstances).set({
      agentEnabled: true,
      agentStatus: 'planning',
      goalDescription: body.goal,
      guidelines: body.guidelines || {},
      userContact: body.contact || {},
      updatedAt: new Date(),
    }).where(eq(outcomeInstances.id, id));

    // Trigger initial planning tick
    orchestratorTick(id).catch(err => {
      console.error(`[agent-route] Initial tick error for ${id}:`, err?.message);
    });

    return reply.send({ status: 'started', instanceId: id, goal: body.goal });
  });

  // =========================================================================
  // PAUSE AGENT
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/pause', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    await db.update(outcomeInstances).set({
      agentStatus: 'paused',
      updatedAt: new Date(),
    }).where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)));

    return reply.send({ status: 'paused', instanceId: id });
  });

  // =========================================================================
  // RESUME AGENT
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/resume', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    await db.update(outcomeInstances).set({
      agentStatus: 'planning',
      updatedAt: new Date(),
    }).where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)));

    // Trigger tick
    orchestratorTick(id).catch(err => {
      console.error(`[agent-route] Resume tick error for ${id}:`, err?.message);
    });

    return reply.send({ status: 'resumed', instanceId: id });
  });

  // =========================================================================
  // REDIRECT — send new instructions mid-flight
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/redirect', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      message: z.string().min(1),
    }).parse(req.body as any);

    // Emit the user's direction as an evidence event
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId: id,
      eventType: 'user.direction',
      eventSource: 'user:redirect',
      payload: { message: body.message },
      confirmationLevel: 'A',
      idempotencyKey: `redirect-${id}-${Date.now()}`,
      emittedAt: new Date(),
    });

    // Trigger tick to process the new direction
    orchestratorTick(id).catch(err => {
      console.error(`[agent-route] Redirect tick error for ${id}:`, err?.message);
    });

    return reply.send({ status: 'redirected', instanceId: id, message: body.message });
  });

  // =========================================================================
  // GET PLAN — current task plan for the instance
  // =========================================================================

  fastify.get('/orgs/:orgId/outcome-instances/:id/agent/plan', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const tasks = await db.select().from(agentTasks)
      .where(and(eq(agentTasks.outcomeInstanceId, id), eq(agentTasks.orgId, orgId)))
      .orderBy(agentTasks.sequence);

    // Also get instance summary
    const [instance] = await db.select({
      agentStatus: outcomeInstances.agentStatus,
      currentPlan: outcomeInstances.currentPlan,
      goalDescription: outcomeInstances.goalDescription,
      confidenceScore: outcomeInstances.confidenceScore,
      proofStatus: outcomeInstances.proofStatus,
    }).from(outcomeInstances)
      .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
      .limit(1);

    return reply.send({ tasks, summary: instance || null });
  });

  // =========================================================================
  // GET ACTIVITY — paginated activity feed
  // =========================================================================

  fastify.get('/orgs/:orgId/outcome-instances/:id/agent/activity', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const query = req.query as { limit?: string; offset?: string };

    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const offset = parseInt(query.offset || '0', 10);

    const rows = await db.select().from(agentActivityLog)
      .where(and(eq(agentActivityLog.outcomeInstanceId, id), eq(agentActivityLog.orgId, orgId)))
      .orderBy(desc(agentActivityLog.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ count: count() }).from(agentActivityLog)
      .where(and(eq(agentActivityLog.outcomeInstanceId, id), eq(agentActivityLog.orgId, orgId)));

    return reply.send({ activities: rows, total: totalRow?.count || 0, limit, offset });
  });

  // =========================================================================
  // ACTIVITY STREAM — SSE endpoint for live updates
  // =========================================================================

  fastify.get('/orgs/:orgId/outcome-instances/:id/agent/activity/stream', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let lastId = '';
    const pollInterval = setInterval(async () => {
      try {
        const conditions = [
          eq(agentActivityLog.outcomeInstanceId, id),
          eq(agentActivityLog.orgId, orgId),
        ];

        const rows = await db.select().from(agentActivityLog)
          .where(and(...conditions))
          .orderBy(desc(agentActivityLog.createdAt))
          .limit(10);

        for (const row of rows.reverse()) {
          if (row.id !== lastId) {
            lastId = row.id;
            reply.raw.write(`data: ${JSON.stringify(row)}\n\n`);
          }
        }
      } catch { /* connection may have closed */ }
    }, 2000);

    req.raw.on('close', () => {
      clearInterval(pollInterval);
    });
  });

  // =========================================================================
  // CHAT — streaming conversational endpoint (the primary agent interface)
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/chat', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      message: z.string().min(1),
      attachments: z.array(z.object({
        data: z.string(),
        mimeType: z.string(),
        name: z.string().optional(),
      })).optional(),
    }).parse(req.body as any);

    // Verify instance exists and agent is enabled
    const [instance] = await db.select().from(outcomeInstances)
      .where(and(eq(outcomeInstances.id, id), eq(outcomeInstances.orgId, orgId)))
      .limit(1);

    if (!instance) return reply.code(404).send({ error: 'Outcome instance not found' });

    // Auto-enable agent if not already
    if (!instance.agentEnabled) {
      await db.update(outcomeInstances).set({
        agentEnabled: true,
        agentStatus: 'executing',
        updatedAt: new Date(),
      }).where(eq(outcomeInstances.id, id));
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of agentChat({
        instanceId: id,
        orgId,
        message: body.message,
        attachments: body.attachments,
      })) {
        sendEvent(event.type, event.data);
      }
    } catch (err: any) {
      sendEvent('error', { message: err?.message || 'Stream error' });
    }

    reply.raw.end();
  });

  // =========================================================================
  // ASSIGN TASK TO USER
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/tasks/:taskId/assign', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, taskId } = req.params as { id: string; taskId: string };

    const body = z.object({
      assigneeType: z.enum(['user', 'external']),
      assigneeRef: z.string().min(1), // userSub or external identifier
    }).parse(req.body as any);

    const [task] = await db.select().from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.outcomeInstanceId, id)))
      .limit(1);

    if (!task) return reply.code(404).send({ error: 'Task not found' });

    await db.update(agentTasks).set({
      assigneeType: body.assigneeType,
      assigneeRef: body.assigneeRef,
      updatedAt: new Date(),
    } as any).where(eq(agentTasks.id, taskId));

    return reply.send({ assigned: true, taskId, assigneeType: body.assigneeType, assigneeRef: body.assigneeRef });
  });

  // =========================================================================
  // SUBMIT EVIDENCE FOR TASK
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/tasks/:taskId/evidence', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, taskId } = req.params as { id: string; taskId: string };

    const body = z.object({
      type: z.enum(['image', 'audio', 'video', 'document', 'screenshot', 'log']),
      data: z.string(), // base64 encoded
      mimeType: z.string(),
      fileName: z.string().optional(),
      autoReview: z.boolean().optional().default(true), // auto-trigger LLM review
    }).parse(req.body as any);

    const [task] = await db.select().from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.outcomeInstanceId, id)))
      .limit(1);

    if (!task) return reply.code(404).send({ error: 'Task not found' });

    // Store the file
    const fileBuffer = Buffer.from(body.data, 'base64');
    const key = storageKey(orgId, 'evidence', id, `${taskId}-${Date.now()}-${body.fileName || 'file'}`);
    const uploadResult = await uploadFile(key, fileBuffer, body.mimeType);

    const userSub = (req as any).user?.sub || 'unknown';

    // Build attachment record
    const attachment: any = {
      type: body.type,
      storageKey: key,
      mimeType: body.mimeType,
      fileName: body.fileName,
      sizeBytes: uploadResult.sizeBytes,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userSub,
    };

    // Auto-review with LLM if requested and applicable
    if (body.autoReview && (body.type === 'image' || body.type === 'screenshot')) {
      try {
        const mctx = {
          orgId,
          serviceKey: 'agent.evidence_review',
          outcomeInstanceId: id,
          agentTaskId: taskId,
          userId: userSub,
        };
        const reviewResult = body.type === 'screenshot'
          ? await mediaReview.reviewScreenshotEvidence(body.data, body.mimeType, task.title || '', mctx)
          : await mediaReview.reviewImageEvidence(body.data, body.mimeType, task.title || '', task.description || '', mctx);

        attachment.llmReviewResult = {
          verified: reviewResult.verified,
          reasoning: reviewResult.reasoning,
          confidence: reviewResult.confidence,
          reviewedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        console.error('[agent] LLM review failed:', err?.message);
      }
    }

    // Update task with new evidence attachment
    const existingAttachments = (task.evidenceAttachments as any[]) || [];
    existingAttachments.push(attachment);

    const updateFields: any = {
      evidenceAttachments: existingAttachments,
      updatedAt: new Date(),
    };

    // Auto-complete task if LLM verified
    if (attachment.llmReviewResult?.verified && attachment.llmReviewResult?.confidence > 0.7) {
      updateFields.status = 'completed';
      updateFields.completedAt = new Date();
      updateFields.reviewResult = {
        reviewedBy: 'llm',
        status: 'verified',
        reasoning: attachment.llmReviewResult.reasoning,
        confidence: attachment.llmReviewResult.confidence,
        reviewedAt: new Date().toISOString(),
      };
    }

    await db.update(agentTasks).set(updateFields).where(eq(agentTasks.id, taskId));

    // Emit evidence event
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId: id,
      eventType: `task.evidence.${body.type}`,
      eventSource: 'user:upload',
      payload: {
        taskId,
        type: body.type,
        fileName: body.fileName,
        sizeBytes: uploadResult.sizeBytes,
        reviewed: !!attachment.llmReviewResult,
        verified: attachment.llmReviewResult?.verified,
      },
      confirmationLevel: 'B',
      idempotencyKey: `evidence-${taskId}-${Date.now()}`,
      emittedAt: new Date(),
    });

    // Trigger orchestrator tick if evidence was submitted
    orchestratorTick(id).catch(() => {});

    return reply.send({
      uploaded: true,
      storageKey: key,
      review: attachment.llmReviewResult || null,
      taskStatus: updateFields.status || task.status,
    });
  });

  // =========================================================================
  // LLM REVIEW OF TASK EVIDENCE (manual trigger)
  // =========================================================================

  fastify.post('/orgs/:orgId/outcome-instances/:id/agent/tasks/:taskId/review', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, taskId } = req.params as { id: string; taskId: string };

    const [task] = await db.select().from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.outcomeInstanceId, id)))
      .limit(1);

    if (!task) return reply.code(404).send({ error: 'Task not found' });

    const attachments = (task.evidenceAttachments as any[]) || [];
    if (attachments.length === 0) {
      return reply.code(400).send({ error: 'No evidence attachments to review' });
    }

    // Review the most recent attachment that hasn't been reviewed
    const unreviewed = attachments.find(a => !a.llmReviewResult);
    if (!unreviewed) {
      return reply.send({ message: 'All attachments already reviewed', reviews: attachments.map(a => a.llmReviewResult) });
    }

    let reviewResult: mediaReview.MediaReviewResult;

    if (unreviewed.type === 'document') {
      // For documents, we'd need to fetch and extract text — simplified here
      reviewResult = await mediaReview.reviewDocumentEvidence(
        'Document content would be extracted here',
        task.title || '',
        {
          orgId,
          serviceKey: 'agent.evidence_review',
          outcomeInstanceId: id,
          agentTaskId: taskId,
        },
        task.description,
      );
    } else {
      // For images/screenshots, we need the base64 data — would fetch from storage
      reviewResult = {
        verified: false,
        reasoning: 'Manual review: base64 data not available from storage for re-review. Submit new evidence with autoReview=true.',
        confidence: 0,
      };
    }

    unreviewed.llmReviewResult = {
      verified: reviewResult.verified,
      reasoning: reviewResult.reasoning,
      confidence: reviewResult.confidence,
      reviewedAt: new Date().toISOString(),
    };

    await db.update(agentTasks).set({
      evidenceAttachments: attachments,
      updatedAt: new Date(),
    } as any).where(eq(agentTasks.id, taskId));

    return reply.send({ review: unreviewed.llmReviewResult });
  });

  // =========================================================================
  // GET MY TASKS (tasks assigned to current user across all objectives)
  // =========================================================================

  fastify.get('/orgs/:orgId/my-tasks', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const userSub = (req as any).user?.sub;
    if (!userSub) return reply.code(401).send({ error: 'Authentication required' });

    const { status } = req.query as { status?: string };

    const tasks = await db.select().from(agentTasks)
      .where(and(
        eq(agentTasks.orgId, orgId),
        eq(agentTasks.assigneeRef, userSub),
      ))
      .orderBy(desc(agentTasks.createdAt));

    const filtered = status ? tasks.filter(t => t.status === status) : tasks;
    return reply.send(filtered);
  });

  // -------------------------------------------------------------------------
  // Files — list/serve files from the objective workspace
  // -------------------------------------------------------------------------

  const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || './data/workspaces';

  fastify.get('/orgs/:orgId/outcome-instances/:id/files', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const dir = join(WORKSPACE_ROOT, id, 'files');
    if (!existsSync(dir)) {
      return reply.send({ files: [] });
    }

    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain',
      '.json': 'application/json', '.html': 'text/html', '.csv': 'text/csv',
    };

    try {
      const entries = readdirSync(dir);
      const files = entries.map(name => {
        const filePath = join(dir, name);
        const stat = statSync(filePath);
        const ext = extname(name).toLowerCase();
        const mime = mimeTypes[ext] || 'application/octet-stream';
        const isImage = mime.startsWith('image/');
        return {
          name,
          sizeBytes: stat.size,
          sizeKB: +(stat.size / 1024).toFixed(1),
          mimeType: mime,
          isImage,
          modified: stat.mtime.toISOString(),
          url: `/orgs/${orgId}/outcome-instances/${id}/files/${encodeURIComponent(name)}`,
        };
      });
      // Sort: images first, then by modified desc
      files.sort((a, b) => {
        if (a.isImage && !b.isImage) return -1;
        if (!a.isImage && b.isImage) return 1;
        return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      });
      return reply.send({ files });
    } catch (err: any) {
      return reply.code(500).send({ error: err?.message });
    }
  });

  // Serve individual file
  fastify.get('/orgs/:orgId/outcome-instances/:id/files/:fileName', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id, fileName } = req.params as { id: string; fileName: string };

    const filePath = join(WORKSPACE_ROOT, id, 'files', decodeURIComponent(fileName));
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const ext = extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain',
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';

    const data = readFileSync(filePath);
    return reply.header('Content-Type', mime).header('Content-Length', data.length).send(data);
  });

  // Delete a file from the objective workspace
  fastify.delete('/orgs/:orgId/outcome-instances/:id/files/:fileName', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, fileName } = req.params as { id: string; fileName: string };

    const filePath = join(WORKSPACE_ROOT, id, 'files', decodeURIComponent(fileName));
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const { unlinkSync } = require('fs');
    unlinkSync(filePath);
    return reply.code(204).send();
  });

  // Delete/cancel a task
  fastify.delete('/orgs/:orgId/outcome-instances/:id/agent/tasks/:taskId', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, taskId } = req.params as { id: string; taskId: string };

    await db.delete(agentTasks).where(
      and(eq(agentTasks.id, taskId), eq(agentTasks.orgId, orgId))
    );
    return reply.code(204).send();
  });

  // Update a task status (cancel = set to 'failed')
  fastify.patch('/orgs/:orgId/outcome-instances/:id/agent/tasks/:taskId', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, taskId } = req.params as { id: string; taskId: string };
    const body = req.body as { status?: string; title?: string; description?: string };

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.status) updates.status = body.status;
    if (body.title) updates.title = body.title;
    if (body.description) updates.description = body.description;
    if (body.status === 'completed') updates.completedAt = new Date();

    await db.update(agentTasks).set(updates).where(
      and(eq(agentTasks.id, taskId), eq(agentTasks.orgId, orgId))
    );

    const [updated] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId));
    return reply.send(updated || { id: taskId });
  });

  // -------------------------------------------------------------------------
  // Context Notes / Facts — structured knowledge about the objective
  // -------------------------------------------------------------------------

  // Search evidence events (with pagination, text search, filters)
  fastify.get('/orgs/:orgId/outcome-instances/:id/evidence', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const qs = req.query as { q?: string; type?: string; source?: string; limit?: string; offset?: string; failed?: string };

    const limit = Math.min(parseInt(qs.limit || '30'), 100);
    const offset = parseInt(qs.offset || '0');
    const search = qs.q || '';
    const typeFilter = qs.type || '';
    const sourceFilter = qs.source || '';
    const failedOnly = qs.failed === 'true';

    const { sql } = require('drizzle-orm');
    let conditions = `outcome_instance_id = '${id}' AND org_id = '${orgId}'`;
    if (typeFilter) conditions += ` AND event_type LIKE '${typeFilter}%'`;
    if (sourceFilter) conditions += ` AND event_source = '${sourceFilter}'`;
    if (failedOnly) conditions += ` AND (payload->>'ok')::text = 'false'`;
    if (search) {
      const escaped = search.replace(/'/g, "''");
      conditions += ` AND (event_type ILIKE '%${escaped}%' OR payload::text ILIKE '%${escaped}%')`;
    }

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

    return reply.send({ events, total, limit, offset, hasMore: offset + events.length < total });
  });

  // Get current facts
  fastify.get('/orgs/:orgId/outcome-instances/:id/facts', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const { sql } = require('drizzle-orm');
    const rows = await db.execute(sql`SELECT current_facts FROM outcome_instances WHERE id = ${id} LIMIT 1`);
    return reply.send({ facts: rows.rows?.[0]?.current_facts || {} });
  });

  // Set/update a fact
  fastify.patch('/orgs/:orgId/outcome-instances/:id/facts/:key', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, key } = req.params as { id: string; key: string };
    const { value } = req.body as { value: any };

    // Use raw SQL since currentFacts column was added after Drizzle types were generated
    const { sql } = require('drizzle-orm');
    const rows = await db.execute(sql`SELECT current_facts FROM outcome_instances WHERE id = ${id} LIMIT 1`);
    const existing = (rows.rows?.[0]?.current_facts || {}) as Record<string, any>;
    const updated = setFact(existing, key, value, 'user:manual');

    await db.execute(sql`UPDATE outcome_instances SET current_facts = ${JSON.stringify(updated)}::jsonb WHERE id = ${id}`);
    return reply.send({ facts: updated });
  });

  // Delete a fact
  fastify.delete('/orgs/:orgId/outcome-instances/:id/facts/:key', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id, key } = req.params as { id: string; key: string };

    const { sql } = require('drizzle-orm');
    const rows = await db.execute(sql`SELECT current_facts FROM outcome_instances WHERE id = ${id} LIMIT 1`);
    const existing = (rows.rows?.[0]?.current_facts || {}) as Record<string, any>;
    const updated = removeFact(existing, key);

    await db.execute(sql`UPDATE outcome_instances SET current_facts = ${JSON.stringify(updated)}::jsonb WHERE id = ${id}`);
    return reply.code(204).send();
  });
}
