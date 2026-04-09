import { pgTable, text, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { channels } from './automation';

// ---------------------------------------------------------------------------
// Message Threads — conversation threads per objective per channel
// ---------------------------------------------------------------------------
export const messageThreads = pgTable('message_threads', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id'),
  channelId: uuid('channel_id').references(() => channels.id),
  externalParticipantId: text('external_participant_id'), // phone number, email, etc.
  externalParticipantName: text('external_participant_name'),
  direction: text('direction').default('bidirectional'), // 'inbound' | 'outbound' | 'bidirectional'
  status: text('status').default('active'), // 'active' | 'closed'
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('message_threads_org_id_idx').on(t.orgId),
  index('message_threads_instance_idx').on(t.outcomeInstanceId),
  index('message_threads_channel_idx').on(t.channelId),
  index('message_threads_org_participant_idx').on(t.orgId, t.externalParticipantId),
]);

// ---------------------------------------------------------------------------
// Messages — individual messages in threads
// ---------------------------------------------------------------------------
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  threadId: uuid('thread_id').notNull().references(() => messageThreads.id, { onDelete: 'cascade' }),
  direction: text('direction').notNull(), // 'inbound' | 'outbound'
  senderType: text('sender_type').notNull().default('agent'), // 'agent' | 'user' | 'external'
  senderRef: text('sender_ref'), // userSub, agentIdentityId, or external identifier
  contentType: text('content_type').default('text'), // 'text' | 'image' | 'audio' | 'file' | 'template'
  content: text('content'),
  mediaAttachments: jsonb('media_attachments').$type<Array<{
    storageKey: string;
    mimeType: string;
    fileName?: string;
    sizeBytes?: number;
  }>>().default([]),
  externalMessageId: text('external_message_id'), // provider's message ID (Twilio SID, etc.)
  deliveryStatus: text('delivery_status').default('queued'), // 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
  deliveryError: text('delivery_error'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('messages_thread_idx').on(t.threadId),
  index('messages_thread_created_idx').on(t.threadId, t.createdAt),
  index('messages_external_id_idx').on(t.externalMessageId),
]);
