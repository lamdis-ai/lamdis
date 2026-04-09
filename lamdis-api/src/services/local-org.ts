import { eq, and, or } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations, members } from '@lamdis/db/schema';

/**
 * Local organization management service for self-hosted deployments.
 * Manages orgs and members purely via PostgreSQL, without Auth0 Management API.
 */

export async function createOrganization(
  name: string,
  adminUser: { sub: string; email: string },
) {
  const [org] = await db.insert(organizations).values({
    name,
    subscriptionStatus: 'active',
    currentPlan: 'enterprise', // License controls actual limits
  }).returning();

  const [member] = await db.insert(members).values({
    orgId: org.id,
    userSub: adminUser.sub,
    email: adminUser.email.toLowerCase(),
    role: 'admin',
    status: 'active',
    acceptedAt: new Date(),
  }).returning();

  return { org, member };
}

export async function addMember(
  orgId: string,
  userSub: string,
  email: string,
  role: string = 'member',
) {
  // Check if member already exists
  const [existing] = await db.select().from(members)
    .where(and(
      eq(members.orgId, orgId),
      or(eq(members.userSub, userSub), eq(members.email, email.toLowerCase())),
    ))
    .limit(1);
  if (existing) {
    return existing;
  }

  const [member] = await db.insert(members).values({
    orgId,
    userSub,
    email: email.toLowerCase(),
    role,
    status: 'active',
    acceptedAt: new Date(),
  }).returning();
  return member;
}

export async function inviteMember(
  orgId: string,
  email: string,
  role: string = 'member',
) {
  // Check if already a member or invited
  const [existing] = await db.select().from(members)
    .where(and(eq(members.orgId, orgId), eq(members.email, email.toLowerCase())))
    .limit(1);
  if (existing) {
    return { existing: true, member: existing };
  }

  const [member] = await db.insert(members).values({
    orgId,
    email: email.toLowerCase(),
    role,
    status: 'invited',
  }).returning();

  return { existing: false, member };
}

export async function removeMember(orgId: string, userSub: string) {
  const deleted = await db.delete(members)
    .where(and(eq(members.orgId, orgId), eq(members.userSub, userSub)))
    .returning();
  return { deleted: deleted.length > 0 };
}

export async function listMembers(orgId: string) {
  return db.select().from(members).where(eq(members.orgId, orgId));
}
