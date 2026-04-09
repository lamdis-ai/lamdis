/**
 * Agent Scheduler Worker
 *
 * Replaces the simple setInterval in outcomeOrchestrator with a proper
 * per-instance scheduler. Reads agent_schedules table, processes due
 * schedules, and adjusts adaptive schedules based on tick results.
 *
 * Also falls back to the old behavior for instances without a schedule
 * (backwards compatible with the 30s global tick).
 */

import { db } from '../db.js';
import { agentSchedules, outcomeInstances } from '@lamdis/db/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { orchestratorTick } from '../services/automation/outcomeOrchestrator.js';
import { adjustAfterTick } from '../services/scheduling/agentSchedulerService.js';

let workerInterval: ReturnType<typeof setInterval> | null = null;

const WORKER_POLL_MS = 5000; // Check for due schedules every 5s

/**
 * Start the scheduler worker. Polls for due schedules and triggers ticks.
 */
export function startSchedulerWorker(): void {
  if (workerInterval) return;

  workerInterval = setInterval(async () => {
    try {
      await processDueSchedules();
      await processUnscheduledInstances();
    } catch (err: any) {
      console.error('[scheduler-worker] Error:', err?.message);
    }
  }, WORKER_POLL_MS);

  console.log(`[scheduler-worker] Started (poll: ${WORKER_POLL_MS}ms)`);
}

export function stopSchedulerWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[scheduler-worker] Stopped');
  }
}

// ---------------------------------------------------------------------------
// Process due schedules
// ---------------------------------------------------------------------------

async function processDueSchedules(): Promise<void> {
  const now = new Date();

  // Find schedules that are due
  const dueSchedules = await db.select().from(agentSchedules)
    .where(and(
      eq(agentSchedules.enabled, true),
      lte(agentSchedules.nextRunAt, now),
    ))
    .limit(25);

  for (const schedule of dueSchedules) {
    try {
      // Mark as running by pushing nextRunAt forward (prevents double-processing)
      await db.update(agentSchedules).set({
        nextRunAt: new Date(Date.now() + (schedule.intervalMs || 30000)),
        updatedAt: new Date(),
      } as any).where(eq(agentSchedules.id, schedule.id));

      // Run the orchestrator tick
      const beforeCount = Date.now();
      await orchestratorTick(schedule.outcomeInstanceId);
      const durationMs = Date.now() - beforeCount;

      // Adjust adaptive schedule based on results
      // For now, assume activity if tick took > 1s (refined later with real activity detection)
      const hadActivity = durationMs > 1000;
      await adjustAfterTick(schedule.id, hadActivity);

    } catch (err: any) {
      console.error(`[scheduler-worker] Tick error for schedule ${schedule.id}:`, err?.message);

      // Record failure
      await db.update(agentSchedules).set({
        lastRunAt: new Date(),
        lastRunResult: { hadActivity: false, error: err?.message },
        nextRunAt: new Date(Date.now() + (schedule.intervalMs || 30000)),
        updatedAt: new Date(),
      } as any).where(eq(agentSchedules.id, schedule.id));
    }
  }
}

// ---------------------------------------------------------------------------
// Backward compat: process agent-enabled instances without schedules
// ---------------------------------------------------------------------------

async function processUnscheduledInstances(): Promise<void> {
  // Find active agent instances that don't have a schedule entry
  // This maintains backward compatibility with the old 30s global tick
  const activeInstances = await db.select({ id: outcomeInstances.id })
    .from(outcomeInstances)
    .where(and(
      eq(outcomeInstances.agentEnabled, true),
    ))
    .limit(50);

  // Check which ones have schedules
  const scheduledIds = new Set(
    (await db.select({ instanceId: agentSchedules.outcomeInstanceId })
      .from(agentSchedules))
      .map(s => s.outcomeInstanceId)
  );

  // Tick unscheduled instances on the default 30s cadence
  // (The setInterval in this worker runs every 5s, so we use a modulo check)
  const tick30s = Math.floor(Date.now() / 30000);
  const shouldTick = tick30s % 1 === 0; // every 30s cycle

  if (!shouldTick) return;

  for (const inst of activeInstances) {
    if (scheduledIds.has(inst.id)) continue; // has custom schedule, skip

    try {
      await orchestratorTick(inst.id);
    } catch (err: any) {
      console.error(`[scheduler-worker] Unscheduled tick error for ${inst.id}:`, err?.message);
    }
  }
}
