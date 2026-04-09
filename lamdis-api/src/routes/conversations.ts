import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { conversationSessions, outcomeInstances } from '@lamdis/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { hasScope } from './api-keys.js';
import { processMessage } from '../services/automation/conversationProcessor.js';

function resolveOrgId(
  req: FastifyRequest,
  reply: FastifyReply,
  requiredScope?: string,
): string | null {
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

export default async function conversationRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // START CONVERSATION SESSION
  // =========================================================================

  fastify.post('/orgs/:orgId/conversations', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'conversations:write');
    // Fall back to workflows scope if conversations scope doesn't exist yet
    if (!orgId) {
      const orgId2 = resolveOrgId(req, reply, 'workflows:write');
      if (!orgId2) return;
    }
    const resolvedOrgId = orgId || (req.params as any).orgId;

    const body = z.object({
      outcomeInstanceId: z.string().uuid().optional(),
      channel: z.enum(['chat', 'email', 'voice', 'webhook']).default('chat'),
      externalSessionId: z.string().optional(),
      participantId: z.string().optional(),
      participantType: z.enum(['customer', 'agent', 'system']).default('customer'),
      context: z.record(z.unknown()).optional(),
    }).parse(req.body as any);

    // Verify outcome instance exists if provided
    if (body.outcomeInstanceId) {
      const [inst] = await db.select({ id: outcomeInstances.id })
        .from(outcomeInstances)
        .where(and(eq(outcomeInstances.id, body.outcomeInstanceId), eq(outcomeInstances.orgId, resolvedOrgId)))
        .limit(1);
      if (!inst) return reply.code(404).send({ error: 'Outcome instance not found' });
    }

    // Generate session auth token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    const [session] = await db.insert(conversationSessions).values({
      orgId: resolvedOrgId,
      outcomeInstanceId: body.outcomeInstanceId || undefined,
      channel: body.channel,
      externalSessionId: body.externalSessionId || undefined,
      participantId: body.participantId || undefined,
      participantType: body.participantType,
      context: body.context || {},
      authTokenHash: tokenHash,
      status: 'active',
    } as any).returning();

    return reply.code(201).send({
      ...session,
      sessionToken, // Only returned on creation
    });
  });

  // =========================================================================
  // SEND MESSAGE TO CONVERSATION
  // =========================================================================

  fastify.post('/orgs/:orgId/conversations/:sessionId/messages', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { sessionId } = req.params as { sessionId: string };

    const body = z.object({
      text: z.string().min(1).max(10000),
      attachments: z.array(z.object({
        data: z.string(), // base64 encoded
        mimeType: z.string(),
        name: z.string().optional(),
      })).optional(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(req.body as any);

    // Verify session exists and belongs to org
    const [session] = await db.select()
      .from(conversationSessions)
      .where(and(eq(conversationSessions.id, sessionId), eq(conversationSessions.orgId, orgId)))
      .limit(1);

    if (!session) return reply.code(404).send({ error: 'Conversation session not found' });
    if (session.status !== 'active') return reply.code(400).send({ error: 'Conversation session is not active' });

    // Process the message through the conversation processor (with optional attachments)
    const result = await processMessage(sessionId, body.text, body.metadata, body.attachments);

    return reply.send(result);
  });

  // =========================================================================
  // GET CONVERSATION SESSION
  // =========================================================================

  fastify.get('/orgs/:orgId/conversations/:sessionId', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { sessionId } = req.params as { sessionId: string };

    const [session] = await db.select()
      .from(conversationSessions)
      .where(and(eq(conversationSessions.id, sessionId), eq(conversationSessions.orgId, orgId)))
      .limit(1);

    if (!session) return reply.code(404).send({ error: 'Conversation session not found' });

    // Get linked outcome status if applicable
    let outcomeStatus = null;
    if (session.outcomeInstanceId) {
      const [inst] = await db.select({
        id: outcomeInstances.id,
        status: outcomeInstances.status,
        proofStatus: outcomeInstances.proofStatus,
        confidenceScore: outcomeInstances.confidenceScore,
        automationMode: outcomeInstances.automationMode,
      })
        .from(outcomeInstances)
        .where(eq(outcomeInstances.id, session.outcomeInstanceId))
        .limit(1);
      outcomeStatus = inst || null;
    }

    return reply.send({ ...session, outcomeStatus });
  });

  // =========================================================================
  // EXECUTE ACTION FROM CONVERSATION
  // =========================================================================

  fastify.post('/orgs/:orgId/conversations/:sessionId/action', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { sessionId } = req.params as { sessionId: string };

    const body = z.object({
      actionId: z.string().uuid().optional(),
      actionName: z.string(),
      approved: z.boolean().default(true),
      notes: z.string().optional(),
    }).parse(req.body as any);

    // Verify session
    const [session] = await db.select()
      .from(conversationSessions)
      .where(and(eq(conversationSessions.id, sessionId), eq(conversationSessions.orgId, orgId)))
      .limit(1);

    if (!session) return reply.code(404).send({ error: 'Conversation session not found' });

    // For now, record the action intent — actual execution happens via the action proposer
    return reply.send({
      status: body.approved ? 'action_approved' : 'action_declined',
      actionName: body.actionName,
      sessionId,
      outcomeInstanceId: session.outcomeInstanceId,
    });
  });

  // =========================================================================
  // LIST CONVERSATIONS FOR AN OUTCOME INSTANCE
  // =========================================================================

  fastify.get('/orgs/:orgId/outcome-instances/:id/conversations', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const sessions = await db.select()
      .from(conversationSessions)
      .where(and(
        eq(conversationSessions.orgId, orgId),
        eq(conversationSessions.outcomeInstanceId, id),
      ))
      .orderBy(desc(conversationSessions.createdAt));

    return reply.send(sessions);
  });
}
