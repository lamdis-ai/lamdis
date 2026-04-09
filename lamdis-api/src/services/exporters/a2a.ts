import { buildAuthExport } from './helpers.js';

function resolvePublicBase() {
  const envBase = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return 'https://api.lamdis.ai';
  return `http://localhost:${process.env.PORT || 3001}`;
}

// Transform Lamdis manifest -> A2A Agent Card (subset per spec v0.3.0)
export function toA2AAgentCard(org: any, mv: any, opts?: { streaming?: boolean }) {
  const publicBase = resolvePublicBase();
  const slug = org.slug;
  const streaming = opts?.streaming ?? true; // default enable for now

  // Map actions -> skills
  const skills = (mv.actions || []).map((a: any) => ({
    id: a.id || a.key,
    name: a.title || a.id,
    description: a.description || a.title || a.id,
    inputModes: ['application/json'],
    outputModes: ['application/json'],
    examples: (a.examples && Array.isArray(a.examples) && a.examples.slice(0,3)) || undefined
  })).filter(Boolean);

  const card: any = {
    protocolVersion: '0.3.0',
    name: `${org.name} Agent`,
    description: `Agent actions and business operations for ${org.name}.`,
    url: `https://lamdis.ai/a2a/${slug}/v1`,
    preferredTransport: 'JSONRPC',
    version: mv.semver || '1.0.0',
    capabilities: { streaming },
    provider: { organization: 'Lamdis', url: 'https://lamdis.ai' },
    defaultInputModes: ['application/json','text/plain'],
    defaultOutputModes: ['application/json','text/plain'],
    skills,
    supportsAuthenticatedExtendedCard: false,
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    security: [ { bearer: [] } ]
  };
  return card;
}
