/**
 * Approver Directory Resolver
 *
 * Materializes the live member set for an approverRole. If the role has a
 * static `members` list, that's used as-is. If the role's source_binding_id
 * points at a playbook system binding (e.g. a Salesforce group), members are
 * resolved at runtime via the bound connector instance.
 */

import { db } from '../../db.js';
import { approverRoles, playbookSystemBindings } from '@lamdis/db/schema';
import { eq } from 'drizzle-orm';
import { connectorToolBridge } from '../connectors/index.js';

export interface ResolvedApprover {
  userSub: string;
  email?: string;
  name?: string;
  source: 'static' | 'connector';
}

export const approverDirectoryResolver = {
  async resolve(orgId: string, roleId: string): Promise<ResolvedApprover[]> {
    const [role] = await db
      .select()
      .from(approverRoles)
      .where(eq(approverRoles.id, roleId))
      .limit(1);
    if (!role) return [];

    const staticMembers: ResolvedApprover[] = (role.members ?? [])
      .filter((m): m is { type: 'user'; userSub: string; email?: string; name?: string } => m.type === 'user')
      .map((m) => ({ userSub: m.userSub, email: m.email, name: m.name, source: 'static' }));

    if (!role.sourceBindingId) return staticMembers;

    const [binding] = await db
      .select()
      .from(playbookSystemBindings)
      .where(eq(playbookSystemBindings.id, role.sourceBindingId))
      .limit(1);
    if (!binding || !binding.connectorInstanceId) return staticMembers;

    const tools = await connectorToolBridge.listTools({
      orgId,
      instanceIds: [binding.connectorInstanceId],
    });
    const listUsers = tools.find((t) => t.capability === 'list_users');
    if (!listUsers) return staticMembers;

    try {
      const result = await listUsers.invoke(
        { groupKey: (binding.config as Record<string, unknown> | null)?.groupKey ?? null },
        { orgId },
      );
      const dynamic: ResolvedApprover[] = Array.isArray(result)
        ? result.map((u: any) => ({
            userSub: String(u.userSub ?? u.id ?? u.email),
            email: u.email,
            name: u.name,
            source: 'connector',
          }))
        : [];
      return [...staticMembers, ...dynamic];
    } catch {
      // Connector failure → fall back to static members; the chain will still
      // function and the failure surfaces via connectionHealth in Phase C.
      return staticMembers;
    }
  },
};
