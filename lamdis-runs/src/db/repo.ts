// PostgreSQL repository for lamdis-runs

import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '@lamdis/db/connection';
import {
  environments,
  organizations,
  personas,
  actions,
  actionBindings,
  usage,
  workflows,
  workflowSuites,
  workflowInstances,
  policyChecks,
  evidenceEvents,
  runs,
  testSuites,
  tests,
  testRuns,
} from '@lamdis/db/schema';

function db() {
  return getDb();
}

export const repo = {
  // ─── Environments ─────────────────────────────────────────────────

  async getEnvironment(orgId: string, envId: string) {
    const rows = await db().select().from(environments)
      .where(and(eq(environments.id, envId), eq(environments.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async getEnvironmentById(envId: string) {
    const rows = await db().select().from(environments).where(eq(environments.id, envId)).limit(1);
    return rows[0] ?? null;
  },

  async getDefaultEnvironment(orgId: string) {
    const rows = await db().select().from(environments)
      .where(and(eq(environments.orgId, orgId), eq(environments.orgWide, true)))
      .limit(1);
    return rows[0] ?? null;
  },

  // ─── Organizations ────────────────────────────────────────────────

  async getOrganizationById(id: string) {
    const rows = await db().select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return rows[0] ?? null;
  },

  // ─── Personas ─────────────────────────────────────────────────────

  async getPersona(orgId: string, personaId: string) {
    const rows = await db().select().from(personas)
      .where(and(eq(personas.id, personaId), eq(personas.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  },

  // ─── Actions ──────────────────────────────────────────────────────

  async getAction(orgId: string, actionKey: string) {
    const rows = await db().select().from(actions)
      .where(and(eq(actions.orgId, orgId), eq(actions.actionId, actionKey)))
      .limit(1);
    return rows[0] ?? null;
  },

  // ─── Action Bindings ──────────────────────────────────────────────

  async getActionBinding(orgId: string, actionId: string, environmentId: string) {
    const rows = await db().select().from(actionBindings)
      .where(and(
        eq(actionBindings.orgId, orgId),
        eq(actionBindings.actionId, actionId),
        eq(actionBindings.environmentId, environmentId),
        eq(actionBindings.enabled, true),
      ))
      .limit(1);
    return rows[0] ?? null;
  },

  async listBindingsForAction(orgId: string, actionId: string) {
    return db().select().from(actionBindings)
      .where(and(eq(actionBindings.orgId, orgId), eq(actionBindings.actionId, actionId)));
  },

  async listBindingsForEnvironment(orgId: string, environmentId: string) {
    return db().select().from(actionBindings)
      .where(and(eq(actionBindings.orgId, orgId), eq(actionBindings.environmentId, environmentId)));
  },

  // ─── Usage ────────────────────────────────────────────────────────

  async createOrUpdateUsage(runId: string, payload: Record<string, unknown>) {
    await db().insert(usage)
      .values({ runId, ...payload } as any)
      .onConflictDoUpdate({ target: usage.runId, set: payload as any });
  },

  async createUsage(doc: Record<string, any>) {
    return db().insert(usage).values(doc as any).returning();
  },

  // ─── Workflows ────────────────────────────────────────────────────

  async getWorkflowById(id: string) {
    const rows = await db().select().from(workflows).where(eq(workflows.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getWorkflowsByIds(ids: string[]) {
    if (!ids.length) return [];
    return db().select().from(workflows).where(inArray(workflows.id, ids));
  },

  async getWorkflowsBySuiteId(suiteId: string) {
    return db().select().from(workflows).where(eq(workflows.suiteId, suiteId));
  },

  async getWorkflowSuiteById(id: string) {
    const rows = await db().select().from(workflowSuites).where(eq(workflowSuites.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getPolicyChecks(workflowId: string) {
    return db().select().from(policyChecks)
      .where(and(eq(policyChecks.workflowId, workflowId), eq(policyChecks.enabled, true)));
  },

  async createRun(doc: Record<string, any>) {
    const rows = await db().insert(runs).values(doc as any).returning();
    return rows[0];
  },

  async updateRun(runId: string, set: Record<string, any>) {
    return db().update(runs).set({ ...set, updatedAt: new Date() } as any).where(eq(runs.id, runId));
  },

  async getRunById(runId: string) {
    const rows = await db().select().from(runs).where(eq(runs.id, runId)).limit(1);
    return rows[0] ?? null;
  },

  async createWorkflowInstance(doc: Record<string, any>) {
    const rows = await db().insert(workflowInstances).values(doc as any).returning();
    return rows[0];
  },

  async updateWorkflowInstance(instanceId: string, set: Record<string, any>) {
    return db().update(workflowInstances).set({ ...set, updatedAt: new Date() } as any)
      .where(eq(workflowInstances.id, instanceId));
  },

  async insertEvidenceEvent(doc: Record<string, any>) {
    return db().insert(evidenceEvents).values(doc as any).onConflictDoNothing({
      target: evidenceEvents.idempotencyKey,
    });
  },

  // ─── Test Suites ──────────────────────────────────────────────────

  async getSuiteById(suiteId: string) {
    const rows = await db().select().from(testSuites).where(eq(testSuites.id, suiteId)).limit(1);
    return rows[0] ?? null;
  },

  // ─── Tests ────────────────────────────────────────────────────────

  async getTests(opts: { orgId: string; suiteId: string; ids?: string[] }) {
    const conditions = [
      eq(tests.orgId, opts.orgId),
      eq(tests.suiteId, opts.suiteId),
    ];
    if (opts.ids?.length) {
      conditions.push(inArray(tests.id, opts.ids));
    }
    return db().select().from(tests).where(and(...conditions));
  },

  async getTestById(testId: string) {
    const rows = await db().select().from(tests).where(eq(tests.id, testId)).limit(1);
    return rows[0] ?? null;
  },

  // ─── Test Runs ────────────────────────────────────────────────────

  async createTestRun(doc: Record<string, any>) {
    const rows = await db().insert(testRuns).values(doc as any).returning();
    return rows[0];
  },

  async updateTestRun(runId: string, set: Record<string, any>) {
    return db().update(testRuns).set({ ...set, updatedAt: new Date() } as any).where(eq(testRuns.id, runId));
  },

  async getTestRunById(runId: string) {
    const rows = await db().select().from(testRuns).where(eq(testRuns.id, runId)).limit(1);
    return rows[0] ?? null;
  },
};
