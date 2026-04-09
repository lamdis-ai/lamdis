import { db } from '../db.js';
import { evaluationSchedules } from '@lamdis/db/schema';
import { outcomeInstances } from '@lamdis/db/schema';
import { eq, and, lte, sql } from 'drizzle-orm';
import { evaluateProof } from '../services/automation/proofEvaluator.js';
import { proposeActions } from '../services/automation/actionProposer.js';

let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 30_000; // Check for due schedules every 30 seconds

async function tick() {
  if (!running) return;

  try {
    // Find all schedules that are due (nextRunAt <= now and enabled)
    const now = new Date();
    const dueSchedules = await db.select().from(evaluationSchedules)
      .where(and(
        eq(evaluationSchedules.enabled, true),
        lte(evaluationSchedules.nextRunAt, now),
      ));

    for (const schedule of dueSchedules) {
      if (!running) break;

      const startTime = Date.now();
      let instancesEvaluated = 0;
      let proofsUpdated = 0;
      let actionsProposed = 0;
      let errors = 0;

      try {
        // Find all active instances for this objective type
        const activeInstances = await db.select({ id: outcomeInstances.id }).from(outcomeInstances)
          .where(and(
            eq(outcomeInstances.outcomeTypeId, schedule.objectiveTypeId),
            eq(outcomeInstances.orgId, schedule.orgId),
            sql`${outcomeInstances.status} IN ('open', 'active')`,
          ));

        for (const inst of activeInstances) {
          try {
            const proofResult = await evaluateProof(inst.id);
            instancesEvaluated++;
            if (proofResult) proofsUpdated++;

            const actionResult = await proposeActions(inst.id);
            if (actionResult) actionsProposed += (actionResult.proposed || 0) + (actionResult.autoExecuted || 0);
          } catch (err) {
            errors++;
            console.error(`[EvalScheduler] Error evaluating instance ${inst.id}:`, err);
          }
        }
      } catch (err) {
        errors++;
        console.error(`[EvalScheduler] Error processing schedule ${schedule.id}:`, err);
      }

      const durationMs = Date.now() - startTime;

      // Update schedule: set lastRunAt, compute nextRunAt, store result
      const nextRunAt = new Date(now.getTime() + schedule.intervalMinutes * 60_000);
      await db.update(evaluationSchedules)
        .set({
          lastRunAt: now,
          nextRunAt,
          lastRunResult: { instancesEvaluated, proofsUpdated, actionsProposed, errors, durationMs },
          updatedAt: now,
        })
        .where(eq(evaluationSchedules.id, schedule.id));

      console.log(`[EvalScheduler] Completed schedule ${schedule.id}: ${instancesEvaluated} instances, ${proofsUpdated} proofs, ${actionsProposed} actions, ${errors} errors (${durationMs}ms)`);
    }
  } catch (err) {
    console.error('[EvalScheduler] Tick error:', err);
  }
}

export function startEvaluationScheduler() {
  if (running) return;
  running = true;
  console.log('[EvalScheduler] Starting (poll every 30s)');
  intervalHandle = setInterval(tick, POLL_INTERVAL_MS);
  // Run immediately on start
  tick().catch(err => console.error('[EvalScheduler] Initial tick error:', err));
}

export function stopEvaluationScheduler() {
  running = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  console.log('[EvalScheduler] Stopped');
}
