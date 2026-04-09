/**
 * Connector taxonomy — types shared across the connectors module.
 *
 * A Connector is a typed integration with an external system (Google Drive,
 * Salesforce, Slack, DocuSign, fax, generic HTTP). Each connector declares
 * the capabilities it supports, its config schema, and how to construct a
 * runtime client from a stored connector instance + credential vault entry.
 */

import type { z } from 'zod';

export type ConnectorCapability =
  | 'read_doc'
  | 'write_doc'
  | 'list_users'
  | 'list_groups'
  | 'send_message'
  | 'request_signature'
  | 'archive_evidence'
  | 'lookup_record'
  | 'update_record'
  | 'send_fax'
  | 'http_call';

export type ConnectorAuthFlow = 'oauth2' | 'api_key' | 'username_password' | 'none';

export interface ConnectorInstanceRecord {
  id: string;
  orgId: string;
  connectorTypeId: string;
  name: string;
  config: Record<string, unknown>;
  credentialVaultEntryId: string | null;
  status: string;
}

export interface ConnectorCallContext {
  orgId: string;
  outcomeInstanceId?: string;
  actor?: string;
}

export interface ConnectorClient {
  /** The capability set this client exposes at runtime. */
  capabilities: ConnectorCapability[];
  /** Invoke a capability with arbitrary input. Returns capability-specific output. */
  invoke<TInput = unknown, TOutput = unknown>(
    capability: ConnectorCapability,
    input: TInput,
    ctx: ConnectorCallContext,
  ): Promise<TOutput>;
  /** Lightweight health check; should not throw. */
  ping(): Promise<{ ok: boolean; reason?: string }>;
}

export interface Connector {
  /** Stable key matching connector_types.key (e.g. 'google_drive'). */
  key: string;
  displayName: string;
  capabilities: ConnectorCapability[];
  authFlow: ConnectorAuthFlow;
  /** Zod schema for the connector instance config blob. */
  configSchema: z.ZodTypeAny;
  /** Build a runtime client from a stored instance + decrypted secret. */
  client(instance: ConnectorInstanceRecord, decryptedSecret?: unknown): ConnectorClient;
}
