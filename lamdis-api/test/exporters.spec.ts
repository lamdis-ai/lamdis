import { describe, it, expect } from 'vitest';
import { toOpenAPI } from '../src/services/exporters/openapi';
import { toMCP } from '../src/services/exporters/mcp';
import { toJSONLD } from '../src/services/exporters/jsonld';

const org = { name: 'Acme Co', slug: 'acme' } as any;

describe('exporters honor transport.mode', () => {
  const directAction = {
    id: 'check_order_status',
    title: 'Check DoorDash order status',
    transport: {
      mode: 'direct',
      authority: 'vendor',
      http: { method: 'GET', base_url: 'https://api.doordash.com', path: '/v1/orders/{id}' }
    },
  } as any;

  const hostedAction = {
    id: 'book_appointment',
    title: 'Book appointment',
    transport: {
      mode: 'hosted',
      authority: 'lamdis',
      http: { method: 'POST' }
    },
  } as any;

  const mv = { semver: '1.2.3', actions: [directAction, hostedAction] } as any;

  it('OpenAPI uses vendor server for direct and lamdis for hosted', () => {
    const doc = toOpenAPI(org, mv) as any;
    const directPath = '/v1/orders/{id}';
    const hostedPath = `/hosted/${org.slug}/${hostedAction.id}`;
    expect(doc.paths[directPath]).toBeTruthy();
    expect(doc.paths[directPath].get.servers[0].url).toBe('https://api.doordash.com');
    expect(doc.paths[hostedPath]).toBeTruthy();
  });

  it('MCP transport.url is vendor for direct and lamdis for hosted', () => {
    const mcp = toMCP(org, mv) as any;
    const toolDirect = mcp.tools.find((t: any) => t.name === directAction.id);
    const toolHosted = mcp.tools.find((t: any) => t.name === hostedAction.id);
    expect(toolDirect.transport.url).toContain('api.doordash.com');
    expect(toolHosted.transport.url).toContain('lamdis.ai/hosted');
  });

  it('JSON-LD EntryPoint.urlTemplate follows mode', () => {
    const jsonld = toJSONLD(org, mv) as any;
    const dist = jsonld.distribution as any[];
    const d = dist.find(x => x.potentialAction?.name === directAction.id);
    const h = dist.find(x => x.potentialAction?.name === hostedAction.id);
    expect(d.urlTemplate).toContain('api.doordash.com');
    expect(h.urlTemplate).toContain('lamdis.ai/hosted');
  });
});
