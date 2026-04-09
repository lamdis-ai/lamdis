import { buildAuthExport } from './helpers.js';
import { isHostedActionsEnabled } from '../../lib/feature.js';

function resolvePublicBase() {
  const envBase = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  return 'https://lamdis.ai';
}

export function toOpenAPI(org: any, mv: any) {
  // Helper to resolve transport settings with backward-compat for legacy `http`
  const resolveTransport = (a: any) => {
    const t = a.transport || {};
    const mode = t.mode || 'direct';
    const http = t.http || a.http || {};
    const method = (http.method || a.http?.method || 'GET').toLowerCase();
    const full = http.full_url || a.http?.url;
    const base = http.base_url || a.http?.base_url;
    const path = http.path || a.http?.path || full || '/';
    return { mode, http: { method, full, base, path } };
  };

  const paths: any = {};
  const servers: Record<string, { url: string }> = {};

  for (const a of mv.actions || []) {
    const { mode, http } = resolveTransport(a);
    const auth = buildAuthExport(org, a);
    if (mode === 'direct') {
      // Vendor-first: use per-operation servers or absolute URLs
      const isAbs = (u: string | undefined) => !!u && /^https?:\/\//i.test(u);
      let opServers: any = undefined;
      let p = '/';
      if (isAbs(http.full)) {
        const u = new URL(http.full as string);
        opServers = [{ url: u.origin }];
        p = u.pathname || '/';
      } else {
        const origin = http.base && isAbs(http.base) ? http.base : '';
        opServers = origin ? [{ url: origin }] : undefined;
        p = (http.full && !isAbs(http.full) ? http.full : (http.path || '/')) || '/';
      }
      paths[p] = paths[p] || {};
      paths[p][http.method] = {
        summary: a.title,
        description: a.description,
        servers: opServers,
        'x-transport-mode': mode,
        ...(auth ? { 'x-auth': auth } : {}),
      };
    } else {
      // Hosted/Proxy: always include and point to Lamdis hosted path
      const lamdisOrigin = resolvePublicBase();
      servers[lamdisOrigin] = { url: lamdisOrigin };
      const p = `/hosted/${org.slug}/${a.id}`;
      paths[p] = paths[p] || {};
      paths[p][http.method] = {
        summary: a.title,
        description: a.description,
        'x-transport-mode': mode,
        ...(auth ? { 'x-auth': auth } : {}),
      };
    }
  }

  const serverList = Object.values(servers);
  return {
    openapi: '3.1.0',
    info: { title: `${org.name} Actions`, version: mv.semver },
    servers: serverList.length ? serverList : undefined,
    paths,
  };
}
