import type { FastifyPluginAsync } from 'fastify';
// NOTE: File contained a temporary duplicate plugin; cleaned to single export.
// New lightweight discovery endpoints added inside main plugin further below.
import { canPubliclyAccessAgent, canPubliclyAccessManifest, projectPublicAgent, projectPublicManifest } from '../lib/visibility.js';
import crypto from 'crypto';
import { eq, and, or, inArray, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations, manifests, manifestVersions, manifestAccessLogs, actions, actionTemplates, providerTemplates, actionPacks } from '@lamdis/db/schema';
import { knowledgeArticles } from '@lamdis/db/schema';
import { hostedActionInvocations } from '@lamdis/db/schema';
import { toOpenAPI } from '../services/exporters/openapi.js';
import { toMCP } from '../services/exporters/mcp.js';
import { toJSONLD } from '../services/exporters/jsonld.js';
import { toA2AAgentCard } from '../services/exporters/a2a.js';
import { buildAuthExport } from '../services/exporters/helpers.js';
import { isHostedActionsEnabled } from '../lib/feature.js';
import { isPrivateHost } from '../services/hosted/ssrf-guard.js';

// Simple UUID-ish validation (replaces mongoose.isValidObjectId)
function isValidUUID(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function resolvePublicBase() {
  const envBase = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return 'https://api.lamdis.ai';
  return `http://localhost:${process.env.PORT || 3001}`;
}

const routes: FastifyPluginAsync = async (app) => {
  // Apply permissive CORS and CORP headers to all responses under this plugin
  app.addHook('onSend', (req, reply, payload, done) => {
    try {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      const acrh = (req.headers['access-control-request-headers'] as string) || 'Content-Type, Authorization, Accept, Accept-Encoding, Accept-Language, Origin';
      reply.header('Access-Control-Allow-Headers', acrh);
      reply.header('Access-Control-Expose-Headers', 'lamdis-manifest-digest, lamdis-verification, ETag');
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      reply.header('Timing-Allow-Origin', '*');
      reply.header('Vary', 'Origin');
    } catch {}
    done(null, payload);
  });
  // Handle CORS preflight for all public endpoints under this plugin
  app.options('/*', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    const acrh = (req.headers['access-control-request-headers'] as string) || 'Content-Type, Authorization, Accept, Accept-Encoding, Accept-Language, Origin';
    reply.header('Access-Control-Allow-Headers', acrh);
    reply.header('Access-Control-Max-Age', '86400');
    reply.header('Access-Control-Expose-Headers', 'lamdis-manifest-digest, lamdis-verification, ETag');
    return reply.code(204).send();
  });

  async function sendWithHeaders(reply: any, body: any, digest: string) {
    const etag = `W/"${digest}"`;
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, max-age=600');
    reply.header('lamdis-manifest-digest', `sha256-${digest}`);
    // Make public manifests easy to fetch by browser-based agents
    // Allow cross-origin resource loading and broad CORS without credentials
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Accept-Encoding, Accept-Language, Origin');
    reply.header('Access-Control-Expose-Headers', 'lamdis-manifest-digest, lamdis-verification, ETag');
    reply.header('Timing-Allow-Origin', '*');
    // Basic verification header from org primary domain (if present)
    try {
      const org = (reply as any).locals?.org as any;
      const d = org?.domains?.find((x: any) => x.primary) || null;
      const v = d?.verification || {};
      const val = d ? `domain=${d.value}; status=${v.status || 'unverified'}; strength=${v.strength || 'none'}` : 'domain=; status=unverified; strength=none';
      reply.header('lamdis-verification', val);
    } catch {}
    return body;
  }

  function hashIp(ip: string | undefined) {
    if (!ip) return undefined;
    const salt = process.env.IP_HASH_SALT || 'lamdis';
    return crypto.createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0,32);
  }

  async function logAccess(pathType: 'lamdis'|'openapi'|'mcp'|'schemaorg'|'wellknown', org: any, mv: any | null, req: any, digest?: string) {
    try {
      await db.insert(manifestAccessLogs).values({
        orgId: org.id,
        manifestVersionId: mv?.id,
        slug: org.slug,
        pathType,
        digest: digest || mv?.digestSha256,
        ua: req.headers['user-agent'] as string | undefined,
        ipHash: hashIp((req.ip || req.socket?.remoteAddress || '').replace('::ffff:','')),
        ts: new Date()
      });
    } catch {/* ignore */}
  }

  async function loadOrg(slugOrId: string) {
    if (isValidUUID(slugOrId)) {
      const [byId] = await db.select().from(organizations).where(eq(organizations.id, slugOrId)).limit(1);
      if (byId) return byId;
    }
    const [bySlug] = await db.select().from(organizations).where(eq(organizations.slug, slugOrId)).limit(1);
    return bySlug ?? null;
  }

  async function resolveManifestId(orgId: string, m: string | undefined) {
    if (m) {
      const [bySlug] = await db.select().from(manifests).where(and(eq(manifests.orgId, orgId), eq(manifests.slug, String(m)))).limit(1);
      if (bySlug) return bySlug.id;
      if (isValidUUID(String(m))) return String(m);
    } else {
      const [def] = await db.select().from(manifests).where(and(eq(manifests.orgId, orgId), eq(manifests.isDefault, true))).limit(1);
      if (def) return def.id;
    }
    return null;
  }

  async function loadManifestVersion(orgId: string, manifestId: string | null, v: string | undefined) {
    if (v && v !== 'active') {
      const [mv] = await db.select().from(manifestVersions).where(
        and(eq(manifestVersions.orgId, orgId), ...(manifestId ? [eq(manifestVersions.manifestId, manifestId)] : []), eq(manifestVersions.semver, v))
      ).limit(1);
      return mv ?? null;
    }
    const [mv] = await db.select().from(manifestVersions).where(
      and(eq(manifestVersions.orgId, orgId), ...(manifestId ? [eq(manifestVersions.manifestId, manifestId)] : []))
    ).orderBy(desc(manifestVersions.createdAt)).limit(1);
    return mv ?? null;
  }

  app.get('/orgs/:slug/manifests/lamdis.json', async (req, reply) => {
    // config: rate limiting metadata
    try { (reply as any).context.config = { rateLimit: { max: 120, timeWindow: '1 minute' } }; } catch {}
    const { slug } = req.params as any;
    const { v, m } = (req.query as any) || {};
    const org = await loadOrg(slug);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const manifestId = await resolveManifestId(org.id, m);
    // If no explicit version provided, serve latest by manifest (if selected) or org
    const mv = await loadManifestVersion(org.id, manifestId, v);
    (reply as any).locals = { org };
    if (!mv) return reply.code(404).send({ error: v ? 'Version not found' : 'No manifest versions' });
    // Inject helper tools per provider
    const provs = (mv as any).providers || {};
  const publicBase = resolvePublicBase();
    const helperActions = Object.keys(provs).map((key) => ({
      id: `connect_${key}`,
      title: `Connect ${key}`,
      description: `Connect your "${key}" account to continue.`,
      transport: { mode: 'direct', authority: 'vendor', http: { method: 'GET', full_url: `${publicBase}/public/orgs/${slug}/oauth/start/${encodeURIComponent(key)}` } },
      auth: { required: false },
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    }));
    const mvActions = (mv.actions || []) as any[];
    const actionsList = [...helperActions, ...mvActions.map((a: any) => ({
      ...a,
      transport: {
        mode: (a.transport?.mode || 'direct'),
        authority: (a.transport?.authority || ((a.transport?.mode||'direct')==='direct'?'vendor':'lamdis')),
        http: (a.transport?.http || a.http || {}),
      },
      auth: buildAuthExport(org, a) || a.auth,
    }))];
  const digest = mv.digestSha256;
  const resp = { lamdis_version: '1.0.0', business: { org_id: String(org.id), name: org.name, domain: org.slug }, actions: actionsList };
  queueMicrotask(()=> logAccess('lamdis', org, mv, req, digest));
  return sendWithHeaders(reply, resp, digest);
  });

  app.get('/orgs/:slug/manifests/openapi.json', async (req, reply) => {
    try { (reply as any).context.config = { rateLimit: { max: 120, timeWindow: '1 minute' } }; } catch {}
    const { slug } = req.params as any; const { v, m } = (req.query as any) || {};
    const org = await loadOrg(slug); if (!org) return reply.code(404).send({ error: 'Org not found' });
    const manifestId = await resolveManifestId(org.id, m);
    const mv = await loadManifestVersion(org.id, manifestId, v);
    if (!mv) return reply.code(404).send({ error: v ? 'Version not found' : 'No manifest versions' });
  (reply as any).locals = { org };
    const doc = toOpenAPI(org, mv);
  queueMicrotask(()=> logAccess('openapi', org, mv, req, mv.digestSha256));
  return sendWithHeaders(reply, doc, mv.digestSha256);
  });

  app.get('/orgs/:slug/manifests/mcp.json', async (req, reply) => {
    try { (reply as any).context.config = { rateLimit: { max: 120, timeWindow: '1 minute' } }; } catch {}
    const { slug } = req.params as any; const { v, m } = (req.query as any) || {};
    const org = await loadOrg(slug); if (!org) return reply.code(404).send({ error: 'Org not found' });
    const manifestId = await resolveManifestId(org.id, m);
    const mv = await loadManifestVersion(org.id, manifestId, v);
    if (!mv) return reply.code(404).send({ error: v ? 'Version not found' : 'No manifest versions' });
  (reply as any).locals = { org };
    const doc = toMCP(org, mv);
  queueMicrotask(()=> logAccess('mcp', org, mv, req, mv.digestSha256));
  return sendWithHeaders(reply, doc, mv.digestSha256);
  });

  app.get('/orgs/:slug/manifests/a2a.json', async (req, reply) => {
    try { (reply as any).context.config = { rateLimit: { max: 120, timeWindow: '1 minute' } }; } catch {}
    const { slug } = req.params as any; const { v, m } = (req.query as any) || {};
    const org = await loadOrg(slug); if (!org) return reply.code(404).send({ error: 'Org not found' });
    const manifestId = await resolveManifestId(org.id, m);
    const mv = v
      ? await (async () => { const [r] = await db.select().from(manifestVersions).where(and(eq(manifestVersions.orgId, org.id), ...(manifestId ? [eq(manifestVersions.manifestId, manifestId)] : []), eq(manifestVersions.semver, v))).limit(1); return r ?? null; })()
      : await (async () => { const [r] = await db.select().from(manifestVersions).where(and(eq(manifestVersions.orgId, org.id), ...(manifestId ? [eq(manifestVersions.manifestId, manifestId)] : []))).orderBy(desc(manifestVersions.createdAt)).limit(1); return r ?? null; })();
    if (!mv) return reply.code(404).send({ error: v ? 'Version not found' : 'No manifest versions' });
    (reply as any).locals = { org };
    const doc = toA2AAgentCard(org, mv, { streaming: true });
    queueMicrotask(()=> logAccess('lamdis', org, mv, req, mv.digestSha256));
    return sendWithHeaders(reply, doc, mv.digestSha256);
  });

  // Well-known aliases for A2A Agent Card (served via Lamdis public base for org slugs)
  app.get('/orgs/:slug/.well-known/agent-card.json', async (req, reply) => {
    try { (reply as any).context.config = { rateLimit: { max: 120, timeWindow: '1 minute' } }; } catch {}
    const { slug } = req.params as any; const { v } = (req.query as any) || {};
    const org = await loadOrg(slug); if (!org) return reply.code(404).send({ error: 'Org not found' });
    const mv = v
      ? await (async () => { const [r] = await db.select().from(manifestVersions).where(and(eq(manifestVersions.orgId, org.id), eq(manifestVersions.semver, v))).limit(1); return r ?? null; })()
      : await (async () => { const [r] = await db.select().from(manifestVersions).where(eq(manifestVersions.orgId, org.id)).orderBy(desc(manifestVersions.createdAt)).limit(1); return r ?? null; })();
    if (!mv) return reply.code(404).send({ error: v ? 'Version not found' : 'No manifest versions' });
    (reply as any).locals = { org };
    const doc = toA2AAgentCard(org, mv, { streaming: true });
    queueMicrotask(()=> logAccess('wellknown', org, mv, req, mv.digestSha256));
    return sendWithHeaders(reply, doc, mv.digestSha256);
  });
  // Additional well-known to improve interoperability with scanners/agents
  app.get('/.well-known/security.txt', async (_req, reply) => {
    reply.header('Content-Type', 'text/plain');
    const lines = [
      'Contact: mailto:security@lamdis.ai',
      'Policy: https://lamdis.ai/security',
      'Preferred-Languages: en',
      `Expires: ${new Date(Date.now() + 90*24*3600*1000).toUTCString()}`
    ];
    return lines.join('\n');
  });
  app.get('/orgs/:slug/.well-known/agent.json', async (req, reply) => {
    try { (reply as any).context.config = { rateLimit: { max: 120, timeWindow: '1 minute' } }; } catch {}
    const { slug } = req.params as any; const { v } = (req.query as any) || {};
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const mv = v
      ? await (async () => { const [r] = await db.select().from(manifestVersions).where(and(eq(manifestVersions.orgId, org.id), eq(manifestVersions.semver, v))).limit(1); return r ?? null; })()
      : await (async () => { const [r] = await db.select().from(manifestVersions).where(eq(manifestVersions.orgId, org.id)).orderBy(desc(manifestVersions.createdAt)).limit(1); return r ?? null; })();
    if (!mv) return reply.code(404).send({ error: v ? 'Version not found' : 'No manifest versions' });
    (reply as any).locals = { org };
    const doc = toA2AAgentCard(org, mv, { streaming: true });
    queueMicrotask(()=> logAccess('wellknown', org, mv, req, mv.digestSha256));
    return sendWithHeaders(reply, doc, mv.digestSha256);
  });

  // OAuth helper proxy endpoints (public): start link, status, revoke
  app.get('/orgs/:slug/oauth/start/:provider', async (req, reply) => {
    const { slug, provider } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
  const apiBase = process.env.API_BASE_URL || resolvePublicBase();
    const url = `${apiBase}/orgs/${org.id}/oauth/${encodeURIComponent(provider)}/start`;
    return reply.redirect(url);
  });
  app.get('/orgs/:slug/oauth/status/:provider', async (req, reply) => {
    const { slug, provider } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const [mv] = await db.select().from(manifestVersions).where(eq(manifestVersions.orgId, org.id)).orderBy(desc(manifestVersions.createdAt)).limit(1);
    if (!mv) return reply.code(404).send({ error: 'No manifest' });
    // Reuse internal status route
  const apiBase = process.env.API_BASE_URL || resolvePublicBase();
  const resp = await fetch(`${apiBase}/orgs/${org.id}/oauth/${encodeURIComponent(provider)}/status`);
    const body = await resp.text();
    reply.code(resp.status);
    try { return JSON.parse(body); } catch { return body; }
  });

  // Hosted execution endpoint for actions marked as hosted (instrumented)
  app.all('/hosted/:slug/:actionId', async (req, reply) => {
    const { slug, actionId } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const [a] = await db.select().from(actions).where(and(eq(actions.orgId, org.id), eq(actions.actionId, actionId), eq(actions.enabled, true))).limit(1);
    if (!a) return reply.code(404).send({ error: 'Action not found' });
    const mode = (a.transport as any)?.mode || 'direct';
    if (mode === 'direct') return reply.code(400).send({ error: 'Action is not hosted' });

    const started = Date.now();
    let statusCode: number | undefined; let success = false; let errorMessage: string | undefined; let responseSize: number | undefined;
    const record = async () => {
      try {
        const durationMs = Date.now() - started;
        await db.insert(hostedActionInvocations).values({
          orgId: org.id,
          actionKey: a.actionId,
          providerKey: (a as any).provider?.key,
          mode: 'lamdis',
          startedAt: new Date(started),
          durationMs,
          statusCode: statusCode ?? 0,
          success,
          prompt: undefined,
          requestSize: req.headers['content-length'] ? parseInt(String(req.headers['content-length']),10)||undefined : undefined,
          responseSize,
          errorMessage
        });
      } catch (e) { app.log.warn({ err: e }, 'hosted invocation log failed'); }
    };
    // We rely on explicit queueMicrotask(record) calls below on each code path

  // If action defines a static_response, serve it directly (always allowed)
    if (a && a.staticResponse) {
      const sr = a.staticResponse || {};
      const status = typeof sr.status === 'number' ? sr.status : 200;
      const ct = typeof sr.content_type === 'string' ? sr.content_type : 'text/plain';
      reply.code(status);
      reply.header('Content-Type', ct);
      const c = sr.content;
      statusCode = status; success = true;
      const out = (c == null) ? '' : (typeof c === 'object' ? c : String(c));
      queueMicrotask(record);
      return out;
    }

    // If action references a knowledge article, serve that content
    if ((a.knowledgeRef as any)?.id) {
      try {
        const kid = String((a.knowledgeRef as any).id);
        const [art] = await db.select().from(knowledgeArticles).where(and(eq(knowledgeArticles.orgId, org.id), eq(knowledgeArticles.articleId, kid))).limit(1);
        if (!art) return reply.code(404).send({ error: 'knowledge_not_found' });
        const status = 200;
        const ct = art.contentType || 'text/plain';
        reply.code(status);
        reply.header('Content-Type', ct);
        statusCode = status; success = true;
        const out = (art.content == null) ? '' : (typeof art.content === 'object' ? art.content : String(art.content));
        queueMicrotask(record);
        return out;
      } catch (e: any) {
        statusCode = 500; success = false; errorMessage = e?.message;
        queueMicrotask(record);
        return reply.code(500).send({ error: 'knowledge_error', message: errorMessage });
      }
    }

    // If action defines hosted script, execute it
    if ((a as any).hosted && (a as any).hosted.code && ((a.transport as any)?.mode || 'direct') !== 'direct') {
      // Beta gate: hosted code execution requires feature flag
      if (!isHostedActionsEnabled()) {
        return reply.code(404).send({ error: 'Not found' });
      }
      try {
        const input = (req.method === 'GET' || req.method === 'HEAD') ? (req.query || {}) : (req.body || {});
        const { executeHostedJS } = await import('../services/hosted/executor.js');
        const res = await executeHostedJS({
          code: String((a as any).hosted.code || ''),
          input,
          permissions: { net_allow: ((a as any).hosted.permissions?.net_allow || []), env: ((a as any).hosted.permissions?.env || []) },
          timeoutMs: Number((a as any).hosted.timeout_ms || 6000)
        });
        const status = res.status || (res.ok ? 200 : 500);
        reply.code(status);
        statusCode = status; success = !!res.ok; errorMessage = res.ok ? undefined : res.error;
  if (res.ok) {
          if (res.contentType) reply.header('Content-Type', res.contentType);
          const out = (res.body == null) ? '' : res.body;
          const size = typeof out === 'string' ? Buffer.byteLength(out) : (typeof out === 'object' ? Buffer.byteLength(JSON.stringify(out)) : undefined);
          responseSize = size;
          queueMicrotask(record);
          return out;
        } else {
          // Ensure useful error details for clients
          reply.header('Content-Type', 'application/json');
          // Derive additional diagnostics from stored code when missing
          const stored = String((a as any).hosted?.code || '');
          const storedPreview = stored.slice(0, 240);
          let nonAscii: Array<{ i: number; ch: string; code: number }> = [];
          for (let i = 0; i < Math.min(240, stored.length); i++) {
            const c = stored[i];
            const code = c.charCodeAt(0);
            if (code > 127) { nonAscii.push({ i, ch: c, code }); if (nonAscii.length >= 8) break; }
          }
          // Detect lines starting with a bare '/'
          let leadingSlashLine: { line: number; text: string } | undefined;
          const lines = stored.split(/\r?\n/);
          for (let idx = 0; idx < Math.min(lines.length, 50); idx++) {
            const raw = lines[idx];
            const t = raw.replace(/^\s+/, '');
            if (t.startsWith('/') && !t.startsWith('//') && !t.startsWith('/*')) { leadingSlashLine = { line: idx + 1, text: raw.slice(0, 120) }; break; }
          }
          const payload = {
            ok: false,
            error: res.error || 'Hosted script failed',
            logs: res.logs || [],
            ...(res as any).name ? { name: (res as any).name } : {},
            ...(res as any).stack ? { stack: (res as any).stack } : {},
            // Always include preview, prefer executor-provided but fall back to stored
            preview: (res as any).preview || storedPreview,
            ...(res as any).line ? { line: (res as any).line } : {},
            ...(res as any).column ? { column: (res as any).column } : {},
            ...(res as any).pos ? { pos: (res as any).pos } : {},
            ...(res as any).code ? { code: (res as any).code } : {},
            // Heuristics
            ...(nonAscii.length ? { non_ascii_hint: nonAscii } : {}),
            ...(leadingSlashLine ? { leading_slash_line: leadingSlashLine } : {}),
          };
          try { app.log.error({ orgId: org.id, actionId: a.actionId, hostedError: payload, kind: 'hosted-script-failure' }, 'Hosted script failed'); } catch {}
          const size = Buffer.byteLength(JSON.stringify(payload));
          responseSize = size;
          queueMicrotask(record);
          return payload;
        }
      } catch (e: any) {
        statusCode = 500; success = false; errorMessage = e?.message || 'Hosted script failed';
        queueMicrotask(record);
        return reply.code(500).send({ error: errorMessage });
      }
    }

    // Fallback: proxy to vendor URL if configured (hosted proxy minimal)
    // Only allowed when hosted feature is enabled to avoid unintended exposure
    if (!isHostedActionsEnabled()) {
      return reply.code(404).send({ error: 'Not found' });
    }
    const http = ((a.transport as any)?.http || (a as any).http || {});
    const method = (http.method || req.method || 'GET').toUpperCase();
    const full = http.full_url || (a as any).http?.url;
  if (!full) return reply.code(400).send({ error: 'No vendor URL configured' });
    try {
      const vendorUrl = new URL(full);
      if (isPrivateHost(vendorUrl.hostname)) {
        return reply.code(403).send({ error: 'Access to private/internal hosts is blocked' });
      }
      const headers: Record<string,string> = { 'Accept': 'application/json' };
      // merge static action headers
      if (http.headers && typeof http.headers === 'object') {
        for (const [k,v] of Object.entries(http.headers)) {
          if (typeof v === 'string') headers[k] = v;
        }
      }
      let body: any = undefined;
      if (method !== 'GET' && method !== 'HEAD') {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const resp = await fetch(full, { method, headers, body, signal: controller.signal });
      const text = await resp.text();
      clearTimeout(timeout);
      reply.code(resp.status);
      const ct = resp.headers.get('content-type') || '';
      if (ct) reply.header('Content-Type', ct);
      statusCode = resp.status; success = resp.ok;
  const respBody = (()=>{ try { return JSON.parse(text); } catch { return text; } })();
  const payloadSize = typeof text === 'string' ? Buffer.byteLength(text) : undefined; responseSize = payloadSize;
      queueMicrotask(()=> record());
      return respBody;
    } catch (e: any) {
      statusCode = 500; errorMessage = e?.message; success = false;
      queueMicrotask(record);
      return reply.code(500).send({ error: e?.message || 'Hosted call failed' });
    }
  });

  app.post('/orgs/:slug/oauth/revoke/:provider', async (req, reply) => {
    const { slug, provider } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const resp = await fetch(`${apiBase}/orgs/${org.id}/oauth/${encodeURIComponent(provider)}/revoke`, { method: 'POST' });
    const body = await resp.text();
    reply.code(resp.status);
    try { return JSON.parse(body); } catch { return body; }
  });

  app.get('/orgs/:slug/manifests/schemaorg.jsonld', async (req, reply) => {
    try { (reply as any).context.config = { rateLimit: { max: 120, timeWindow: '1 minute' } }; } catch {}
    const { slug } = req.params as any; const { v, m } = (req.query as any) || {};
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const manifestId = await resolveManifestId(org.id, m);
    const mv = await loadManifestVersion(org.id, manifestId, v);
    if (!mv) return reply.code(404).send({ error: v ? 'Version not found' : 'No manifest versions' });
    const doc = toJSONLD(org, mv);
  queueMicrotask(()=> logAccess('schemaorg', org, mv, req, mv.digestSha256));
  return sendWithHeaders(reply, doc, mv.digestSha256);
  });

  // Site hooks generators
  app.get('/orgs/:slug/sitehooks/well-known', async (req, reply) => {
    const { slug } = req.params as any; const { v } = (req.query as any) || {};
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
  const mv = v
    ? await (async () => { const [r] = await db.select().from(manifestVersions).where(and(eq(manifestVersions.orgId, org.id), eq(manifestVersions.semver, v))).limit(1); return r ?? null; })()
    : await (async () => { const [r] = await db.select().from(manifestVersions).where(eq(manifestVersions.orgId, org.id)).orderBy(desc(manifestVersions.createdAt)).limit(1); return r ?? null; })();
  const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const openapiUrl = `${publicBase}/public/orgs/${slug}/manifests/openapi.json?v=${mv?.semver}`;
    const snippet = `# .well-known redirect (example for Netlify/Static config)\n[[redirects]]\n  from = "/.well-known/lamdis"\n  to = "${openapiUrl}"\n  status = 308`;
  queueMicrotask(()=> logAccess('wellknown', org, mv, req, mv?.digestSha256));
  return { snippet };
  });

  app.get('/orgs/:slug/sitehooks/meta', async (req, reply) => {
    const { slug } = req.params as any; const { v } = (req.query as any) || {};
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const mv = v
      ? await (async () => { const [r] = await db.select().from(manifestVersions).where(and(eq(manifestVersions.orgId, org.id), eq(manifestVersions.semver, v))).limit(1); return r ?? null; })()
      : await (async () => { const [r] = await db.select().from(manifestVersions).where(eq(manifestVersions.orgId, org.id)).orderBy(desc(manifestVersions.createdAt)).limit(1); return r ?? null; })();
  const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const openapiUrl = `${publicBase}/public/orgs/${slug}/manifests/openapi.json?v=${mv?.semver}`;
    const tag = `<link rel="lamdis-manifest" href="${openapiUrl}" integrity="sha256-${mv?.digestSha256}">`;
  queueMicrotask(()=> logAccess('wellknown', org, mv, req, mv?.digestSha256));
  return { tag };
  });

  app.get('/orgs/:slug/sitehooks/jsonld-embed', async (req, reply) => {
    const { slug } = req.params as any; const { v } = (req.query as any) || {};
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const mv = v
      ? await (async () => { const [r] = await db.select().from(manifestVersions).where(and(eq(manifestVersions.orgId, org.id), eq(manifestVersions.semver, v))).limit(1); return r ?? null; })()
      : await (async () => { const [r] = await db.select().from(manifestVersions).where(eq(manifestVersions.orgId, org.id)).orderBy(desc(manifestVersions.createdAt)).limit(1); return r ?? null; })();
    const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: `${org.name} Actions`,
      url: `${publicBase}/orgs/${slug}/actions`,
    };
    const tag = `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`;
    return { tag };
  });

  // Public: list provider templates that have stored logo keys (for marketing pages)
  app.get('/providers-with-logos', async () => {
    const list = await db.select({
      key: providerTemplates.key,
      name: providerTemplates.name,
      logoS3Key: providerTemplates.logoS3Key,
    }).from(providerTemplates)
      .where(sql`${providerTemplates.logoS3Key} IS NOT NULL AND ${providerTemplates.logoS3Key} != ''`)
      .orderBy(asc(providerTemplates.key));
    return { providers: list, count: list.length, updatedAt: new Date().toISOString() };
  });

  // Public: action packs (filter by optional category/industry)
  app.get('/action-packs', async (req) => {
    const { category, industry } = (req.query || {}) as any;
    const conditions = [
      inArray(actionPacks.visibility, ['public','unlisted']),
      eq(actionPacks.status, 'active'),
    ];
    if (category) conditions.push(eq(actionPacks.category, category));
    if (industry) conditions.push(eq(actionPacks.industry, industry));
    const packs = await db.select().from(actionPacks).where(and(...conditions)).orderBy(asc(actionPacks.category), asc(actionPacks.industry), asc(actionPacks.title));
    return { packs, count: packs.length };
  });

  app.get('/action-packs/:key', async (req, reply) => {
    const { key } = req.params as any;
    const [pack] = await db.select().from(actionPacks).where(and(eq(actionPacks.key, key), inArray(actionPacks.visibility, ['public','unlisted']), eq(actionPacks.status, 'active'))).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Not found' });
    return { pack };
  });

  // Authenticated (session/org) apply action pack -> materialize actions for org
  // NOTE: Kept inside public routes file for now; a future refactor can move to dedicated packs route.
  app.post('/orgs/:orgId/action-packs/:key/apply', async (req, reply) => {
    const { orgId, key } = req.params as any;
    const { context = {}, skipped = [] } = (req.body || {}) as any;
    // Basic org ownership check (public endpoint but requires valid org id)
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
  const [packDoc] = await db.select().from(actionPacks).where(and(eq(actionPacks.key, key), inArray(actionPacks.visibility, ['public','unlisted']), eq(actionPacks.status, 'active'))).limit(1);
  if (!packDoc) return reply.code(404).send({ error: 'Pack not found' });
  const pack = packDoc as any as { key: string; version?: string; actions?: { key: string }[] };

    // Fetch templates for pack action keys
  const keys = (pack.actions||[]).map((a: any)=>a.key);
    const templates = keys.length > 0
      ? await db.select().from(actionTemplates).where(and(inArray(actionTemplates.key, keys), eq(actionTemplates.status, 'active')))
      : [];
    const templateMap: Record<string, any> = {};
    for (const t of templates) templateMap[t.key] = t;

    const created: string[] = [];
    const skippedList: string[] = [];
    const existingList: string[] = [];
    const missingList: string[] = [];
    const reEnabled: string[] = [];
    const placeholders: string[] = []; // records where an action id exists but looks empty/minimal so we will update it
    for (const a of (pack.actions||[]) as any[]) {
      if (skipped.includes(a.key)) { skippedList.push(a.key); continue; }
      const tmpl = templateMap[a.key]; if (!tmpl) { missingList.push(a.key); continue; }
      const actionIdVal = tmpl.key; // use template key as action id
      const [existing] = await db.select().from(actions).where(and(eq(actions.orgId, org.id), eq(actions.actionId, actionIdVal))).limit(1);
      if (existing) {
        // If existing is disabled, re-enable + treat as created
        const isDisabled = existing.enabled === false;
        const looksPlaceholder = !existing.transport && !existing.http && !existing.inputSchema && !existing.outputSchema;
        if (isDisabled || looksPlaceholder) {
          const http = (tmpl.http || (tmpl.transport as any)?.http || {});
          const userContext: string | undefined = context[a.key] ? String(context[a.key]) : undefined;
          const staticResp = userContext
            ? { content: userContext, content_type: 'text/plain', status: 200 }
            : (tmpl.staticResponse ? {
                content: tmpl.staticResponse.content,
                content_type: tmpl.staticResponse.content_type || 'text/plain',
                status: typeof tmpl.staticResponse.status === 'number' ? tmpl.staticResponse.status : 200,
              } : undefined);
          const transport = (tmpl.transport || {}) as any;
          if (staticResp && (!transport.mode || transport.mode === 'direct')) {
            transport.mode = 'hosted';
            transport.authority = transport.authority || 'lamdis';
          }
          await db.update(actions).set({
            title: tmpl.title,
            description: tmpl.description || existing.description || '',
            http: {
              method: http.method || 'GET',
              url: http.full_url || http.url || http.base_url || '',
              base_url: http.base_url || '',
              path: http.path || '',
              headers: http.headers || {},
              body: http.body || undefined,
            } as any,
            transport: transport || undefined,
            inputSchema: tmpl.inputSchema || existing.inputSchema || undefined,
            inputSchemaDescription: tmpl.inputSchemaDescription || existing.inputSchemaDescription || undefined,
            outputSchema: tmpl.outputSchema || existing.outputSchema || undefined,
            outputSchemaDescription: tmpl.outputSchemaDescription || existing.outputSchemaDescription || undefined,
            staticResponse: staticResp || existing.staticResponse,
            enabled: true,
            version: pack.version || existing.version || '1.0.0',
            updatedAt: new Date(),
          }).where(eq(actions.id, existing.id));
          if (isDisabled) reEnabled.push(actionIdVal); else placeholders.push(actionIdVal);
          continue;
        }
        existingList.push(actionIdVal); continue; }
      const http = (tmpl.http || (tmpl.transport as any)?.http || {});
      const userContext: string | undefined = context[a.key] ? String(context[a.key]) : undefined;
      const staticResp = userContext
        ? { content: userContext, content_type: 'text/plain', status: 200 }
        : (tmpl.staticResponse ? {
            content: tmpl.staticResponse.content,
            content_type: tmpl.staticResponse.content_type || 'text/plain',
            status: typeof tmpl.staticResponse.status === 'number' ? tmpl.staticResponse.status : 200,
          } : undefined);
      const transport = (tmpl.transport || {}) as any;
      if (staticResp && (!transport.mode || transport.mode === 'direct')) {
        // Ensure hosted mode so static response path triggers hosted executor
        transport.mode = 'hosted';
        transport.authority = transport.authority || 'lamdis';
      }
      await db.insert(actions).values({
        orgId: org.id,
        actionId: actionIdVal,
        title: tmpl.title,
        description: tmpl.description || '',
        http: {
          method: http.method || 'GET',
          url: http.full_url || http.url || http.base_url || '',
          base_url: http.base_url || '',
          path: http.path || '',
          headers: http.headers || {},
          body: http.body || undefined,
        } as any,
        transport: transport || undefined,
        inputSchema: tmpl.inputSchema || undefined,
        inputSchemaDescription: tmpl.inputSchemaDescription || undefined,
        outputSchema: tmpl.outputSchema || undefined,
        outputSchemaDescription: tmpl.outputSchemaDescription || undefined,
        auth: undefined,
        risk: undefined,
        rateLimit: undefined,
        serviceArea: undefined,
        staticResponse: staticResp as any,
        enabled: true,
        version: pack.version || '1.0.0',
      });
      created.push(actionIdVal);
    }

  return { ok: true, created, skipped: skippedList, existing: existingList, missing: missingList, reEnabled, placeholders, pack: pack.key };
  });

  // Public catalog high-level counts (active actions + provider templates)
  app.get('/catalog-counts', async () => {
    const [actionCountResult] = await db.select({ count: sql<number>`count(*)::int` }).from(actionTemplates).where(eq(actionTemplates.status, 'active'));
    const [providerCountResult] = await db.select({ count: sql<number>`count(*)::int` }).from(providerTemplates);
    const [packCountResult] = await db.select({ count: sql<number>`count(*)::int` }).from(actionPacks).where(and(eq(actionPacks.status, 'active'), inArray(actionPacks.visibility, ['public','unlisted'])));
  return { actions: actionCountResult.count, providers: providerCountResult.count, packs: packCountResult.count, updatedAt: new Date().toISOString() };
  });
};

export default routes;
