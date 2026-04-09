import type { FastifyPluginAsync } from 'fastify';
import { and, eq, isNull, sql, desc, gte, lt, lte } from 'drizzle-orm';
import { db } from '../db.js';
import { llmUsageEvents, llmUsageRollups } from '@lamdis/db/schema';
import { periodStart } from '../services/llmCostControl/index.js';

/**
 * Usage telemetry routes — read-only views over llm_usage_events and
 * llm_usage_rollups. Supports the dashboard, CSV export, and the budget
 * forecasting page.
 *
 * All routes are scoped to /:orgId/usage so the org id is part of the path.
 */
const routes: FastifyPluginAsync = async (app) => {
  // ===========================================================================
  // GET /:orgId/usage/summary
  //
  // High-level summary for the current period: total cost, total tokens,
  // top-N services, top-N models, top-N outcome types, top-N instances.
  // Used by the Usage dashboard's main view.
  // ===========================================================================
  app.get('/:orgId/usage/summary', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const { period = 'monthly' } = (req.query as any) || {};
    const periodType = period === 'daily' ? 'daily' : 'monthly';
    const start = periodStart(periodType);

    // Read the org-level rollup row for the current period
    const [orgRollup] = await db
      .select()
      .from(llmUsageRollups)
      .where(and(
        eq(llmUsageRollups.orgId, orgId),
        eq(llmUsageRollups.scope, 'org'),
        isNull(llmUsageRollups.scopeRefId),
        eq(llmUsageRollups.periodType, periodType),
        eq(llmUsageRollups.periodStart, start),
      ))
      .limit(1);

    // Per-service breakdown for this period (computed from events;
    // rollups don't store service_key as a dimension)
    const byService = await db
      .select({
        serviceKey: llmUsageEvents.serviceKey,
        totalCostUsd: sql<string>`SUM(${llmUsageEvents.costUsd})` as any,
        totalTokens: sql<number>`SUM(${llmUsageEvents.totalTokens})` as any,
        callCount: sql<number>`COUNT(*)` as any,
      })
      .from(llmUsageEvents)
      .where(and(
        eq(llmUsageEvents.orgId, orgId),
        gte(llmUsageEvents.createdAt, start),
      ))
      .groupBy(llmUsageEvents.serviceKey)
      .orderBy(desc(sql`SUM(${llmUsageEvents.costUsd})`) as any)
      .limit(10);

    // Per-model breakdown — read from rollup (we have one row per model)
    const byModel = await db
      .select()
      .from(llmUsageRollups)
      .where(and(
        eq(llmUsageRollups.orgId, orgId),
        eq(llmUsageRollups.scope, 'model'),
        eq(llmUsageRollups.periodType, periodType),
        eq(llmUsageRollups.periodStart, start),
      ))
      .orderBy(desc(llmUsageRollups.totalCostUsd))
      .limit(10);

    // Top outcome types
    const byOutcomeType = await db
      .select()
      .from(llmUsageRollups)
      .where(and(
        eq(llmUsageRollups.orgId, orgId),
        eq(llmUsageRollups.scope, 'outcome_type'),
        eq(llmUsageRollups.periodType, periodType),
        eq(llmUsageRollups.periodStart, start),
      ))
      .orderBy(desc(llmUsageRollups.totalCostUsd))
      .limit(10);

    // Top outcome instances
    const byInstance = await db
      .select()
      .from(llmUsageRollups)
      .where(and(
        eq(llmUsageRollups.orgId, orgId),
        eq(llmUsageRollups.scope, 'outcome_instance'),
        eq(llmUsageRollups.periodType, periodType),
        eq(llmUsageRollups.periodStart, start),
      ))
      .orderBy(desc(llmUsageRollups.totalCostUsd))
      .limit(10);

    return reply.send({
      period: periodType,
      periodStart: start.toISOString(),
      total: orgRollup
        ? {
            totalCostUsd: Number(orgRollup.totalCostUsd),
            totalTokens: Number(orgRollup.totalTokens),
            totalInputTokens: Number(orgRollup.totalInputTokens),
            totalOutputTokens: Number(orgRollup.totalOutputTokens),
            callCount: orgRollup.callCount,
          }
        : { totalCostUsd: 0, totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, callCount: 0 },
      byService: byService.map((r) => ({
        serviceKey: r.serviceKey,
        totalCostUsd: Number(r.totalCostUsd),
        totalTokens: Number(r.totalTokens),
        callCount: Number(r.callCount),
      })),
      byModel: byModel.map((r) => ({
        modelId: r.scopeRefId,
        totalCostUsd: Number(r.totalCostUsd),
        totalTokens: Number(r.totalTokens),
        callCount: r.callCount,
      })),
      byOutcomeType: byOutcomeType.map((r) => ({
        outcomeTypeId: r.scopeRefId,
        totalCostUsd: Number(r.totalCostUsd),
        totalTokens: Number(r.totalTokens),
        callCount: r.callCount,
      })),
      byOutcomeInstance: byInstance.map((r) => ({
        outcomeInstanceId: r.scopeRefId,
        totalCostUsd: Number(r.totalCostUsd),
        totalTokens: Number(r.totalTokens),
        callCount: r.callCount,
      })),
    });
  });

  // ===========================================================================
  // GET /:orgId/usage/events
  //
  // Paginated event log. Supports filtering by service, outcome instance,
  // outcome type, and time range. Used by the Events tab on the Usage page.
  // ===========================================================================
  app.get('/:orgId/usage/events', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const q = (req.query as any) || {};
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500);
    const cursor = q.cursor ? new Date(String(q.cursor)) : null;

    const conditions = [eq(llmUsageEvents.orgId, orgId)];
    if (q.serviceKey) conditions.push(eq(llmUsageEvents.serviceKey, String(q.serviceKey)));
    if (q.modelId) conditions.push(eq(llmUsageEvents.modelId, String(q.modelId)));
    if (q.outcomeInstanceId) conditions.push(eq(llmUsageEvents.outcomeInstanceId, String(q.outcomeInstanceId)));
    if (q.outcomeTypeId) conditions.push(eq(llmUsageEvents.outcomeTypeId, String(q.outcomeTypeId)));
    if (q.agentTaskId) conditions.push(eq(llmUsageEvents.agentTaskId, String(q.agentTaskId)));
    if (q.status) conditions.push(eq(llmUsageEvents.status, String(q.status)));
    if (cursor) conditions.push(lt(llmUsageEvents.createdAt, cursor));
    if (q.from) conditions.push(gte(llmUsageEvents.createdAt, new Date(String(q.from))));
    if (q.to) conditions.push(lte(llmUsageEvents.createdAt, new Date(String(q.to))));

    const rows = await db
      .select()
      .from(llmUsageEvents)
      .where(and(...conditions))
      .orderBy(desc(llmUsageEvents.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
      ...r,
      costUsd: Number(r.costUsd),
    }));
    const nextCursor = hasMore ? items[items.length - 1].createdAt?.toISOString() : null;

    return reply.send({ items, nextCursor });
  });

  // ===========================================================================
  // GET /:orgId/usage/by-outcome-type
  //
  // Detailed cost-by-outcome-type breakdown for the current period.
  // Differs from the summary endpoint by also returning rolling 7-day cost
  // and call counts so the dashboard can show trend arrows.
  // ===========================================================================
  app.get('/:orgId/usage/by-outcome-type', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const start = periodStart('monthly');

    const rows = await db
      .select()
      .from(llmUsageRollups)
      .where(and(
        eq(llmUsageRollups.orgId, orgId),
        eq(llmUsageRollups.scope, 'outcome_type'),
        eq(llmUsageRollups.periodType, 'monthly'),
        eq(llmUsageRollups.periodStart, start),
      ))
      .orderBy(desc(llmUsageRollups.totalCostUsd));

    return reply.send({
      items: rows.map((r) => ({
        outcomeTypeId: r.scopeRefId,
        totalCostUsd: Number(r.totalCostUsd),
        totalTokens: Number(r.totalTokens),
        callCount: r.callCount,
      })),
    });
  });

  // ===========================================================================
  // GET /:orgId/usage/forecast
  //
  // Linear projection: take spend so far this month, divide by elapsed days,
  // multiply by total days in month. Naive but informative for an alerting UI.
  // ===========================================================================
  app.get('/:orgId/usage/forecast', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const start = periodStart('monthly');
    const now = new Date();
    const elapsedMs = now.getTime() - start.getTime();
    const elapsedDays = Math.max(1, elapsedMs / (24 * 60 * 60 * 1000));

    // Total days in this month
    const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const totalDays = (nextMonth.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);

    const [orgRollup] = await db
      .select()
      .from(llmUsageRollups)
      .where(and(
        eq(llmUsageRollups.orgId, orgId),
        eq(llmUsageRollups.scope, 'org'),
        isNull(llmUsageRollups.scopeRefId),
        eq(llmUsageRollups.periodType, 'monthly'),
        eq(llmUsageRollups.periodStart, start),
      ))
      .limit(1);

    const usedUsd = orgRollup ? Number(orgRollup.totalCostUsd) : 0;
    const projectedUsd = (usedUsd / elapsedDays) * totalDays;

    return reply.send({
      periodStart: start.toISOString(),
      now: now.toISOString(),
      usedUsd,
      projectedMonthEndUsd: projectedUsd,
      elapsedDays,
      totalDays,
    });
  });
};

export default routes;
