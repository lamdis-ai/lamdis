import { buildAuthExport } from './helpers.js';
import { isHostedActionsEnabled } from '../../lib/feature.js';

function resolvePublicBase() {
  const envBase = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  return 'https://lamdis.ai';
}

export function toJSONLD(org: any, mv: any) {
  const items = (mv.actions || []).map((a: any) => {
    const t = a.transport || {};
    const mode = t.mode || 'direct';
    const http = t.http || a.http || {};
    const full = http.full_url || a.http?.url;
    const base = http.base_url || a.http?.base_url;
    const path = http.path || a.http?.path || '';
    const isAbs = (u?: string) => !!u && /^https?:\/\//i.test(u);
    const vendor = isAbs(full) ? (full as string)
      : (base && path ? `${String(base).replace(/\/$/, '')}${String(path).startsWith('/') ? '' : '/'}${path}`
      : (typeof full === 'string' ? full : undefined));
  const publicBase = resolvePublicBase();
  const lamdis = `${publicBase}/hosted/${org.slug}/${a.id}`;
  const urlTemplate = (mode === 'direct') ? vendor : lamdis;
    const auth = buildAuthExport(org, a);
    const item: any = {
      '@type': 'EntryPoint',
      name: a.title,
      description: a.description,
      urlTemplate,
      httpMethod: (http.method || a.http?.method || 'GET').toUpperCase(),
      potentialAction: { '@type': 'Action', name: a.id },
    };
    if (auth) {
      item.additionalProperty = [
        {
          '@type': 'PropertyValue',
          name: 'auth',
          value: auth,
        }
      ];
    }
    return item;
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${org.name} Lamdis Manifest`,
    version: mv.semver,
    identifier: mv.digestSha256,
  url: `${resolvePublicBase()}/public/orgs/${org.slug}/manifests/lamdis.json?v=${mv.semver}`,
    distribution: items,
  };
}
