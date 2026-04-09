/**
 * Twilio Provider — SMS, Voice, WhatsApp
 */

import type { ChannelProvider, OutboundMessage, InboundMessage, SendResult } from '../types.js';

export const twilioProvider: ChannelProvider = {
  name: 'twilio',

  async send(message: OutboundMessage, config: Record<string, unknown>): Promise<SendResult> {
    const accountSid = config.accountSid as string;
    const authToken = config.authToken as string;
    const fromNumber = config.fromNumber as string;

    if (!accountSid || !authToken || !fromNumber) {
      return { ok: false, deliveryStatus: 'failed', error: 'Missing Twilio credentials (accountSid, authToken, fromNumber)' };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const body = new URLSearchParams({
        To: message.to,
        From: fromNumber,
        Body: message.content,
      });

      if (message.mediaUrl) {
        body.append('MediaUrl', message.mediaUrl);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return { ok: false, deliveryStatus: 'failed', error: data.message || `HTTP ${response.status}` };
      }

      return {
        ok: true,
        externalMessageId: data.sid,
        deliveryStatus: data.status === 'queued' ? 'queued' : 'sent',
      };
    } catch (err: any) {
      return { ok: false, deliveryStatus: 'failed', error: err?.message };
    }
  },

  parseInbound(raw: unknown): InboundMessage {
    const data = raw as Record<string, any>;
    return {
      from: data.From || data.from || '',
      fromName: data.ProfileName || undefined,
      content: data.Body || data.body || '',
      contentType: data.NumMedia > 0 ? 'image' : 'text',
      mediaUrl: data.MediaUrl0 || undefined,
      externalMessageId: data.MessageSid || data.SmsSid || '',
      rawPayload: data,
      receivedAt: new Date(),
    };
  },

  validateConfig(config: Record<string, unknown>): boolean {
    return !!(config.accountSid && config.authToken && config.fromNumber);
  },
};
