/**
 * Communication Agent Tools
 *
 * Tools that let the agent send SMS, email, and webhook messages.
 * These use the communication hub and credential vault under the hood.
 */

import type { AgentTool, AgentToolResult } from '../automation/agentTools.js';
import * as hub from './communicationHub.js';
import { db } from '../../db.js';
import { channels } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';

// Context holder
let _commContext: { orgId: string; instanceId: string } | null = null;

export function setCommunicationContext(orgId: string, instanceId: string) {
  _commContext = { orgId, instanceId };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const sendSmsTool: AgentTool = {
  name: 'send_sms',
  description: 'Send an SMS text message to a phone number. Requires a Twilio channel to be configured. If no channel exists, use create_channel first.',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Phone number (e.g., "+15551234567")' },
      message: { type: 'string', description: 'Message text' },
      channelId: { type: 'string', description: 'Channel ID to send from (optional — uses first SMS channel if omitted)' },
    },
    required: ['to', 'message'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_commContext) return { ok: false, error: 'No communication context set' };

    const channelId = input.channelId as string || await findChannelByMedium(_commContext.orgId, 'sms');
    if (!channelId) return { ok: false, error: 'No SMS channel configured. Create one first.' };

    const result = await hub.sendMessage(_commContext.orgId, channelId, {
      to: input.to as string,
      content: input.message as string,
      outcomeInstanceId: _commContext.instanceId,
      senderType: 'agent',
    });

    return { ok: result.ok, result: { deliveryStatus: result.deliveryStatus, threadId: result.threadId }, error: result.error };
  },
};

const sendEmailTool: AgentTool = {
  name: 'send_email',
  description: 'Send an email. Requires an email channel to be configured.',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Email address' },
      subject: { type: 'string', description: 'Email subject line' },
      body: { type: 'string', description: 'Email body text' },
      channelId: { type: 'string', description: 'Channel ID (optional)' },
    },
    required: ['to', 'subject', 'body'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_commContext) return { ok: false, error: 'No communication context set' };

    const channelId = input.channelId as string || await findChannelByMedium(_commContext.orgId, 'email');
    if (!channelId) return { ok: false, error: 'No email channel configured.' };

    const result = await hub.sendMessage(_commContext.orgId, channelId, {
      to: input.to as string,
      content: input.body as string,
      metadata: { subject: input.subject },
      outcomeInstanceId: _commContext.instanceId,
      senderType: 'agent',
    });

    return { ok: result.ok, result: { deliveryStatus: result.deliveryStatus }, error: result.error };
  },
};

const sendWebhookTool: AgentTool = {
  name: 'send_webhook',
  description: 'Send an HTTP webhook to a URL with a JSON payload.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Webhook URL' },
      content: { type: 'string', description: 'Message content or JSON string' },
      channelId: { type: 'string', description: 'Channel ID (optional)' },
    },
    required: ['url', 'content'],
  },
  async execute(input): Promise<AgentToolResult> {
    if (!_commContext) return { ok: false, error: 'No communication context set' };

    const channelId = input.channelId as string || await findChannelByMedium(_commContext.orgId, 'webhook');
    if (!channelId) return { ok: false, error: 'No webhook channel configured.' };

    const result = await hub.sendMessage(_commContext.orgId, channelId, {
      to: input.url as string,
      content: input.content as string,
      outcomeInstanceId: _commContext.instanceId,
      senderType: 'agent',
    });

    return { ok: result.ok, result: { deliveryStatus: result.deliveryStatus }, error: result.error };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findChannelByMedium(orgId: string, medium: string): Promise<string | null> {
  const results = await db.select({ id: channels.id }).from(channels)
    .where(and(eq(channels.orgId, orgId), eq(channels.channelMedium, medium), eq(channels.enabled, true)))
    .limit(1);
  return results[0]?.id || null;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function getCommunicationTools(): AgentTool[] {
  return [sendSmsTool, sendEmailTool, sendWebhookTool];
}
