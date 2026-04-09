import type { FastifyPluginAsync } from 'fastify';
import { eq, and, gte, inArray, desc, sql, or, isNotNull, count } from 'drizzle-orm';
import { db } from '../db.js';
import { manifestAccessLogs } from '@lamdis/db/schema';
import { hostedActionInvocations } from '@lamdis/db/schema';
import { invocationLogs } from '@lamdis/db/schema';
import { runs } from '@lamdis/db/schema';
import { members } from '@lamdis/db/schema';
import { outcomeInstances, outcomeTypes, actionExecutions, decisionDossiers, connectionHealth } from '@lamdis/db/schema';

function parseRange(range?: string) {
  if (!range) return 7;
  if (/^\d+$/.test(range)) return Math.min(parseInt(range,10), 30);
  const m = range.match(/^(\d+)(d)$/); if (m) return Math.min(parseInt(m[1],10), 30);
  return 7;
}

// Simple UUID-ish validation (replaces mongoose.isValidObjectId)
function isValidId(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') return false;
  // Accept UUID format
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const plugin: FastifyPluginAsync = async (app) => {
  // Manifest retrieval analytics
  async function assertMembership(req: any, orgId: string) {
    const sub = req.user?.sub;
    if (!sub) throw new Error('unauthorized');
    const [m] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userSub, sub))).limit(1);
    if (!m) throw new Error('forbidden');
  }

  app.get('/analytics/manifest', async (req, reply) => {
    const { orgId, range } = req.query as any;
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    try { await assertMembership(req, orgId); } catch (e: any) { return reply.code(e.message==='forbidden'?403:401).send({ error: e.message }); }
    const days = parseRange(range);
    const since = new Date(Date.now() - days*24*3600*1000);
    const logs = await db.select().from(manifestAccessLogs).where(and(eq(manifestAccessLogs.orgId, orgId), gte(manifestAccessLogs.ts, since)));
    const daily: Record<string,{ total:number; byType:Record<string,number> }> = {};
    for (const l of logs) {
      const day = new Date(l.ts).toISOString().slice(0,10);
      if (!daily[day]) daily[day] = { total:0, byType:{} };
      daily[day].total++;
      const pt = l.pathType as string | undefined;
      if (pt) daily[day].byType[pt] = (daily[day].byType[pt]||0)+1;
    }
    const series = Object.entries(daily).sort((a,b)=> a[0]<b[0]? -1:1).map(([date,v])=> ({ date, total: v.total, ...v.byType }));
    return { days, from: since.toISOString(), series, count: logs.length };
  });

  // Hosted action invocation analytics summary
  app.get('/analytics/actions', async (req, reply) => {
    const { orgId, range, includeSources } = req.query as any;
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    try { await assertMembership(req, orgId); } catch (e: any) { return reply.code(e.message==='forbidden'?403:401).send({ error: e.message }); }
    const days = parseRange(range);
    const since = new Date(Date.now() - days*24*3600*1000);
    const [hosted, gateway] = await Promise.all([
      db.select().from(hostedActionInvocations).where(and(eq(hostedActionInvocations.orgId, orgId), gte(hostedActionInvocations.startedAt, since))),
      db.select().from(invocationLogs).where(and(eq(invocationLogs.orgId, orgId), gte(invocationLogs.createdAt, since), inArray(invocationLogs.source, ['gateway-a2a','gateway-mcp']))),
    ]);
    const logs = hosted;
    const byAction: Record<string,{ count:number; totalMs:number; durations:number[] }> = {};
    const daily: Record<string,{ count:number; totalMs:number; successes:number }> = {};
    for (const l of logs) {
      const a = l.actionKey;
      if (!byAction[a]) byAction[a] = { count:0, totalMs:0, durations:[] };
      byAction[a].count++; byAction[a].totalMs += (l.durationMs||0); byAction[a].durations.push(l.durationMs||0);
      const day = new Date(l.startedAt!).toISOString().slice(0,10);
      if (!daily[day]) daily[day] = { count:0, totalMs:0, successes:0 };
      daily[day].count++; daily[day].totalMs += (l.durationMs||0);
      if (l.success) daily[day].successes++;
    }
    function pct(sorted:number[], p:number){ if(!sorted.length) return 0; const idx = Math.floor((p/100)* (sorted.length-1)); return sorted[idx]; }
    // Seed by hosted
    const topByKey: Record<string,{ count:number; totalMs:number; durations:number[] }> = JSON.parse(JSON.stringify(byAction));
    // Fold in gateway by actionKey when provided
    for (const g of gateway as any[]) {
      const key = g.actionKey as string | undefined;
      if (!key) continue;
      if (!topByKey[key]) topByKey[key] = { count:0, totalMs:0, durations:[] };
      topByKey[key].count++;
      topByKey[key].totalMs += g.durationMs || 0;
      topByKey[key].durations.push(g.durationMs || 0);
    }
    const top = Object.entries(topByKey).map(([k,v])=>{ const d=[...v.durations].sort((a,b)=>a-b); return { actionKey:k, count:v.count, avgMs: v.count? v.totalMs/v.count:0, p95: pct(d,95) }; }).sort((a,b)=> b.count - a.count).slice(0,25);
  const series = Object.entries(daily).sort((a,b)=> a[0]<b[0]? -1:1).map(([date,v])=> ({ date, count:v.count, successes: v.successes, failures: Math.max(0, v.count - v.successes), avgMs: v.count? v.totalMs/v.count:0 }));
    // Extend with gateway totals per day
    const dailyGateway: Record<string,{ count:number; totalMs:number; successes:number }> = {};
    for (const g of gateway as any[]) {
      const day = new Date(g.createdAt).toISOString().slice(0,10);
      if (!dailyGateway[day]) dailyGateway[day] = { count:0, totalMs:0, successes:0 };
      dailyGateway[day].count++;
      dailyGateway[day].totalMs += g.durationMs || 0;
      if ((g as any).status === 'success') dailyGateway[day].successes++;
    }
  // Merge hosted and gateway series by date
    const seriesMerged: Record<string, any> = Object.fromEntries(series.map(s=> [s.date, { ...s }]));
    for (const [date, v] of Object.entries(dailyGateway)) {
      if (!seriesMerged[date]) seriesMerged[date] = { date, count:0, successes:0, failures:0, avgMs:0 } as any;
      const prev = seriesMerged[date];
      const totalCount = (prev.count||0) + v.count;
      const totalSuccesses = (prev.successes||0) + (v.successes||0);
      const totalMs = (prev.avgMs||0) * (prev.count||0) + v.totalMs;
      seriesMerged[date].count = totalCount;
      seriesMerged[date].successes = totalSuccesses;
      seriesMerged[date].failures = Math.max(0, totalCount - totalSuccesses);
      seriesMerged[date].avgMs = totalCount ? totalMs/totalCount : 0;
    }
    const seriesOut = Object.values(seriesMerged).sort((a:any,b:any)=> a.date<b.date? -1:1);
    if (String(includeSources||'') === '1') {
      // Build per-source series as well
      const hostedDaily: Record<string,{ count:number; totalMs:number; successes:number }> = {};
      for (const h of hosted as any[]) {
        const day = new Date((h as any).startedAt).toISOString().slice(0,10);
        if (!hostedDaily[day]) hostedDaily[day] = { count:0, totalMs:0, successes:0 };
        hostedDaily[day].count++; hostedDaily[day].totalMs += (h as any).durationMs || 0;
        if ((h as any).success) hostedDaily[day].successes++;
      }
      const hostedSeries = Object.entries(hostedDaily).map(([date,v])=> ({ date, count:v.count, successes: v.successes, failures: Math.max(0, v.count - v.successes), avgMs: v.count? v.totalMs/v.count:0 }));
      const gatewaySeries = Object.entries(dailyGateway).map(([date,v])=> ({ date, count:v.count, successes: v.successes, failures: Math.max(0, v.count - v.successes), avgMs: v.count? v.totalMs/v.count:0 }));
      return { days, from: since.toISOString(), top, series: seriesOut, count: hosted.length + gateway.length, sources: { hosted: hostedSeries, gateway: gatewaySeries } };
    }
    return { days, from: since.toISOString(), top, series: seriesOut, count: hosted.length + gateway.length };
  });

  app.get('/analytics/actions/:actionKey/detail', async (req, reply) => {
    const { orgId } = req.query as any; const { actionKey } = req.params as any;
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    try { await assertMembership(req, orgId); } catch (e: any) { return reply.code(e.message==='forbidden'?403:401).send({ error: e.message }); }
    const docs = await db.select().from(hostedActionInvocations).where(and(eq(hostedActionInvocations.orgId, orgId), eq(hostedActionInvocations.actionKey, actionKey))).orderBy(desc(hostedActionInvocations.startedAt)).limit(50);
    return { invocations: docs.map(d=> ({ startedAt: d.startedAt, durationMs: d.durationMs, statusCode: d.statusCode, success: d.success, prompt: d.prompt?.slice(0,500), errorMessage: d.errorMessage })) };
  });

  // Aggregated per-action success/failure counts and percentages (last N days)
  app.get('/analytics/actions/summary', async (req, reply) => {
    const { orgId, range } = req.query as any;
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    try { await assertMembership(req, orgId); } catch (e: any) { return reply.code(e.message==='forbidden'?403:401).send({ error: e.message }); }
    const days = parseRange(range);
    const since = new Date(Date.now() - days*24*3600*1000);
    // Hosted action summary via Drizzle SQL
    const results = await db.select({
      actionKey: hostedActionInvocations.actionKey,
      total: sql<number>`count(*)::int`,
      successes: sql<number>`sum(case when ${hostedActionInvocations.success} then 1 else 0 end)::int`,
      failures: sql<number>`sum(case when ${hostedActionInvocations.success} then 0 else 1 end)::int`,
    }).from(hostedActionInvocations)
      .where(and(eq(hostedActionInvocations.orgId, orgId), gte(hostedActionInvocations.startedAt, since)))
      .groupBy(hostedActionInvocations.actionKey)
      .orderBy(sql`count(*) desc`)
      .limit(200);

    // Gateway summary
    const gateAgg = await db.select({
      actionKey: invocationLogs.actionKey,
      total: sql<number>`count(*)::int`,
      successes: sql<number>`sum(case when ${invocationLogs.status} = 'success' then 1 else 0 end)::int`,
      failures: sql<number>`sum(case when ${invocationLogs.status} = 'failure' then 1 else 0 end)::int`,
    }).from(invocationLogs)
      .where(and(eq(invocationLogs.orgId, orgId), gte(invocationLogs.createdAt, since), inArray(invocationLogs.source, ['gateway-a2a','gateway-mcp'])))
      .groupBy(invocationLogs.actionKey)
      .orderBy(sql`count(*) desc`)
      .limit(200);

    // Merge by actionKey
    const byKey: Record<string, any> = {};
    for (const r of results) {
      const k = r.actionKey || '_';
      byKey[k] = { actionKey: k, total: r.total, successes: r.successes, failures: r.failures, successRate: r.total ? (r.successes / r.total) * 100 : 0 };
    }
    for (const g of gateAgg) {
      const k = g.actionKey || '_';
      if (!byKey[k]) {
        byKey[k] = { actionKey: k, total: g.total, successes: g.successes, failures: g.failures, successRate: g.total ? (g.successes / g.total) * 100 : 0 };
      } else {
        const a = byKey[k];
        const total = (a.total||0) + (g.total||0);
        const successes = (a.successes||0) + (g.successes||0);
        const failures = (a.failures||0) + (g.failures||0);
        byKey[k] = { actionKey: k, total, successes, failures, successRate: total? (successes/total)*100: 0 };
      }
    }
    return { days, from: since.toISOString(), actions: Object.values(byKey).sort((a:any,b:any)=> b.total - a.total) };
  });

  // Testing analytics: daily run totals and failures
  app.get('/analytics/testing', async (req, reply) => {
    const { orgId, range } = req.query as any;
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    try { await assertMembership(req, orgId); } catch (e: any) { return reply.code(e.message==='forbidden'?403:401).send({ error: e.message }); }
    const days = parseRange(range);
    const since = new Date(Date.now() - days*24*3600*1000);
    const runRows = await db.select().from(runs).where(and(eq(runs.orgId, orgId), gte(runs.createdAt, since)));
    const daily: Record<string,{ count:number; failures:number; passed:number; partial:number }> = {};
    for (const r of runRows) {
      const d = new Date(r.createdAt as any).toISOString().slice(0,10);
      if (!daily[d]) daily[d] = { count:0, failures:0, passed:0, partial:0 };
      daily[d].count++;
      const s = String((r as any).status||'').toLowerCase();
      if (s === 'failed') daily[d].failures++; else if (s==='passed') daily[d].passed++; else if (s==='partial') daily[d].partial++;
    }
    const series = Object.entries(daily).sort((a,b)=> a[0]<b[0]? -1:1).map(([date,v])=> ({ date, count: v.count, failures: v.failures, passed: v.passed, partial: v.partial }));
    return { days, from: since.toISOString(), series, count: runRows.length };
  });

  // Dev helper to simulate hosted invocation until real instrumentation site is added
  app.post('/analytics/dev/simulate', async (req, reply) => {
    if (process.env.NODE_ENV === 'production') return reply.code(403).send({ error: 'disabled' });
    const { orgId, actionKey='example.action', providerKey='example', durationMs= Math.floor(Math.random()*400)+50, statusCode=200, success=true } = (req.body as any)||{};
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    await db.insert(hostedActionInvocations).values({ orgId, actionKey, providerKey, mode:'lamdis', startedAt:new Date(), durationMs, statusCode, success, prompt: 'Sample prompt for '+actionKey, requestSize:0, responseSize:0 });
    return { ok: true };
  });

  // Debug endpoint: last few raw logs (manifest + actions)
  app.get('/analytics/debug/:orgId', async (req, reply) => {
    const { orgId } = req.params as any;
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    try { await assertMembership(req, orgId); } catch (e: any) { return reply.code(e.message==='forbidden'?403:401).send({ error: e.message }); }
    const [manifest, actions] = await Promise.all([
      db.select().from(manifestAccessLogs).where(eq(manifestAccessLogs.orgId, orgId)).orderBy(desc(manifestAccessLogs.ts)).limit(10),
      db.select().from(hostedActionInvocations).where(eq(hostedActionInvocations.orgId, orgId)).orderBy(desc(hostedActionInvocations.startedAt)).limit(10)
    ]);
    return { manifest, actions };
  });

  // =========================================================================
  // HOME DASHBOARD SUMMARY — aggregated data for the org home page
  // =========================================================================

  app.get('/orgs/:orgId/home/summary', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    if (!orgId || !isValidId(orgId)) return reply.code(400).send({ error: 'orgId required' });
    try { await assertMembership(req, orgId); } catch (e: any) { return reply.code(e.message === 'forbidden' ? 403 : 401).send({ error: e.message }); }

    // Run all queries in parallel
    const [
      activeOutcomeRows,
      activeOutcomeCount,
      automationStatusRows,
      attentionRows,
      attentionCount,
      proofFeedRows,
      connectionRows,
    ] = await Promise.all([
      // Active outcomes: open or gathering instances with outcome type name
      db.select({
        id: outcomeInstances.id,
        status: outcomeInstances.status,
        proofStatus: outcomeInstances.proofStatus,
        confidenceScore: outcomeInstances.confidenceScore,
        eventCount: outcomeInstances.eventCount,
        automationMode: outcomeInstances.automationMode,
        createdAt: outcomeInstances.createdAt,
        updatedAt: outcomeInstances.updatedAt,
        outcomeTypeName: outcomeTypes.name,
      })
        .from(outcomeInstances)
        .leftJoin(outcomeTypes, eq(outcomeInstances.outcomeTypeId, outcomeTypes.id))
        .where(and(
          eq(outcomeInstances.orgId, orgId),
          inArray(outcomeInstances.status, ['open', 'gathering']),
        ))
        .orderBy(desc(outcomeInstances.updatedAt))
        .limit(10),

      // Count of active outcomes
      db.select({ count: count() })
        .from(outcomeInstances)
        .where(and(
          eq(outcomeInstances.orgId, orgId),
          inArray(outcomeInstances.status, ['open', 'gathering']),
        )),

      // Automation status counts by action execution status
      db.select({
        status: actionExecutions.status,
        count: count(),
      })
        .from(actionExecutions)
        .where(eq(actionExecutions.orgId, orgId))
        .groupBy(actionExecutions.status),

      // Attention required: instances where automationMode='waiting' OR escalationReason IS NOT NULL OR stalledSince IS NOT NULL
      db.select({
        id: outcomeInstances.id,
        status: outcomeInstances.status,
        proofStatus: outcomeInstances.proofStatus,
        automationMode: outcomeInstances.automationMode,
        escalationReason: outcomeInstances.escalationReason,
        stalledSince: outcomeInstances.stalledSince,
        confidenceScore: outcomeInstances.confidenceScore,
        createdAt: outcomeInstances.createdAt,
        updatedAt: outcomeInstances.updatedAt,
        outcomeTypeName: outcomeTypes.name,
      })
        .from(outcomeInstances)
        .leftJoin(outcomeTypes, eq(outcomeInstances.outcomeTypeId, outcomeTypes.id))
        .where(and(
          eq(outcomeInstances.orgId, orgId),
          or(
            eq(outcomeInstances.automationMode, 'waiting'),
            isNotNull(outcomeInstances.escalationReason),
            isNotNull(outcomeInstances.stalledSince),
          ),
        ))
        .orderBy(desc(outcomeInstances.updatedAt))
        .limit(50),

      // Count of attention-required instances
      db.select({ count: count() })
        .from(outcomeInstances)
        .where(and(
          eq(outcomeInstances.orgId, orgId),
          or(
            eq(outcomeInstances.automationMode, 'waiting'),
            isNotNull(outcomeInstances.escalationReason),
            isNotNull(outcomeInstances.stalledSince),
          ),
        )),

      // Proof feed: recent 20 decision dossiers
      db.select()
        .from(decisionDossiers)
        .where(eq(decisionDossiers.orgId, orgId))
        .orderBy(desc(decisionDossiers.createdAt))
        .limit(20),

      // Connection health rows
      db.select()
        .from(connectionHealth)
        .where(eq(connectionHealth.orgId, orgId))
        .orderBy(desc(connectionHealth.updatedAt)),
    ]);

    // Build automation status summary
    const automationMap: Record<string, number> = { proposed: 0, executing: 0, completed: 0, blocked: 0, failed: 0 };
    for (const row of automationStatusRows) {
      const key = (row.status || 'proposed').toLowerCase();
      if (key in automationMap) {
        automationMap[key] = Number(row.count) || 0;
      }
    }

    // Build org health summary
    const healthyCount = connectionRows.filter(c => c.authStatus === 'healthy').length;

    return reply.send({
      activeOutcomes: {
        count: Number(activeOutcomeCount[0]?.count) || 0,
        items: activeOutcomeRows,
      },
      automationStatus: automationMap,
      attentionRequired: {
        count: Number(attentionCount[0]?.count) || 0,
        items: attentionRows,
      },
      proofFeed: proofFeedRows,
      orgHealth: {
        connections: connectionRows,
        totalConnections: connectionRows.length,
        healthyCount,
      },
    });
  });
};

export default plugin;
