import { repo } from '../db/repo.js';
import { interpolateString, interpolateDeep } from './interpolation.js';
import { appendQuery } from './url.js';
import fetch from 'cross-fetch';

export type ResolvedAction = {
  action: any;
  binding: any;
  environment: any;
  setup: any;
};

export type ExecutionContext = {
  orgId: string;
  setupId?: string;
  environmentId?: string;
  variables?: Record<string, any>;
  authHeader?: string;
};

/**
 * Resolves an Action's execution details using the new model architecture:
 * Setup.environment + Action → ActionBinding → execution
 *
 * Actions now contain HTTP details directly (method, path, headers, body).
 * ActionBindings provide the baseUrl and auth for each environment.
 */
export async function resolveActionExecution(
  orgId: string,
  actionId: string,
  setupId?: string,
  environmentId?: string,
): Promise<ResolvedAction | null> {
  // 1. Find the Action
  const action = await repo.getAction(orgId, actionId);
  if (!action) return null;

  // 2. Determine the environment
  let env: any = null;

  if (environmentId) {
    env = await repo.getEnvironmentById(environmentId);
  }

  if (!env) {
    // Try to find a default environment
    env = await repo.getDefaultEnvironment(orgId);
  }

  // 3. Find the ActionBinding for this (Action, Environment) pair
  let binding: any = null;
  if (env) {
    binding = await repo.getActionBinding(orgId, actionId, env.id);
  }

  return {
    action,
    binding,
    environment: env,
    setup: null,
  };
}

/**
 * Resolves auth headers from an ActionBinding's auth configuration
 */
export async function resolveBindingAuth(
  binding: any,
  variables: Record<string, any>,
  log?: (e: any) => void,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (!binding?.auth) return headers;

  const auth = binding.auth;
  const resolveVar = (key: string | undefined): string => {
    if (!key) return '';
    // Look up in variables (which may come from OrgVariables)
    return variables[key] || process.env[key] || '';
  };

  switch (auth.type) {
    case 'api_key':
    case 'bearer': {
      const token = resolveVar(auth.tokenVariableKey);
      if (token) {
        const prefix = auth.tokenPrefix || (auth.type === 'bearer' ? 'Bearer ' : '');
        const headerName = auth.headerName || 'Authorization';
        headers[headerName] = `${prefix}${token}`;
      }
      break;
    }
    case 'basic': {
      const username = resolveVar(auth.usernameVariableKey);
      const password = resolveVar(auth.passwordVariableKey);
      if (username) {
        const encoded = Buffer.from(`${username}:${password}`).toString('base64');
        headers[auth.headerName || 'Authorization'] = `Basic ${encoded}`;
      }
      break;
    }
    case 'custom': {
      if (auth.customHeaders && typeof auth.customHeaders === 'object') {
        for (const [k, v] of Object.entries(auth.customHeaders)) {
          headers[k] = interpolateString(String(v), { var: variables, env: process.env });
        }
      }
      break;
    }
    case 'oauth2': {
      log?.({ t: new Date().toISOString(), type: 'auth_info', message: 'OAuth2 auth via connectionKey not fully implemented in binding resolver' });
      break;
    }
  }

  return headers;
}

/**
 * Builds the full URL from Action + ActionBinding
 * baseUrl comes from the ActionBinding, path comes from the Action
 */
export function buildRequestUrl(
  action: any,
  binding: any,
  input: Record<string, any>,
): string {
  const baseUrl = binding?.baseUrl || '';
  let path = action?.path || '';

  path = path.replace(/\{([^}]+)\}/g, (_: string, key: string) => {
    return input[key] !== undefined ? encodeURIComponent(String(input[key])) : `{${key}}`;
  });

  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  if (String(action?.method || 'GET').toUpperCase() === 'GET') {
    return appendQuery(url, input);
  }

  return url;
}

/**
 * Merges headers from multiple sources
 */
export function mergeHeaders(
  action: any,
  binding: any,
  authHeaders: Record<string, string>,
  input: Record<string, any>,
): Record<string, string> {
  const result: Record<string, string> = {};

  if (action?.headers) {
    Object.assign(result, action.headers);
  }

  if (binding?.headers) {
    Object.assign(result, binding.headers);
  }

  Object.assign(result, authHeaders);

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      result[key] = value.replace(/\{([^}]+)\}/g, (_: string, k: string) => {
        return input[k] !== undefined ? String(input[k]) : `{${k}}`;
      });
    }
  }

  return result;
}

/**
 * Executes an Action using the new model architecture.
 */
export async function executeActionWithSetup(
  ctx: ExecutionContext,
  actionId: string,
  input: Record<string, any>,
  log?: (entry: any) => void,
): Promise<{ kind: 'text' | 'data'; payload: any; status: number; contentType: string }> {
  const resolved = await resolveActionExecution(
    ctx.orgId,
    actionId,
    ctx.setupId,
    ctx.environmentId,
  );

  if (!resolved?.action) {
    throw new Error(`action_not_found: ${actionId}`);
  }

  const { action, binding, environment } = resolved;

  if (!action.path && !action.method) {
    const { executeRequest } = await import('./httpRequests.js');
    return executeRequest(ctx.orgId, actionId, input, ctx.authHeader, log);
  }

  const mergedInput = {
    ...(binding?.defaultInputs || {}),
    ...input,
  };

  const authHeaders = await resolveBindingAuth(binding, ctx.variables || {}, log);

  if (ctx.authHeader && !authHeaders['Authorization']) {
    authHeaders['Authorization'] = ctx.authHeader;
  }

  const url = buildRequestUrl(action, binding, mergedInput);
  const method = String(action.method || 'GET').toUpperCase();

  const headers = mergeHeaders(action, binding, authHeaders, mergedInput);

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    headers['content-type'] = headers['content-type'] || 'application/json';
    const bodyTemplate = action.body || mergedInput;
    const resolvedBody = interpolateDeep(bodyTemplate, { input: mergedInput, ...mergedInput });
    body = JSON.stringify(resolvedBody);
  }

  log?.({
    t: new Date().toISOString(),
    type: 'action_exec',
    actionId,
    method,
    url,
    environmentId: environment?.id,
    bindingId: binding?.id,
  });

  const timeout = binding?.timeoutMs || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const ct = resp.headers.get('content-type') || '';
    let payload: any;

    if (ct.includes('application/json') || ct.endsWith('+json')) {
      payload = await resp.json().catch(() => ({}));
    } else {
      payload = await resp.text().catch(() => '');
    }

    log?.({
      t: new Date().toISOString(),
      type: 'action_result',
      actionId,
      status: resp.status,
      contentType: ct,
    });

    return {
      kind: typeof payload === 'string' ? 'text' : 'data',
      payload,
      status: resp.status,
      contentType: ct,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    log?.({
      t: new Date().toISOString(),
      type: 'action_error',
      actionId,
      error: err?.message || 'request_failed',
    });
    throw err;
  }
}

/**
 * Lists all ActionBindings for a given Action across all environments
 */
export async function listBindingsForAction(
  orgId: string,
  actionId: string,
): Promise<any[]> {
  return repo.listBindingsForAction(orgId, actionId);
}

/**
 * Lists all ActionBindings for a given Environment
 */
export async function listBindingsForEnvironment(
  orgId: string,
  environmentId: string,
): Promise<any[]> {
  return repo.listBindingsForEnvironment(orgId, environmentId);
}
