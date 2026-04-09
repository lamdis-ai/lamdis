/**
 * Communication Hub
 *
 * Unified send/receive across all channel types. Routes messages to the
 * correct provider, manages threads, and emits evidence events when
 * messages are sent or received.
 */

import { db } from '../../db.js';
import { channels, messageThreads, messages, evidenceEvents } from '@lamdis/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getCredential } from '../identity/credentialVaultService.js';
import { twilioProvider } from './providers/twilioProvider.js';
import { emailProvider } from './providers/emailProvider.js';
import { webhookProvider } from './providers/webhookProvider.js';
import type { ChannelProvider, OutboundMessage, InboundMessage, SendResult } from './types.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers: Record<string, ChannelProvider> = {
  twilio: twilioProvider,
  email: emailProvider,
  webhook: webhookProvider,
};

function getProvider(name: string): ChannelProvider | null {
  return providers[name] || null;
}

// ---------------------------------------------------------------------------
// Send message
// ---------------------------------------------------------------------------

export async function sendMessage(orgId: string, channelId: string, opts: {
  to: string;
  content: string;
  contentType?: 'text' | 'template';
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
  outcomeInstanceId?: string;
  senderType?: string;
  senderRef?: string;
}): Promise<SendResult & { threadId?: string; messageId?: string }> {
  // Load channel config
  const [channel] = await db.select().from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.orgId, orgId)))
    .limit(1);

  if (!channel) return { ok: false, deliveryStatus: 'failed', error: 'Channel not found' };

  const providerConfig = (channel.providerConfig || {}) as Record<string, unknown>;
  const providerName = (providerConfig.provider as string) || channel.channelMedium || 'webhook';
  const provider = getProvider(providerName);

  if (!provider) return { ok: false, deliveryStatus: 'failed', error: `Unknown provider: ${providerName}` };

  // Load credentials from vault if channel has a credential vault entry
  let fullConfig = { ...providerConfig };
  if (channel.credentialVaultEntryId) {
    const cred = await getCredential(orgId, providerName);
    if (cred) fullConfig = { ...fullConfig, ...cred.data };
  }

  // Send via provider
  const outbound: OutboundMessage = {
    to: opts.to,
    content: opts.content,
    contentType: opts.contentType,
    mediaUrl: opts.mediaUrl,
    metadata: opts.metadata,
  };

  const result = await provider.send(outbound, fullConfig);

  // Create/update thread
  let threadId: string | undefined;
  const [existingThread] = await db.select().from(messageThreads)
    .where(and(
      eq(messageThreads.orgId, orgId),
      eq(messageThreads.channelId, channelId),
      eq(messageThreads.externalParticipantId, opts.to),
      eq(messageThreads.status, 'active'),
    )).limit(1);

  if (existingThread) {
    threadId = existingThread.id;
    await db.update(messageThreads).set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(messageThreads.id, threadId));
  } else {
    const [newThread] = await db.insert(messageThreads).values({
      orgId,
      outcomeInstanceId: opts.outcomeInstanceId,
      channelId,
      externalParticipantId: opts.to,
      direction: 'outbound',
      lastMessageAt: new Date(),
    } as any).returning();
    threadId = newThread.id;
  }

  // Store message record
  const [msg] = await db.insert(messages).values({
    orgId,
    threadId,
    direction: 'outbound',
    senderType: opts.senderType || 'agent',
    senderRef: opts.senderRef,
    contentType: opts.contentType || 'text',
    content: opts.content,
    externalMessageId: result.externalMessageId,
    deliveryStatus: result.deliveryStatus,
    deliveryError: result.error,
  } as any).returning();

  // Emit evidence event
  if (opts.outcomeInstanceId) {
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId: opts.outcomeInstanceId,
      eventType: `communication.sent.${providerName}`,
      eventSource: 'agent:communication',
      payload: { to: opts.to, channel: providerName, delivered: result.ok, messageId: msg.id },
      confirmationLevel: 'A',
      idempotencyKey: `comm-sent-${msg.id}`,
      emittedAt: new Date(),
    });
  }

  return { ...result, threadId, messageId: msg.id };
}

// ---------------------------------------------------------------------------
// Receive inbound message
// ---------------------------------------------------------------------------

