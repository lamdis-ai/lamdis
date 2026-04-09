/**
 * Generic HTTP Connector — fallback connector that exposes a single
 * `http_call` capability so any REST integration can be wired without a
 * dedicated connector implementation.
 */

import { z } from 'zod';
import type { Connector, ConnectorClient, ConnectorInstanceRecord } from '../types.js';

const configSchema = z.object({
  baseUrl: z.string().url(),
  defaultHeaders: z.record(z.string()).optional(),
  authHeader: z.string().optional(), // header name e.g. 'Authorization'
});

type GenericHttpConfig = z.infer<typeof configSchema>;

interface HttpCallInput {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

function buildClient(instance: ConnectorInstanceRecord, secret?: unknown): ConnectorClient {
  const config = configSchema.parse(instance.config) as GenericHttpConfig;
  const tokenSecret = typeof secret === 'string' ? secret : undefined;

  return {
    capabilities: ['http_call'],
    async invoke(capability, input) {
      if (capability !== 'http_call') {
        throw new Error(`generic_http does not support ${capability}`);
      }
      const { method = 'GET', path, headers = {}, query, body } = input as HttpCallInput;
      const url = new URL(path, config.baseUrl);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined) url.searchParams.set(k, String(v));
        }
      }
      const finalHeaders: Record<string, string> = {
        ...(config.defaultHeaders ?? {}),
        ...headers,
      };
      if (tokenSecret && config.authHeader) {
        finalHeaders[config.authHeader] = tokenSecret;
      }
      const res = await fetch(url.toString(), {
        method,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const parsed = (() => {
        try { return JSON.parse(text); } catch { return text; }
      })();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
      }
      return parsed as never;
    },
    async ping() {
      try {
        const res = await fetch(config.baseUrl, { method: 'HEAD' });
        return { ok: res.ok || res.status < 500, reason: `status ${res.status}` };
      } catch (err) {
        return { ok: false, reason: (err as Error).message };
      }
    },
  };
}

export const genericHttpConnector: Connector = {
  key: 'generic_http',
  displayName: 'Generic HTTP',
  capabilities: ['http_call'],
  authFlow: 'api_key',
  configSchema,
  client: buildClient,
};
