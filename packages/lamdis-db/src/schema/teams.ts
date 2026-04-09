import { pgTable, text, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { members } from './members';

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#8b5cf6'), // badge color (hex)
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('teams_org_name_unique').on(t.orgId, t.name),
  index('teams_org_id_idx').on(t.orgId),
]);

export type TeamMemberRole = 'lead' | 'member';

export const teamMembers = pgTable('team_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  role: text('role').default('member').$type<TeamMemberRole>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('team_members_team_member_unique').on(t.teamId, t.memberId),
  index('team_members_team_id_idx').on(t.teamId),
  index('team_members_member_id_idx').on(t.memberId),
]);
