/**
 * Instance Webhook Service
 *
 * Fires webhooks when workflow instances change status.
 * HMAC-SHA256 signing with X-Lamdis-Signature + X-Lamdis-Timestamp headers.
 * Fire-and-forget (log success/failure, don't block).
 */

import crypto from 'crypto';

interface WebhookConfig {
  enabled?: boolean;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  triggerOn?: 'all' | 'any_failure' | 'status_change' | 'completed';
  includeEvents?: boolean;
  secret?: string;
}

interface WebhookPayload {
  event: 'status_change' | 'completed' | 'review_updated';
  workflowId: string | null;
  workflowName?: string;
  instanceId: string;
  status: string | null;
  reviewStatus: string | null;
  totals: unknown;
  timestamp: string;
}

function shouldFire(config: WebhookConfig, event: WebhookPayload['event'], instanceStatus?: string | null): boolean {
  if (!config.enabled || !config.url) return false;
  const trigger = config.triggerOn || 'all';
  if (trigger === 'all') return true;
  if (trigger === 'status_change' && (event === 'status_change' || event === 'review_updated')) return true;
  if (trigger === 'completed' && event === 'completed') return true;
  if (trigger === 'any_failure' && (instanceStatus === 'failed' || instanceStatus === 'error')) return true;
  return false;
}

async function sendWebhook(config: WebhookConfig, payload: WebhookPayload): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers || {}),
  };

  const bodyStr = JSON.stringify(payload);

  if (config.secret) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = crypto.createHmac('sha256', config.secret).update(`${ts}.${bodyStr}`).digest('hex');
    headers['X-Lamdis-Signature'] = sig;
    headers['X-Lamdis-Timestamp'] = ts;
  }

  try {
    const resp = await fetch(config.url!, {
      method: config.method || 'POST',
      headers,
      body: bodyStr,
    });
    console.log(`[webhook] Fired to ${config.url} → ${resp.status}`);
  } catch (err: any) {
    console.error(`[webhook] Error firing to ${config.url}:`, err?.message);
  }
}

/**
 * Fire instance webhook(s) for a workflow.
 * Call this from status change, evaluation completion, and review update paths.
 */
export async function fireInstanceWebhook(
  workflow: { id: string; name: string; webhook?: WebhookConfig | null; webhookSecondary?: WebhookConfig | null },
  instance: { id: string; status: string | null; reviewStatus: string | null; totals: unknown },
  event: WebhookPayload['event'],
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    workflowId: workflow.id,
    workflowName: workflow.name,
    instanceId: instance.id,
    status: instance.status,
    reviewStatus: instance.reviewStatus,
    totals: instance.totals,
    timestamp: new Date().toISOString(),
  };

  // Fire-and-forget: don't await, don't block the caller
  const promises: Promise<void>[] = [];

  if (workflow.webhook && shouldFire(workflow.webhook, event, instance.status)) {
    promises.push(sendWebhook(workflow.webhook, payload));
  }

  if (workflow.webhookSecondary && shouldFire(workflow.webhookSecondary, event, instance.status)) {
    promises.push(sendWebhook(workflow.webhookSecondary, payload));
  }

  if (promises.length > 0) {
    Promise.allSettled(promises).catch(() => {});
  }
}
