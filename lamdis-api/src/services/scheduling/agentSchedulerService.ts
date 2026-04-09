/**
 * Agent Scheduler Service
 *
 * Per-instance scheduling with adaptive frequency. The agent decides
 * how often it needs to check in — more frequent when active,
 * less when idle. Supports cron for monitoring-style objectives.
 */

import { db } from '../../db.js';
import { agentSchedules } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function setSchedule(orgId: string, instanceId: string, opts: {
  scheduleType?: string;
  intervalMs?: number;
  cronExpression?: string;
  adaptiveConfig?: {
    baseIntervalMs: number;
    minIntervalMs: number;
    maxIntervalMs: number;
  };
}) {
  // Upsert — one schedule per instance
  const [existing] = await db.select().from(agentSchedules)
    .where(and(eq(agentSchedules.orgId, orgId), eq(agentSchedules.outcomeInstanceId, instanceId)))
    .limit(1);

  const nextRunAt = new Date(Date.now() + (opts.intervalMs || 30000));

  if (existing) {
    const [updated] = await db.update(agentSchedules).set({
      scheduleType: opts.scheduleType || existing.scheduleType,
      intervalMs: opts.intervalMs ?? existing.intervalMs,
      cronExpression: opts.cronExpression ?? existing.cronExpression,
      adaptiveConfig: opts.adaptiveConfig ?? existing.adaptiveConfig,
      nextRunAt,
      updatedAt: new Date(),
    } as any).where(eq(agentSchedules.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(agentSchedules).values({
    orgId,
    outcomeInstanceId: instanceId,
    scheduleType: opts.scheduleType || 'polling',
    intervalMs: opts.intervalMs || 30000,
    cronExpression: opts.cronExpression,
    adaptiveConfig: opts.adaptiveConfig,
    enabled: true,
    nextRunAt,
  } as any).returning();

  return created;
}

export async function getSchedule(orgId: string, instanceId: string) {
  const [schedule] = await db.select().from(agentSchedules)
    .where(and(eq(agentSchedules.orgId, orgId), eq(agentSchedules.outcomeInstanceId, instanceId)))
    .limit(1);
  return schedule || null;
}

export async function removeSchedule(orgId: string, instanceId: string) {
  await db.delete(agentSchedules)
    .where(and(eq(agentSchedules.orgId, orgId), eq(agentSchedules.outcomeInstanceId, instanceId)));
}

export async function listSchedules(orgId: string) {
  return db.select().from(agentSchedules)
    .where(eq(agentSchedules.orgId, orgId));
}

// ---------------------------------------------------------------------------
// Adaptive frequency adjustment
// ---------------------------------------------------------------------------

/**
 * Adjust schedule frequency based on tick results.
 * Called after each orchestrator tick.
 */
export async function adjustAfterTick(scheduleId: string, hadActivity: boolean): Promise<void> {
  const [schedule] = await db.select().from(agentSchedules)
    .where(eq(agentSchedules.id, scheduleId)).limit(1);

  if (!schedule || schedule.scheduleType !== 'adaptive') return;

  const config = schedule.adaptiveConfig as any;
  if (!config) return;

  let newInterval = schedule.intervalMs || config.baseIntervalMs;
  const noOps = (schedule.consecutiveNoOps || 0);

  if (hadActivity) {
    // Decrease interval (check more often when active)
    newInterval = Math.max(config.minIntervalMs, Math.floor(newInterval * 0.7));
  } else {
    // Increase interval (check less often when idle)
    newInterval = Math.min(config.maxIntervalMs, Math.floor(newInterval * 1.3));
  }

  const history = (config.adjustmentHistory || []) as any[];
  if (newInterval !== schedule.intervalMs) {
    history.push({
      from: schedule.intervalMs,
      to: newInterval,
      reason: hadActivity ? 'activity detected' : `idle (${noOps + 1} consecutive no-ops)`,
      at: new Date().toISOString(),
    });
    // Keep last 20 adjustments
    while (history.length > 20) history.shift();
  }

  await db.update(agentSchedules).set({
    intervalMs: newInterval,
    consecutiveNoOps: hadActivity ? 0 : noOps + 1,
    lastRunAt: new Date(),
    nextRunAt: new Date(Date.now() + newInterval),
    lastRunResult: { hadActivity, durationMs: 0 },
    adaptiveConfig: { ...config, adjustmentHistory: history },
    updatedAt: new Date(),
  } as any).where(eq(agentSchedules.id, scheduleId));
}
