import { pgTable, text, uuid, timestamp, boolean, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userSub: text('user_sub').notNull().unique(),
  email: text('email'),
  displayName: text('display_name'),
  employeeUuid: text('employee_uuid'),
  avatarUrl: text('avatar_url'),
  preferences: jsonb('preferences').$type<{
    timezone?: string;
    dateFormat?: string;
    theme?: string;
    emailNotifications?: boolean;
  }>().default({ timezone: 'UTC', dateFormat: 'YYYY-MM-DD', theme: 'dark', emailNotifications: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('user_profiles_email_idx').on(t.email),
]);

export const userCredentials = pgTable('user_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userSub: text('user_sub').notNull(),
  provider: text('provider').notNull(),
  enc: jsonb('enc'), // encrypted access_token, refresh_token, expires_at
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('user_credentials_org_user_provider_unique').on(t.orgId, t.userSub, t.provider),
  index('user_credentials_org_id_idx').on(t.orgId),
  index('user_credentials_user_sub_idx').on(t.userSub),
]);

export const oauthStates = pgTable('oauth_states', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userSub: text('user_sub').notNull(),
  provider: text('provider').notNull(),
  state: text('state').notNull().unique(),
  codeVerifier: text('code_verifier').notNull(),
  redirectTo: text('redirect_to').default('/dashboard/test'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('oauth_states_org_id_idx').on(t.orgId),
  index('oauth_states_user_sub_idx').on(t.userSub),
]);

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  keyHash: text('key_hash').notNull(),
  keySalt: text('key_salt'),
  keyPrefix: text('key_prefix').notNull(),
  roleId: uuid('role_id'),
  roleSlug: text('role_slug'),
  permissions: jsonb('permissions').$type<string[]>(),
  scopes: jsonb('scopes').$type<string[]>().default(['workflows:*']),
  allowedIps: jsonb('allowed_ips').$type<string[]>(),
  allowedOrigins: jsonb('allowed_origins').$type<string[]>(),
  rateLimit: integer('rate_limit'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  usageCount: integer('usage_count').default(0),
  status: text('status').default('active'), // 'active','revoked','expired'
  disabled: boolean('disabled').default(false),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: text('revoked_by'),
  revokeReason: text('revoke_reason'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('api_keys_key_hash_unique').on(t.keyHash),
  index('api_keys_org_status_idx').on(t.orgId, t.status),
  index('api_keys_org_key_prefix_idx').on(t.orgId, t.keyPrefix),
  index('api_keys_key_prefix_idx').on(t.keyPrefix),
]);

export const userDevices = pgTable('user_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userSub: text('user_sub').notNull(),
  platform: text('platform').notNull(), // 'ios' | 'android'
  pushToken: text('push_token').notNull(),
  deviceName: text('device_name'),
  appVersion: text('app_version'),
  enabled: boolean('enabled').default(true),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('user_devices_org_user_idx').on(t.orgId, t.userSub),
  uniqueIndex('user_devices_push_token_unique').on(t.pushToken),
]);

export const joinCodes = pgTable('join_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  auth0OrgId: text('auth0_org_id').notNull(),
  invitationId: text('invitation_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').default(0),
  createdBy: text('created_by').notNull(),
  role: text('role').default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('join_codes_org_id_idx').on(t.orgId),
  index('join_codes_expires_at_idx').on(t.expiresAt),
]);
