// Shared helpers for visibility logic (phase 1: foundational predicates -- expand later)
import type { InferSelectModel } from 'drizzle-orm';
import type { agents } from '@lamdis/db/schema';
import type { manifests } from '@lamdis/db/schema';

type Agent = InferSelectModel<typeof agents>;
type Manifest = InferSelectModel<typeof manifests>;

export type Visibility = 'internal' | 'external' | 'private';

export function normalizeAgentVisibility(v?: string): Visibility {
  if (v === 'external') return 'external';
  if (v === 'private') return 'private';
  // legacy 'org' maps to internal
  return 'internal';
}

export function normalizeManifestVisibility(v?: string): Visibility {
  if (v === 'external' || v === 'public') return 'external';
  if (v === 'private') return 'private';
  return 'internal';
}

export function canPubliclyAccessAgent(agent: Agent): boolean {
  const vis = normalizeAgentVisibility(agent.visibility as any);
  return vis === 'external';
}

export function canPubliclyAccessManifest(manifest: Manifest): boolean {
  const vis = normalizeManifestVisibility(manifest.visibility as any);
  return vis === 'external';
}

export function projectPublicAgent(agent: Agent) {
  return {
    id: agent.externalSlug || agent.id,
    name: agent.name,
    description: agent.description,
    visibility: normalizeAgentVisibility(agent.visibility as any),
    publishedAt: agent.externalPublishedAt || agent.createdAt,
    // future: surface capability summary, categories
  };
}

export function projectPublicManifest(m: Manifest) {
  return {
    slug: m.externalSlug || m.slug,
    name: m.name,
    description: m.description,
    visibility: normalizeManifestVisibility(m.visibility as any),
    publishedAt: m.externalPublishedAt || m.createdAt,
  };
}

// --- Phase 2: mutation helpers ---
// These helpers encapsulate the business rules for transitioning visibility states
// and generating external slugs / published timestamps. They intentionally mutate
// the provided document instance so callers can apply the changes afterward.
// Contract:
//  input: doc (Agent|Manifest row), nextVisibility?: string
//  side-effects: may set externalSlug, externalPublishedAt, visibility
//  rules:
//    - legacy values mapped through normalize* functions
//    - first transition to external generates externalSlug (kebab name fallback) if missing
//    - externalPublishedAt set the first time something becomes external
//    - prohibit changing externalSlug once set (caller must enforce -- we do NOT allow override here)
//    - (Optional future) disallow downgrade from external -> internal/private unless flag allowDowngrade true
//  return: { changed: boolean, before: Visibility, after: Visibility }

function toKebab(s: string) {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

export function applyManifestVisibilityChange(m: any, nextRaw?: string, opts?: { allowDowngrade?: boolean }) {
  const before = normalizeManifestVisibility(m.visibility);
  const desired = nextRaw ? normalizeManifestVisibility(nextRaw) : before;
  if (desired === before) return { changed: false, before, after: before };
  if (before === 'external' && desired !== 'external' && !opts?.allowDowngrade) {
    return { changed: false, before, after: before }; // silent no-op (UI should prevent)
  }
  // entering external state
  if (desired === 'external' && !m.externalSlug) {
    // prefer existing slug; fallback to name; ensure kebab; last resort: row id
    const base = toKebab(m.slug || m.name || String(m.id));
    m.externalSlug = base || toKebab(String(m.id));
    if (!m.externalPublishedAt) m.externalPublishedAt = new Date();
  }
  m.visibility = desired; // store raw desired (using external/internal/private labels)
  return { changed: true, before, after: desired };
}

export function applyAgentVisibilityChange(a: any, nextRaw?: string, opts?: { allowDowngrade?: boolean }) {
  const before = normalizeAgentVisibility(a.visibility);
  const desired = nextRaw ? normalizeAgentVisibility(nextRaw) : before;
  if (desired === before) return { changed: false, before, after: before };
  if (before === 'external' && desired !== 'external' && !opts?.allowDowngrade) {
    return { changed: false, before, after: before };
  }
  if (desired === 'external' && !a.externalSlug) {
    const base = toKebab(a.slug || a.name || String(a.id));
    a.externalSlug = base || toKebab(String(a.id));
    if (!a.externalPublishedAt) a.externalPublishedAt = new Date();
  }
  a.visibility = desired;
  return { changed: true, before, after: desired };
}
