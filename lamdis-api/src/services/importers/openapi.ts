import { load as yamlLoad } from 'js-yaml';

type ImportOptions = { defaultMode?: 'direct'|'hosted'|'proxy'; idPrefix?: string };

const toKebab = (s: string) => String(s || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  || 'action';

export function parseOpenAPISpec(input: string|object, opts: ImportOptions = {}) {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  let doc: any;
  try {
    // Try JSON first
    doc = typeof input === 'string' ? JSON.parse(text) : input;
  } catch {
    try { doc = yamlLoad(text as string); } catch (e) { throw new Error('Failed to parse spec as JSON or YAML'); }
  }
  if (!doc || typeof doc !== 'object') throw new Error('Invalid OpenAPI document');
  if (!doc.openapi && !doc.swagger) throw new Error('Not an OpenAPI document');

  const servers: string[] = Array.isArray(doc.servers) ? doc.servers.map((s: any) => s?.url).filter(Boolean) : [];
  const actions: any[] = [];

  const httpMethods = ['get','post','put','patch','delete','head','options','trace'];
  for (const [path, item] of Object.entries<any>(doc.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const m of httpMethods) {
      const op = (item as any)[m];
      if (!op) continue;

      // Determine server for this operation (operation.servers > pathItem.servers > root.servers)
      let serverUrl: string | undefined;
      const opServers = Array.isArray(op.servers) ? op.servers : (Array.isArray(item.servers) ? item.servers : []);
      if (opServers && opServers.length) serverUrl = opServers[0]?.url;
      if (!serverUrl && servers.length) serverUrl = servers[0];

      // Compose full URL; if serverUrl missing, keep relative path
      let fullUrl = path as string;
      try {
        if (serverUrl) {
          const u = new URL(serverUrl);
          const p = String(path || '/');
          fullUrl = `${u.origin}${p.startsWith('/') ? '' : '/'}${p}`;
        }
      } catch { fullUrl = path as string; }

      // Build input schema from parameters + requestBody (flattened)
      const props: Record<string, any> = {};
      const required: string[] = [];
      const parameters = ([] as any[]).concat(op.parameters || [], item.parameters || []);
      for (const p of parameters) {
        if (!p || typeof p !== 'object') continue;
        const name = p.name || '';
        const schema = p.schema || { type: 'string' };
        if (name) props[name] = schema;
        if (p.required) required.push(name);
      }
      // If requestBody has application/json schema, merge its properties at top-level
      const rb = op.requestBody || {};
      const content = rb.content || {};
      const jsonEntry = content['application/json'] || content['application/*+json'];
      if (jsonEntry && jsonEntry.schema) {
        const bodySchema = jsonEntry.schema;
        if (bodySchema && typeof bodySchema === 'object') {
          // If bodySchema is an object with properties, merge; else put as `body`
          if (bodySchema.type === 'object' && bodySchema.properties) {
            Object.assign(props, bodySchema.properties);
            if (Array.isArray(bodySchema.required)) {
              for (const r of bodySchema.required) if (!required.includes(r)) required.push(r);
            }
          } else {
            props['body'] = bodySchema;
            if (rb.required) required.push('body');
          }
        }
      }

      // Titles and ids
      const baseId = toKebab(op.operationId || op.summary || `${m}-${path}`);
      const id = (opts.idPrefix ? `${toKebab(opts.idPrefix)}-${baseId}` : baseId);
      const title = op.summary || baseId;
      const description = op.description || '';

      actions.push({
        id,
        title,
        description,
        transport: { mode: opts.defaultMode || 'direct', authority: (opts.defaultMode||'direct')==='direct'?'vendor':'lamdis', http: { method: m.toUpperCase(), full_url: fullUrl } },
        http: { method: m.toUpperCase(), url: fullUrl },
        input_schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: props, required: required.length ? required : undefined, additionalProperties: false },
        output_schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {}, additionalProperties: true },
        enabled: true,
      });
    }
  }
  return { actions };
}
