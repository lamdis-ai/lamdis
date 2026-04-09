/**
 * Playbook Activation Service
 *
 * Promotes a draft playbook to active. Archives any prior active version
 * for the same outcomeType so there is exactly one active playbook per
 * (org, outcomeType) at a time. Also wires the outcome type's
 * defaultPlaybookId so newly created instances pick the playbook up.
 */

import { db } from '../../db.js';
import { outcomePlaybooks, outcomeTypes } from '@lamdis/db/schema';
import { and, eq } from 'drizzle-orm';

export const playbookActivationService = {
  async activate(playbookId: string): Promise<void> {
    const [pb] = await db.select().from(outcomePlaybooks).where(eq(outcomePlaybooks.id, playbookId)).limit(1);
    if (!pb) throw new Error(`playbook not found: ${playbookId}`);
    if (pb.status === 'active') return;

    // Archive any prior active versions for this outcome type.
    await db
      .update(outcomePlaybooks)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(outcomePlaybooks.outcomeTypeId, pb.outcomeTypeId), eq(outcomePlaybooks.status, 'active')));

    // Activate this one.
    await db
      .update(outcomePlaybooks)
      .set({ status: 'active', activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(outcomePlaybooks.id, pb.id));

    // Point the outcome type at the new default.
    await db
      .update(outcomeTypes)
      .set({ defaultPlaybookId: pb.id, updatedAt: new Date() })
      .where(eq(outcomeTypes.id, pb.outcomeTypeId));
  },

  async archive(playbookId: string): Promise<void> {
    await db
      .update(outcomePlaybooks)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(outcomePlaybooks.id, playbookId));
  },
};
