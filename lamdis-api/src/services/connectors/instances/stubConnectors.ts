/**
 * Stub typed connectors — Google Drive, Salesforce, Slack, DocuSign, Fax HTTP.
 *
 * These ship with config schemas and capability declarations so playbooks can
 * bind to them today. Actual external API integration is added per-connector
 * in follow-up work; until then, `invoke()` throws a NotImplemented error
 * that surfaces clearly in the agent activity log.
 */

import { z } from 'zod';
import type { Connector, ConnectorCapability, ConnectorClient, ConnectorInstanceRecord } from '../types.js';

function notImplemented(connectorKey: string, capabilities: ConnectorCapability[]): ConnectorClient {
  return {
    capabilities,
    async invoke(capability) {
      throw new Error(`${connectorKey}.${capability} is not yet implemented. Falling back to dynamicTools or generic_http is recommended.`);
    },
    async ping() {
      return { ok: true, reason: 'stub connector — no live check' };
    },
  };
}

function makeStub(opts: {
  key: string;
  displayName: string;
  capabilities: ConnectorCapability[];
  authFlow: Connector['authFlow'];
  configSchema: z.ZodTypeAny;
}): Connector {
  return {
    key: opts.key,
    displayName: opts.displayName,
    capabilities: opts.capabilities,
    authFlow: opts.authFlow,
    configSchema: opts.configSchema,
    client: (_instance: ConnectorInstanceRecord) => notImplemented(opts.key, opts.capabilities),
  };
}

export const googleDriveConnector = makeStub({
  key: 'google_drive',
  displayName: 'Google Drive',
  capabilities: ['read_doc', 'write_doc', 'archive_evidence'],
  authFlow: 'oauth2',
  configSchema: z.object({
    rootFolderId: z.string().optional(),
    sharedDriveId: z.string().optional(),
  }),
});

export const salesforceConnector = makeStub({
  key: 'salesforce',
  displayName: 'Salesforce',
  capabilities: ['lookup_record', 'update_record', 'list_users', 'list_groups'],
  authFlow: 'oauth2',
  configSchema: z.object({
    instanceUrl: z.string().url(),
    apiVersion: z.string().default('v60.0'),
  }),
});

export const slackConnector = makeStub({
  key: 'slack',
  displayName: 'Slack',
  capabilities: ['send_message', 'list_users'],
  authFlow: 'oauth2',
  configSchema: z.object({
    workspaceId: z.string().optional(),
    defaultChannel: z.string().optional(),
  }),
});

export const docusignConnector = makeStub({
  key: 'docusign',
  displayName: 'DocuSign',
  capabilities: ['request_signature', 'read_doc'],
  authFlow: 'oauth2',
  configSchema: z.object({
    accountId: z.string(),
    baseUri: z.string().url(),
  }),
});

export const faxHttpConnector = makeStub({
  key: 'fax_http',
  displayName: 'HTTP Fax Gateway',
  capabilities: ['send_fax'],
  authFlow: 'api_key',
  configSchema: z.object({
    endpoint: z.string().url(),
    fromNumber: z.string().optional(),
  }),
});
