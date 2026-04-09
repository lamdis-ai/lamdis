/**
 * Email Provider — SMTP-based email sending
 */

import type { ChannelProvider, OutboundMessage, InboundMessage, SendResult } from '../types.js';

export const emailProvider: ChannelProvider = {
  name: 'email',

  async send(message: OutboundMessage, config: Record<string, unknown>): Promise<SendResult> {
    const host = config.smtpHost as string;
    const port = (config.smtpPort as number) || 587;
    const user = config.smtpUser as string;
    const pass = config.smtpPass as string;
    const fromEmail = config.fromEmail as string;

    if (!host || !user || !pass || !fromEmail) {
      return { ok: false, deliveryStatus: 'failed', error: 'Missing SMTP config (smtpHost, smtpUser, smtpPass, fromEmail)' };
    }

    try {
      // Dynamic import — nodemailer is optional
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from: fromEmail,
        to: message.to,
        subject: (message.metadata?.subject as string) || 'Message from Lamdis',
        text: message.content,
        html: message.metadata?.html as string | undefined,
      });

      return {
        ok: true,
        externalMessageId: info.messageId,
        deliveryStatus: 'sent',
      };
    } catch (err: any) {
      if (err?.code === 'MODULE_NOT_FOUND') {
        return { ok: false, deliveryStatus: 'failed', error: 'nodemailer not installed. Run: npm install nodemailer' };
      }
      return { ok: false, deliveryStatus: 'failed', error: err?.message };
    }
  },

  parseInbound(raw: unknown): InboundMessage {
    const data = raw as Record<string, any>;
    return {
      from: data.from || data.sender || '',
      fromName: data.fromName,
      content: data.text || data.body || '',
      contentType: 'text',
      externalMessageId: data.messageId || `email-${Date.now()}`,
      rawPayload: data,
      receivedAt: new Date(data.date || Date.now()),
    };
  },

  validateConfig(config: Record<string, unknown>): boolean {
    return !!(config.smtpHost && config.smtpUser && config.smtpPass && config.fromEmail);
  },
};
