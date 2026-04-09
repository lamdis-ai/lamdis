export function buildAuthExport(org: any, action: any) {
  const auth = (action && (action.auth || {})) || {};
  if (!auth || !auth.type || auth.type === 'none') return undefined;
  // Normalize OAuth types: oauth2, oauth2-user
  const t = String(auth.type).toLowerCase();
  const isOAuth2 = t === 'oauth2' || t === 'oauth2-user' || t === 'oauth2_user';
  if (!isOAuth2) return auth;
  const providerKey = auth.provider;
  const cfg = providerKey ? ((org as any)?.integrations?.oauthProviders?.[providerKey] || {}) : {};
  const scopesArr = Array.isArray(auth.scopes)
    ? auth.scopes
    : (cfg.scopes ? String(cfg.scopes).split(/[\s,]+/).filter(Boolean) : undefined);
  const extras = cfg.extra_params || {};
  const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const slug = (org as any)?.slug || '';
  // Start from any existing link_instructions on the action auth
  const link_instructions: any = {
    ...(auth?.link_instructions || {}),
    authorization_url: (auth as any)?.link_instructions?.authorization_url || cfg.authorize_url,
    token_url: (auth as any)?.link_instructions?.token_url || cfg.token_url,
    docs_url: (auth as any)?.link_instructions?.docs_url || extras.docs_url,
    supports_device_code: (auth as any)?.link_instructions?.supports_device_code ?? !!(extras.supports_device_code || extras.device_authorization_url),
    device_authorization_url: (auth as any)?.link_instructions?.device_authorization_url || extras.device_authorization_url,
    prompt: (auth as any)?.link_instructions?.prompt || extras.prompt,
    // Concrete helper URLs for agents/clients
    connect_url: (providerKey && slug) ? `${publicBase}/public/orgs/${slug}/oauth/start/${encodeURIComponent(providerKey)}` : (auth as any)?.link_instructions?.connect_url,
    status_url: (providerKey && slug) ? `${publicBase}/public/orgs/${slug}/oauth/status/${encodeURIComponent(providerKey)}` : (auth as any)?.link_instructions?.status_url,
    revoke_url: (providerKey && slug) ? `${publicBase}/public/orgs/${slug}/oauth/revoke/${encodeURIComponent(providerKey)}` : (auth as any)?.link_instructions?.revoke_url,
  };
  // remove undefineds to keep manifest tidy
  for (const k of Object.keys(link_instructions)) {
    if (link_instructions[k] === undefined || link_instructions[k] === null) delete link_instructions[k];
  }
  const out: any = { ...auth };
  if (scopesArr) out.scopes = scopesArr;
  if (Object.keys(link_instructions).length) out.link_instructions = link_instructions;
  return out;
}