export async function receiveMessage(orgId: string, channelId: string, rawPayload: unknown): Promise<{
  threadId: string;
  messageId: string;
  routedToInstanceId?: string;
}> {
  const [channel] = await db.select().from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.orgId, orgId)))
    .limit(1);

  if (!channel) throw new Error('Channel not found');

  const providerConfig = (channel.providerConfig || {}) as Record<string, unknown>;
  const providerName = (providerConfig.provider as string) || channel.channelMedium || 'webhook';
  const provider = getProvider(providerName);

  if (!provider) throw new Error(`Unknown provider: ${providerName}`);

  const inbound = provider.parseInbound(rawPayload);

  // Download media attachments (e.g., Twilio MMS photos) before URLs expire
  const mediaAttachments: Array<{ storageKey: string; mimeType: string; fileName: string; sizeBytes: number }> = [];
  const raw = inbound.rawPayload as Record<string, any> || {};
  const numMedia = parseInt(raw.NumMedia || '0', 10);
  if (numMedia > 0) {
    const accountSid = (providerConfig.accountSid as string) || '';
    const authToken = (providerConfig.authToken as string) || '';
    const auth = accountSid && authToken ? `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` : '';

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = raw[`MediaUrl${i}`];
      const mediaContentType = raw[`MediaContentType${i}`] || 'image/jpeg';
      if (!mediaUrl) continue;
      try {
        const resp = await fetch(mediaUrl, auth ? { headers: { Authorization: auth } } : {});
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const ext = mediaContentType.includes('png') ? 'png' : mediaContentType.includes('gif') ? 'gif' : 'jpg';
          const fileName = `inbound-media-${Date.now()}-${i}.${ext}`;
          // Save to workspace if we have an instance ID, otherwise save to org media dir
          const baseDir = join(process.cwd(), 'data', 'media', orgId);
          mkdirSync(baseDir, { recursive: true });
          const filePath = join(baseDir, fileName);
          writeFileSync(filePath, buf);
          mediaAttachments.push({ storageKey: `media/${orgId}/${fileName}`, mimeType: mediaContentType, fileName, sizeBytes: buf.length });
          console.log(`[comm-hub] Downloaded media ${i}: ${fileName} (${(buf.length / 1024).toFixed(1)} KB)`);
        }
      } catch (err: any) {
        console.error(`[comm-hub] Failed to download media ${i}: ${err?.message}`);
      }
    }
  }

  // Route to objective via routing rules
  let routedToInstanceId: string | undefined;
  const routingRules = (channel.inboundRoutingRules || []) as Array<{ match: string; routeToInstanceId: string }>;
  for (const rule of routingRules) {
    if (rule.match === '*' || inbound.from.includes(rule.match) || inbound.content.includes(rule.match)) {
      routedToInstanceId = rule.routeToInstanceId;
      break;
    }
  }

  // Find or create thread
  let threadId: string;
  const [existingThread] = await db.select().from(messageThreads)
    .where(and(
      eq(messageThreads.orgId, orgId),
      eq(messageThreads.channelId, channelId),
      eq(messageThreads.externalParticipantId, inbound.from),
      eq(messageThreads.status, 'active'),
    )).limit(1);

  if (existingThread) {
    threadId = existingThread.id;
    routedToInstanceId = routedToInstanceId || existingThread.outcomeInstanceId || undefined;
    await db.update(messageThreads).set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(messageThreads.id, threadId));
  } else {
    const [newThread] = await db.insert(messageThreads).values({
      orgId,
      outcomeInstanceId: routedToInstanceId,
      channelId,
      externalParticipantId: inbound.from,
      externalParticipantName: inbound.fromName,
      direction: 'inbound',
      lastMessageAt: new Date(),
    } as any).returning();
    threadId = newThread.id;
  }

  // Also save media to the routed instance's workspace if we have one
  if (routedToInstanceId && mediaAttachments.length > 0) {
    const wsDir = join(process.cwd(), 'data', 'workspaces', routedToInstanceId, 'files');
    mkdirSync(wsDir, { recursive: true });
    for (const att of mediaAttachments) {
      try {
        const srcPath = join(process.cwd(), 'data', att.storageKey);
        const { copyFileSync } = await import('fs');
        copyFileSync(srcPath, join(wsDir, att.fileName));
      } catch { /* best effort */ }
    }
  }

  // Store message
  const [msg] = await db.insert(messages).values({
    orgId,
    threadId,
    direction: 'inbound',
    senderType: 'external',
    senderRef: inbound.from,
    contentType: inbound.contentType,
    content: inbound.content,
    externalMessageId: inbound.externalMessageId,
    deliveryStatus: 'delivered',
    mediaAttachments: mediaAttachments.length > 0 ? mediaAttachments : undefined,
    metadata: { rawPayload: inbound.rawPayload },
  } as any).returning();

  // Emit evidence event if routed to an objective
  if (routedToInstanceId) {
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId: routedToInstanceId,
      eventType: `communication.received.${providerName}`,
      eventSource: 'external:inbound',
      payload: {
        from: inbound.from,
        content: inbound.content.slice(0, 500),
        channel: providerName,
        mediaCount: mediaAttachments.length,
        mediaFiles: mediaAttachments.map(a => a.fileName),
      },
      confirmationLevel: 'B',
      idempotencyKey: `comm-recv-${msg.id}`,
      emittedAt: new Date(),
    });
  }

  return { threadId, messageId: msg.id, routedToInstanceId };
}

// ---------------------------------------------------------------------------
// Thread operations
// ---------------------------------------------------------------------------

export async function getThreadMessages(orgId: string, threadId: string, opts?: { limit?: number; offset?: number }) {
  return db.select().from(messages)
    .where(and(eq(messages.orgId, orgId), eq(messages.threadId, threadId)))
    .orderBy(desc(messages.createdAt))
    .limit(opts?.limit || 50);
}

export async function listThreads(orgId: string, channelId: string) {
  return db.select().from(messageThreads)
    .where(and(eq(messageThreads.orgId, orgId), eq(messageThreads.channelId, channelId)))
    .orderBy(desc(messageThreads.lastMessageAt));
}
