/**
 * Webhook Provider — generic HTTP webhook for outbound + inbound
 */

import type { ChannelProvider, OutboundMessage, InboundMessage, SendResult } from '../types.js';

export const webhookProvider: ChannelProvider = {
  name: 'webhook',

  async send(message: OutboundMessage, config: Record<string, unknown>): Promise<SendResult> {
    const url = (config.webhookUrl as string) || message.to;
    const headers = (config.headers as Record<string, string>) || {};

    if (!url) {
      return { ok: false, deliveryStatus: 'failed', error: 'Missing webhookUrl' };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          content: message.content,
          contentType: message.contentType || 'text',
          mediaUrl: message.mediaUrl,
          metadata: message.metadata,
          timestamp: new Date().toISOString(),
        }),
      });

      return {
        ok: response.ok,
        externalMessageId: `webhook-${Date.now()}`,
        deliveryStatus: response.ok ? 'delivered' : 'failed',
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (err: any) {
      return { ok: false, deliveryStatus: 'failed', error: err?.message };
    }
  },

  parseInbound(raw: unknown): InboundMessage {
    const data = raw as Record<string, any>;
    return {
      from: data.from || data.sender || 'webhook',
      content: data.content || data.body || data.text || JSON.stringify(data),
      contentType: 'text',
      externalMessageId: data.id || `webhook-in-${Date.now()}`,
      rawPayload: data,
      receivedAt: new Date(data.timestamp || Date.now()),
    };
  },

  validateConfig(config: Record<string, unknown>): boolean {
    return !!config.webhookUrl;
  },
};
