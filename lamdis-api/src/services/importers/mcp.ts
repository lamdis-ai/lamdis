type ImportOptions = { defaultMode?: 'direct'|'hosted'|'proxy'; idPrefix?: string };

const toKebab = (s: string) => String(s || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  || 'action';

export function parseMCPSpec(input: string|object, opts: ImportOptions = {}) {
  const doc = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { throw new Error('MCP JSON expected'); } })() : input;
  if (!doc || typeof doc !== 'object' || !Array.isArray((doc as any).tools)) throw new Error('Not an MCP manifest');
  const tools: any[] = (doc as any).tools;
  const actions = tools.map((t: any) => {
    const baseId = toKebab(t.name || t.title || 'action');
    const id = (opts.idPrefix ? `${toKebab(opts.idPrefix)}-${baseId}` : baseId);
    const url: string | undefined = t.transport?.url;
    let mode: 'direct'|'hosted'|'proxy' = 'direct';
    try { if (url && /lamdis\.ai/i.test(new URL(url).host)) mode = 'hosted'; } catch {}
    return {
      id,
      title: t.title || t.name,
      description: t.description || '',
      transport: { mode: opts.defaultMode || mode, authority: (opts.defaultMode||mode)==='direct'?'vendor':'lamdis', http: { method: 'GET', full_url: url } },
      http: { method: 'GET', url },
      input_schema: t.input_schema || { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {}, additionalProperties: false },
      output_schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {}, additionalProperties: true },
      enabled: true,
    };
  });
  return { actions };
}
