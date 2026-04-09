import { buildAuthExport } from './helpers.js';
import { isHostedActionsEnabled } from '../../lib/feature.js';

function resolvePublicBase() {
  const envBase = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  // Default to public domain to ensure stable URLs in exports and tests
  return 'https://lamdis.ai';
}

export function toMCP(org: any, mv: any) {
  const publicBase = resolvePublicBase();
  const resolveTransport = (a: any) => {
    const t = a.transport || {};
    const mode: 'direct'|'hosted'|'proxy' = t.mode || 'direct';
    const http = t.http || a.http || {};
    const full = http.full_url || a.http?.url;
    const base = http.base_url || a.http?.base_url;
    const path = http.path || a.http?.path;
    const isAbs = (u?: string) => !!u && /^https?:\/\//i.test(u);
    const vendorUrl = (() => {
      if (isAbs(full)) return full as string;
      if (base && path) return `${String(base).replace(/\/$/, '')}${String(path).startsWith('/') ? '' : '/'}${path}`;
      if (typeof full === 'string') return full; // allow relative path
      return undefined;
    })();
  const lamdisUrl = `${publicBase.replace(/\/$/, '')}/hosted/${org.slug}/${a.id}`;
    // If hosted mode but feature is disabled, allow lamdisUrl only for static_response actions; otherwise use vendorUrl
    const hasStatic = Boolean((a as any).static_response);
    const url = (mode === 'direct') ? vendorUrl : lamdisUrl;
    return { mode, url };
  };

  // Build primary tools
  const provs = mv.providers || {};
  const primary = (mv.actions || []).map((a: any) => {
      // If this action references a provider in lamdis-managed mode, force hosted
      const authCfg = (a as any).auth || {};
      const p = authCfg?.provider && provs[authCfg.provider]?.mode === 'lamdis';
      const forcedMode: 'direct'|'hosted' = p ? 'hosted' : ((a.transport?.mode as any) || 'direct');
      const { url } = resolveTransport(p ? { ...a, transport: { ...(a.transport||{}), mode: 'hosted' } } : a);
      const auth = p ? undefined : buildAuthExport(org, a);
      return {
        name: a.id,
        description: a.description || a.title,
        // Non-standard extension: include transport.url for agent routing
        transport: { url, mode: forcedMode },
        auth, // Non-standard extension: informs capable agents how to obtain OAuth/apiKey
        input_schema: (() => {
          const schema = a.input_schema || { type: 'object' };
          try {
            if (a.input_schema_description && schema && typeof schema === 'object' && !Array.isArray(schema)) {
              (schema as any).description = a.input_schema_description;
            }
          } catch {}
            return schema;
          })(),
      };
    });

  // Inject helper tools per provider: Connect/Status/Revoke
  const helpers: any[] = [];
  for (const key of Object.keys(provs)) {
    const meta = provs[key] || { mode: 'agent', scopes: [] };
  const link = `${publicBase.replace(/\/$/, '')}/public/orgs/${org.slug}/oauth/start/${encodeURIComponent(key)}`; // UI-facing link
    helpers.push({
      name: `connect_${key}`,
      description: `Connect your "${key}" account to continue.`,
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
  transport: { mode: 'direct', url: link }, // agents that can open links can use this; others can render the URL
      auth: { required: false },
    });
    helpers.push({
      name: `auth_status_${key}`,
      description: `Auth status for "${key}" (linked and scopes).`,
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
  transport: { mode: 'hosted', url: `${publicBase.replace(/\/$/, '')}/public/orgs/${org.slug}/oauth/status/${encodeURIComponent(key)}` },
      auth: { required: false },
    });
    helpers.push({
      name: `revoke_${key}`,
      description: `Revoke "${key}" authorization.`,
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
  transport: { mode: 'hosted', url: `${publicBase.replace(/\/$/, '')}/public/orgs/${org.slug}/oauth/revoke/${encodeURIComponent(key)}` },
      auth: { required: false },
    });
  }

  return { name: org.name, version: mv.semver, tools: [...helpers, ...primary] };
}
