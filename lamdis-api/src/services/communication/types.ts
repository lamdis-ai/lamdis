/**
 * Communication Hub Types
 *
 * Shared interfaces for all channel providers.
 */

export interface OutboundMessage {
  to: string;           // phone number, email, webhook URL, etc.
  content: string;      // message text
  contentType?: 'text' | 'template';
  mediaUrl?: string;    // URL to attached media (image, file)
  metadata?: Record<string, unknown>;
}

export interface InboundMessage {
  from: string;          // sender identifier
  fromName?: string;
  content: string;
  contentType: 'text' | 'image' | 'audio' | 'file';
  mediaUrl?: string;
  externalMessageId: string;
  rawPayload: Record<string, unknown>;
  receivedAt: Date;
}

export interface SendResult {
  ok: boolean;
  externalMessageId?: string;
  deliveryStatus: 'queued' | 'sent' | 'delivered' | 'failed';
  error?: string;
}

export interface ChannelProvider {
  readonly name: string;
  send(message: OutboundMessage, config: Record<string, unknown>): Promise<SendResult>;
  parseInbound(raw: unknown): InboundMessage;
  validateConfig(config: Record<string, unknown>): boolean;
}
