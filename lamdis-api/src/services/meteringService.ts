/**
 * Metering Service
 *
 * Provides usage counting for entitlement checks.
 * Two primary meters for V4 pricing:
 *   1. Workflow Executions — completed workflow_instances
 *   2. Analysis Jobs — policy imports, code analysis, etc.
 *
 * Also retains legacy run counting for V2/V3 plans.
 */
import { db } from '../db.js';
import { runs, members, usage, workflowInstances, analysisJobs } from '@lamdis/db/schema';
import { eq, and, gte, count, inArray } from 'drizzle-orm';

function startOfMonth(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfYear(): Date {
  const d = new Date();
  d.setUTCMonth(0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// V4 Meters: Workflow Executions
// ---------------------------------------------------------------------------

/**
 * Count completed workflow instances for an org this month.
 * A "workflow execution" = one workflow_instance with a terminal status.
 */
export async function getWorkflowExecutionCount(orgId: string): Promise<number> {
  const since = startOfMonth();
  const [result] = await db
    .select({ count: count() })
    .from(workflowInstances)
    .where(and(
      eq(workflowInstances.orgId, orgId),
      gte(workflowInstances.createdAt, since),
      inArray(workflowInstances.status, ['passed', 'failed', 'partial', 'error']),
    ));
  return result?.count ?? 0;
}

/**
 * Count completed workflow instances for an org year-to-date.
 */
export async function getWorkflowExecutionCountYTD(orgId: string): Promise<number> {
  const since = startOfYear();
  const [result] = await db
    .select({ count: count() })
    .from(workflowInstances)
    .where(and(
      eq(workflowInstances.orgId, orgId),
      gte(workflowInstances.createdAt, since),
      inArray(workflowInstances.status, ['passed', 'failed', 'partial', 'error']),
    ));
  return result?.count ?? 0;
}

// ---------------------------------------------------------------------------
// V4 Meters: Analysis Jobs
// ---------------------------------------------------------------------------

/**
 * Count analysis jobs for an org this month.
 */
export async function getAnalysisJobCount(orgId: string): Promise<number> {
  const since = startOfMonth();
  const [result] = await db
    .select({ count: count() })
    .from(analysisJobs)
    .where(and(
      eq(analysisJobs.orgId, orgId),
      gte(analysisJobs.createdAt, since),
    ));
  return result?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Unified usage for limit checks (supports V2/V3/V4)
// ---------------------------------------------------------------------------

export async function getUsageForLimit(
  limitType: 'runs' | 'users' | 'conversations' | 'workflowExecutions' | 'analysisJobs',
  orgId?: string,
): Promise<number> {
  const since = startOfMonth();

  switch (limitType) {
    case 'workflowExecutions':
      return orgId ? getWorkflowExecutionCount(orgId) : 0;
    case 'analysisJobs':
      return orgId ? getAnalysisJobCount(orgId) : 0;
    case 'runs': {
      const [result] = await db.select({ count: count() }).from(runs).where(gte(runs.createdAt, since));
      return result?.count ?? 0;
    }
    case 'users': {
      const [result] = await db.select({ count: count() }).from(members);
      return result?.count ?? 0;
    }
    case 'conversations': {
      const [result] = await db.select({ count: count() }).from(runs).where(gte(runs.createdAt, since));
      return result?.count ?? 0;
    }
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Legacy: unified run counting (V2/V3)
// ---------------------------------------------------------------------------

export async function getUnifiedRunCount(): Promise<number> {
  const since = startOfMonth();
  const [[runsResult], [usageResult]] = await Promise.all([
    db.select({ count: count() }).from(runs).where(gte(runs.createdAt, since)),
    db.select({ count: count() }).from(usage).where(gte(usage.createdAt, since)),
  ]);
  return (runsResult?.count ?? 0) + (usageResult?.count ?? 0);
}

export async function getUnifiedRunCountYTD(): Promise<number> {
  const since = startOfYear();
  const [[runsResult], [usageResult]] = await Promise.all([
    db.select({ count: count() }).from(runs).where(gte(runs.createdAt, since)),
    db.select({ count: count() }).from(usage).where(gte(usage.createdAt, since)),
  ]);
  return (runsResult?.count ?? 0) + (usageResult?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Snapshot (V4-aware)
// ---------------------------------------------------------------------------

export async function getMeteringSnapshot(orgId?: string): Promise<{
  runsThisMonth: number;
  workflowExecutionsThisMonth: number;
  analysisJobsThisMonth: number;
  activeUsers: number;
}> {
  const since = startOfMonth();

  const [[runsResult], [usersResult]] = await Promise.all([
    db.select({ count: count() }).from(runs).where(gte(runs.createdAt, since)),
    db.select({ count: count() }).from(members),
  ]);

  const executions = orgId ? await getWorkflowExecutionCount(orgId) : 0;
  const analysis = orgId ? await getAnalysisJobCount(orgId) : 0;

  return {
    runsThisMonth: runsResult?.count ?? 0,
    workflowExecutionsThisMonth: executions,
    analysisJobsThisMonth: analysis,
    activeUsers: usersResult?.count ?? 0,
  };
}
