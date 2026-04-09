import fetch from 'cross-fetch';
import { appendQuery } from './url.js';
import { interpolateDeep, interpolateString } from './interpolation.js';
import { repo } from '../db/repo.js';

export type OAuthClientCredentialsAuth = {
  id: string;
  kind: 'oauth_client_credentials';
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes?: string[];
  cacheTtlSeconds?: number;
  apply?: { type: 'bearer'; header?: string };
};

const oauthCache: Map<string, { accessToken: string; expiresAt: number }> = new Map();

export async function resolveAuthHeaderFromBlock(auth: any, rootVars: any, log?: (e:any)=>void): Promise<string | undefined> {
  if (!auth || typeof auth !== 'object') return undefined;
  const kind = String((auth as any).kind || '').toLowerCase();

  if (kind === 'oauth_client_credentials') {
    const cfg: OAuthClientCredentialsAuth = {
      id: String(auth.id || ''),
      kind: 'oauth_client_credentials',
      clientId: interpolateString(String(auth.clientId || ''), rootVars),
      clientSecret: interpolateString(String(auth.clientSecret || ''), rootVars),
      tokenUrl: interpolateString(String(auth.tokenUrl || ''), rootVars),
      scopes: Array.isArray(auth.scopes) ? auth.scopes.map((s:any)=> String(s)) : undefined,
      cacheTtlSeconds: typeof auth.cacheTtlSeconds === 'number' ? auth.cacheTtlSeconds : 300,
      apply: auth.apply && typeof auth.apply === 'object' ? { type: 'bearer', header: String((auth.apply.header || 'authorization')) } : { type: 'bearer', header: 'authorization' },
    };

    if (!cfg.clientId || !cfg.clientSecret || !cfg.tokenUrl) return undefined;

    const cacheKey = `${cfg.tokenUrl}::${cfg.clientId}::${(cfg.scopes||[]).join(' ')}`;
    const nowTs = Date.now();
    const cached = oauthCache.get(cacheKey);
    if (cached && cached.expiresAt > nowTs + 5000) {
      return `Bearer ${cached.accessToken}`;
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', cfg.clientId);
    body.set('client_secret', cfg.clientSecret);
    if (cfg.scopes && cfg.scopes.length) body.set('scope', cfg.scopes.join(' '));

    try {
      const resp = await fetch(cfg.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const json = await resp.json().catch(()=> ({} as any));
      const accessToken = String(json.access_token || '');
      if (!accessToken) {
        log?.({ t: new Date().toISOString(), type: 'auth_error', strategy: 'oauth_client_credentials', details: { status: resp.status, body: json } });
        return undefined;
      }
      const expiresIn = Number(json.expires_in || cfg.cacheTtlSeconds || 300);
      oauthCache.set(cacheKey, { accessToken, expiresAt: nowTs + expiresIn * 1000 });
      return `Bearer ${accessToken}`;
    } catch (e:any) {
      log?.({ t: new Date().toISOString(), type: 'auth_error', strategy: 'oauth_client_credentials', details: { error: e?.message || 'token_fetch_failed' } });
      return undefined;
    }
  }

  if (auth.headers && typeof auth.headers === 'object') {
    const headers = interpolateDeep(auth.headers, rootVars) || {};
    const val = (headers as any).authorization || (headers as any).Authorization;
    return typeof val === 'string' ? val : undefined;
  }

  return undefined;
}

export async function executeRequest(orgId: any, actionId: string, input: any, authHeader?: string, log?: (entry: any)=>void, fileActions?: Record<string, any>, authBlocks?: Record<string, any>, environmentId?: string, interpolationContext?: any): Promise<{ kind: 'text'|'data'; payload: any; status: number; contentType: string }> {
  const action = fileActions && fileActions[actionId]
    ? fileActions[actionId]
    : await repo.getAction(String(orgId), actionId);
  if (!action) throw new Error(`action_not_found: ${actionId}`);
  
  // Check if this is a mock action with static_response
  const isMock = (action as any).isMock === true;
  const staticResponse = (action as any).static_response;
  
  if (isMock || staticResponse) {
    // Return mock/static response without making HTTP call
    let mockContent = staticResponse?.content ?? {};
    const mockStatus = staticResponse?.status ?? 200;
    const mockContentType = staticResponse?.content_type ?? 'application/json';
    const mockHeaders = staticResponse?.headers ?? {};

    // Interpolate variables in mock response (e.g., ${var.Amount}, ${preSteps.step.output.id})
    if (interpolationContext) {
      mockContent = interpolateDeep(mockContent, interpolationContext);
    }

    log?.({ t: new Date().toISOString(), type: 'mock_action', actionId, isMock, hasStaticResponse: !!staticResponse, content: mockContent, status: mockStatus });

    return {
      kind: typeof mockContent === 'string' ? 'text' : 'data',
      payload: mockContent,
      status: mockStatus,
      contentType: mockContentType,
      requestDetails: { method: 'MOCK', url: `mock://${actionId}`, isMock: true },
      responseHeaders: mockHeaders,
    } as any;
  }
  
  // Support both old transport.http structure and new top-level fields
  const t = (action as any).transport || {};
  const http = t.http || {};
  const method = String((action as any).method || http.method || 'GET').toUpperCase();
  const actionPath = (action as any).path || http.path || '';
  let baseUrl = http.base_url || http.full_url || '';
  let bindingResolved = false;
  
  // If no baseUrl found in action, try to resolve from ActionBinding
  if (!baseUrl) {
    try {
      let envId = environmentId;
      // If no environmentId provided, try to find the org-wide default environment
      if (!envId) {
        const defaultEnv = await repo.getDefaultEnvironment(String(orgId));
        if (defaultEnv) envId = String(defaultEnv.id);
        log?.({ t: new Date().toISOString(), type: 'action_binding_lookup', actionId, environmentId: envId, source: 'default_env' });
      } else {
        log?.({ t: new Date().toISOString(), type: 'action_binding_lookup', actionId, environmentId: envId, source: 'provided' });
      }
      if (envId) {
        const binding = await repo.getActionBinding(String(orgId), actionId, envId);
        if (binding?.baseUrl) {
          baseUrl = binding.baseUrl;
          bindingResolved = true;
          log?.({ t: new Date().toISOString(), type: 'action_binding_resolved', actionId, environmentId: envId, baseUrl, bindingId: binding.id });
        } else {
          log?.({ t: new Date().toISOString(), type: 'action_binding_not_found', actionId, environmentId: envId, hasBinding: !!binding, bindingHasBaseUrl: !!binding?.baseUrl });
        }
      } else {
        log?.({ t: new Date().toISOString(), type: 'action_binding_skip', actionId, reason: 'no_environment_id' });
      }
    } catch (e: any) {
      log?.({ t: new Date().toISOString(), type: 'action_binding_error', actionId, error: e?.message });
    }
  }
  
  const url = http.full_url || (baseUrl ? baseUrl + actionPath : '');
  if (!url && !actionPath) {
    // For real (non-mock) actions, a URL is required either from action config or ActionBinding
    log?.({ t: new Date().toISOString(), type: 'action_url_missing_details', actionId, hasPath: !!actionPath, hasBaseUrl: !!baseUrl, bindingResolved, environmentId, actionHasTransport: !!t.http, isMock: false });
    throw new Error(`action_binding_required: Action "${actionId}" requires an ActionBinding to provide a baseUrl, or configure the URL directly in the action settings.`);
  }
  let finalUrl = url || actionPath;
  const tpl = (s: string) => String(s).replace(/\{([^}]+)\}/g, (_, k) => (input && (input as any)[k] !== undefined) ? String((input as any)[k]) : `{${k}}`);
  finalUrl = tpl(finalUrl);
  let headers: Record<string,string> = {};

  // Merge headers from action (top-level) and http.headers (legacy)
  const actionHeaders = (action as any).headers || http.headers || {};
  if (actionHeaders && typeof actionHeaders === 'object') {
    for (const [k,v] of Object.entries(actionHeaders)) headers[String(k)] = tpl(String(v));
  }

  let finalAuthHeader = authHeader;
  const authRef = (action as any).authRef || (t as any).authRef;
  if (authRef && authBlocks && authBlocks[authRef]) {
    const block = authBlocks[authRef];
    const rootVars = { env: process.env, input };
    const hdr = await resolveAuthHeaderFromBlock(block, rootVars, log);
    if (hdr) finalAuthHeader = hdr;
  }

  if (finalAuthHeader && !headers['Authorization'] && !headers['authorization']) headers['Authorization'] = finalAuthHeader;

  let body: any = undefined;
  let reqUrl = finalUrl;

  if (method === 'GET') {
    reqUrl = appendQuery(finalUrl, input);
  } else {
    headers['content-type'] = headers['content-type'] || 'application/json';
    // Support both top-level body and http.body (legacy)
    const rawBody = (action as any).body !== undefined ? (action as any).body : ((http as any).body !== undefined ? (http as any).body : (input ?? {}));
    // Apply both {key} template replacement (for action body templates) and ${expr} interpolation
    const tplBody = (val: any): any => {
      if (val == null) return val;
      if (typeof val === 'string') {
        // First apply {key} replacement from input
        let result = val.replace(/\{([^}]+)\}/g, (_, k) => {
          const v = input && (input as any)[k];
          return v !== undefined ? String(v) : `{${k}}`;
        });
        return result;
      }
      if (Array.isArray(val)) return val.map(v => tplBody(v));
      if (typeof val === 'object') {
        const out: any = {};
        for (const [k, v] of Object.entries(val)) out[k] = tplBody(v);
        return out;
      }
      return val;
    };
    const templatedBody = tplBody(rawBody);
    // Then apply ${expr} interpolation for more complex expressions
    const resolvedBody = interpolateDeep(templatedBody, { input, ...input });
    body = headers['content-type'].includes('application/json') ? JSON.stringify(resolvedBody) : resolvedBody;
  }
  log?.({ t: new Date().toISOString(), type: 'action_exec', actionId, method, url: reqUrl, headers: { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : undefined }, body: body ? (typeof body === 'string' && body.length > 1000 ? body.slice(0, 1000) + '...' : body) : undefined });
  const resp = await fetch(reqUrl, { method, headers, body });
  const ct = resp.headers.get('content-type') || '';
  // Capture response headers
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((v, k) => { respHeaders[k] = v; });
  let payload: any = undefined;
  if (ct.includes('application/json') || ct.endsWith('+json')) payload = await resp.json().catch(()=> ({}));
  else payload = await resp.text().catch(()=> '');
  log?.({ t: new Date().toISOString(), type: 'action_result', actionId, status: resp.status, contentType: ct, responseHeaders: respHeaders, payload: typeof payload === 'string' && payload.length > 2000 ? payload.slice(0, 2000) + '...' : payload });
  return { kind: (typeof payload === 'string' ? 'text' : 'data'), payload, status: (resp as any).status, contentType: ct, requestDetails: { method, url: reqUrl, headers: { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : undefined }, body }, responseHeaders: respHeaders } as any;
}
