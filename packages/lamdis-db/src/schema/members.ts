import { pgTable, text, uuid, timestamp, boolean, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const members = pgTable('members', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userSub: text('user_sub'),
  email: text('email'),
  role: text('role').default('member'), // 'owner','admin','member'
  status: text('status').default('active'), // 'active','invited'
  licensed: boolean('licensed').default(true),
  licensedAt: timestamp('licensed_at', { withTimezone: true }),
  licensedBy: text('licensed_by'),
  invitedBy: text('invited_by'),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('members_org_user_sub_unique').on(t.orgId, t.userSub),
  uniqueIndex('members_org_email_unique').on(t.orgId, t.email),
  index('members_org_id_idx').on(t.orgId),
  index('members_user_sub_idx').on(t.userSub),
  index('members_status_idx').on(t.status),
]);

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').default(false),
  inheritsFrom: text('inherits_from'),
  permissions: jsonb('permissions').$type<string[]>().default([]),
  deniedPermissions: jsonb('denied_permissions').$type<string[]>().default([]),
  auth0RoleId: text('auth0_role_id'),
  priority: integer('priority').default(0),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('roles_org_slug_unique').on(t.orgId, t.slug),
  index('roles_org_id_idx').on(t.orgId),
]);

export const memberRoles = pgTable('member_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  userSub: text('user_sub').notNull(),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  roleSlug: text('role_slug').notNull(),
  scope: jsonb('scope').$type<{
    type: string;
    environmentIds?: string[];
    resourceTypes?: string[];
    resourceIds?: string[];
  }>(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  assignedBy: text('assigned_by'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('member_roles_org_member_role_unique').on(t.orgId, t.memberId, t.roleId),
  index('member_roles_org_user_sub_idx').on(t.orgId, t.userSub),
]);
