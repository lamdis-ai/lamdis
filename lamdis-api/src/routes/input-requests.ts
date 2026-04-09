import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { evidenceEvents, outcomeInstances, actionExecutions, actionBindings } from '@lamdis/db/schema';
import { inputRequests, agentTasks } from '@lamdis/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { hasScope } from './api-keys.js';
import { orchestratorTick } from '../services/automation/outcomeOrchestrator.js';
import { executeAction } from '../services/automation/actionExecutor.js';

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

export default async function inputRequestRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // LIST INPUT REQUESTS
  // =========================================================================

  fastify.get('/orgs/:orgId/input-requests', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;

    const query = req.query as {
      outcomeInstanceId?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    const conditions = [eq(inputRequests.orgId, orgId)];
    if (query.outcomeInstanceId) conditions.push(eq(inputRequests.outcomeInstanceId, query.outcomeInstanceId));
    if (query.status) conditions.push(eq(inputRequests.status, query.status));

    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const rows = await db.select().from(inputRequests)
      .where(and(...conditions))
      .orderBy(desc(inputRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ count: count() }).from(inputRequests)
      .where(and(...conditions));

    return reply.send({ requests: rows, total: totalRow?.count || 0, limit, offset });
  });

  // =========================================================================
  // GET INPUT REQUEST DETAIL
  // =========================================================================

  fastify.get('/orgs/:orgId/input-requests/:id', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:read');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const [row] = await db.select().from(inputRequests)
      .where(and(eq(inputRequests.id, id), eq(inputRequests.orgId, orgId)))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Input request not found' });
    return reply.send(row);
  });

  // =========================================================================
  // RESPOND TO INPUT REQUEST — user provides the requested data
  // =========================================================================

  fastify.post('/orgs/:orgId/input-requests/:id/respond', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const body = z.object({
      response: z.record(z.unknown()),
    }).parse(req.body as any);

    const [row] = await db.select().from(inputRequests)
      .where(and(eq(inputRequests.id, id), eq(inputRequests.orgId, orgId)))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Input request not found' });
    if (row.status !== 'pending') {
      return reply.code(409).send({ error: `Request is already ${row.status}` });
    }

    const user = (req as any).user || {};

    // Update the input request
    const [updated] = await db.update(inputRequests).set({
      status: 'fulfilled',
      response: body.response,
      respondedBy: user.sub || 'unknown',
      respondedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(inputRequests.id, id))
      .returning();

    // Unblock the linked agent task if there is one
    if (row.agentTaskId) {
      await db.update(agentTasks).set({
        status: 'completed',
        actionOutput: body.response,
        completedAt: new Date(),
        updatedAt: new Date(),
      } as any).where(eq(agentTasks.id, row.agentTaskId));
    }

    // Emit evidence event
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId: row.outcomeInstanceId,
      eventType: `input.provided.${row.requestType}`,
      eventSource: 'user:input_response',
      payload: {
        requestId: id,
        requestType: row.requestType,
        title: row.title,
        response: body.response,
      },
      confirmationLevel: 'A',
      idempotencyKey: `input-response-${id}`,
      emittedAt: new Date(),
    });

    // Playbook-violation resume: if this input request was the
    // "approve unbound / pick bound / cancel" prompt from actionExecutor,
    // act on the user's choice now.
    const schemaData = (row.schema || {}) as Record<string, unknown>;
    if (schemaData.kind === 'playbook_violation') {
      try {
        await resolvePlaybookViolation({
          orgId,
          outcomeInstanceId: row.outcomeInstanceId,
          schema: schemaData,
          response: body.response,
        });
      } catch (err: any) {
        console.error(`[input-request] Playbook violation resume failed: ${err?.message}`);
      }
    }

    // Trigger orchestrator tick — the agent can now proceed
    orchestratorTick(row.outcomeInstanceId).catch(err => {
      console.error(`[input-request] Tick error for ${row.outcomeInstanceId}:`, err?.message);
    });

    return reply.send(updated);
  });

  // =========================================================================
  // Helper: resume an action execution that was blocked by playbook gate
  // =========================================================================

  async function resolvePlaybookViolation(args: {
    orgId: string;
    outcomeInstanceId: string;
    schema: Record<string, unknown>;
    response: Record<string, unknown>;
  }) {
    const { orgId, outcomeInstanceId, schema: s, response } = args;
    const blockedExecutionId = String(s.actionExecutionId || '');
    if (!blockedExecutionId) return;

    // approve_unbound: re-run the SAME execution with the gate bypassed
    if (response.approve_unbound === true || response.choice === 'approve_unbound') {
      await db.update(actionExecutions).set({
        status: 'pending',
        blockedReason: null,
        updatedAt: new Date(),
      } as any).where(eq(actionExecutions.id, blockedExecutionId));

      await db.insert(evidenceEvents).values({
        orgId,
        outcomeInstanceId,
        eventType: 'playbook.violation.approved',
        eventSource: 'user:input_response',
        payload: {
          actionExecutionId: blockedExecutionId,
          blockedConnectorInstanceId: s.blockedConnectorInstanceId ?? null,
          override: 'approved_unbound_once',
        },
        confirmationLevel: 'A',
        idempotencyKey: `pb-approve-${blockedExecutionId}`,
        emittedAt: new Date(),
      });

      // Re-run with the bypass flag — fire and forget so the HTTP response
      // returns quickly. The orchestrator tick at the end of /respond will
      // also pick up new state.
      void executeAction(blockedExecutionId, { skipPlaybookEnforcement: true });
      return;
    }

    // pick_bound: swap to a different binding (one that uses the chosen
    // connector instance) and re-run with the gate ON. We update the
    // execution's stored input/binding pointer by writing a new
    // execution row that copies most of the original and points at the
    // bound connector. The original stays in 'blocked_by_playbook' for audit.
    const pickedConnectorId = (response.pick_bound as string) || (response.connectorInstanceId as string);
    if (pickedConnectorId) {
      const [origExec] = await db.select().from(actionExecutions)
        .where(eq(actionExecutions.id, blockedExecutionId))
        .limit(1);
      if (!origExec || !origExec.actionId) return;

      // Find a binding for the same action that uses the picked connector.
      // We can't easily query by connector_instance_id + action without
      // pulling the action's slug, so do it in two steps.
      const allBindings = await db.select().from(actionBindings)
        .where(and(
          eq(actionBindings.orgId, orgId),
          eq(actionBindings.enabled, true),
        ));
      const matchingBinding = allBindings.find(
        (b) => b.connectorInstanceId === pickedConnectorId,
      );
      if (!matchingBinding) {
        await db.insert(evidenceEvents).values({
          orgId,
          outcomeInstanceId,
          eventType: 'playbook.violation.pick_bound_failed',
          eventSource: 'user:input_response',
          payload: { reason: 'no_matching_binding', pickedConnectorId },
          confirmationLevel: 'A',
          idempotencyKey: `pb-pick-fail-${blockedExecutionId}`,
          emittedAt: new Date(),
        });
        return;
      }

      // Insert a new pending execution row for the same action; the
      // orchestrator tick / executor will pick it up. We don't try to
      // update the original since action_executions doesn't store a
      // binding ref directly — the binding is resolved at runtime by
      // org+actionId, so the new execution will naturally pick up the
      // bound binding (we'll need a more durable fix if multiple bindings
      // can match — for now, prefer the first enabled one with the
      // picked connector).
      const [newExec] = await db.insert(actionExecutions).values({
        orgId,
        outcomeInstanceId,
        actionId: origExec.actionId,
        status: 'pending',
        evidenceSnapshot: origExec.evidenceSnapshot,
        proposedReason: `Re-run after playbook violation; connector=${pickedConnectorId}`,
      } as any).returning();

      await db.insert(evidenceEvents).values({
        orgId,
        outcomeInstanceId,
        eventType: 'playbook.violation.picked_bound',
        eventSource: 'user:input_response',
        payload: {
          originalExecutionId: blockedExecutionId,
          newExecutionId: newExec?.id,
          pickedConnectorInstanceId: pickedConnectorId,
        },
        confirmationLevel: 'A',
        idempotencyKey: `pb-pick-${blockedExecutionId}`,
        emittedAt: new Date(),
      });

      if (newExec?.id) {
        void executeAction(newExec.id);
      }
      return;
    }

    // cancel: mark the original execution cancelled and emit evidence
    if (response.cancel === true || response.choice === 'cancel') {
      await db.update(actionExecutions).set({
        status: 'cancelled',
        updatedAt: new Date(),
      } as any).where(eq(actionExecutions.id, blockedExecutionId));

      await db.insert(evidenceEvents).values({
        orgId,
        outcomeInstanceId,
        eventType: 'playbook.violation.cancelled',
        eventSource: 'user:input_response',
        payload: { actionExecutionId: blockedExecutionId },
        confirmationLevel: 'A',
        idempotencyKey: `pb-cancel-${blockedExecutionId}`,
        emittedAt: new Date(),
      });
    }
  }

  // =========================================================================
  // CANCEL INPUT REQUEST
  // =========================================================================

  fastify.post('/orgs/:orgId/input-requests/:id/cancel', async (req, reply) => {
    const orgId = resolveOrgId(req, reply, 'workflows:write');
    if (!orgId) return;
    const { id } = req.params as { id: string };

    const [row] = await db.select().from(inputRequests)
      .where(and(eq(inputRequests.id, id), eq(inputRequests.orgId, orgId)))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Input request not found' });

    const [updated] = await db.update(inputRequests).set({
      status: 'cancelled',
      updatedAt: new Date(),
    }).where(eq(inputRequests.id, id))
      .returning();

    return reply.send(updated);
  });
}
