/**
 * Backfill Outcome Playbooks
 *
 * One-shot migration script: for each existing outcomeType, create a default
 * v1 playbook (status='active', source='observed') derived from the type's
 * existing successCriteria, keyDecisions, automationBoundaries, and
 * connectedSystems[]. Sets defaultPlaybookId on the outcome type and pins
 * activePlaybookId on every in-flight outcomeInstance that has none.
 *
 * Run with: `tsx scripts/backfillPlaybooks.ts` (or compiled `.js` from dist).
 */

import { db } from '../src/db';
import {
  outcomeTypes,
  outcomePlaybooks,
  outcomeInstances,
  type PlaybookProcedureStep,
} from '@lamdis/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

async function main() {
  const types = await db.select().from(outcomeTypes);
  console.log(`[backfill] processing ${types.length} outcome types`);
  let created = 0;
  let skipped = 0;

  for (const ot of types) {
    if (ot.defaultPlaybookId) {
      skipped++;
      continue;
    }
    const procedureSteps: PlaybookProcedureStep[] = (ot.successCriteria ?? []).map((c, i) => ({
      id: `step-${i + 1}`,
      sequence: i + 1,
      title: c.description,
      successCriteria: [c.description],
    }));

    const [pb] = await db
      .insert(outcomePlaybooks)
      .values({
        orgId: ot.orgId,
        outcomeTypeId: ot.id,
        version: 1,
        status: 'active',
        name: `${ot.name} (default)`,
        summary: 'Auto-generated from existing outcome type configuration',
        source: 'observed',
        procedureSteps,
        guidelines: {},
        activatedAt: new Date(),
      })
      .returning();
    if (!pb) continue;

    await db
      .update(outcomeTypes)
      .set({ defaultPlaybookId: pb.id, updatedAt: new Date() })
      .where(eq(outcomeTypes.id, ot.id));

    // Pin in-flight instances of this type that have no active playbook.
    await db
      .update(outcomeInstances)
      .set({ activePlaybookId: pb.id, playbookVersion: 1, updatedAt: new Date() })
      .where(and(eq(outcomeInstances.outcomeTypeId, ot.id), isNull(outcomeInstances.activePlaybookId)));

    created++;
  }

  console.log(`[backfill] created=${created} skipped=${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] failed', err);
  process.exit(1);
});
