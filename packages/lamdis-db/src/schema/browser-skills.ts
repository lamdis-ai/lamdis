import { pgTable, text, uuid, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Browser Skills — learned procedures from user demonstrations in the live
// browser view. Org-scoped so they can be reused across instances.
//
// Captured from: LiveBrowserView interactions (clicks, types, navigations)
// Used by: smartBrowser before LLM action selection (injected as "known
// procedures for this site")
// ---------------------------------------------------------------------------

export interface BrowserSkillStep {
  type: 'click' | 'type' | 'key' | 'scroll' | 'navigate' | 'wait';
  /** CSS selector captured at recording time (best-effort, may need fuzzy match) */
  selector?: string;
  /** Visible text of the clicked element — most stable identifier across page versions */
  elementText?: string;
  /** Tag name of the element (input, button, a, etc.) */
  elementTag?: string;
  /** For type actions */
  value?: string;
  /** For key actions (Enter, Tab, etc.) */
  key?: string;
  /** For navigate actions */
  url?: string;
  /** For scroll actions */
  deltaY?: number;
  /** For wait actions */
  ms?: number;
  /** Coordinates relative to 1400x900 viewport (fallback if selector fails) */
  x?: number;
  y?: number;
  /** Human-readable description ("click 'for sale by owner' radio") */
  intent?: string;
}

export const browserSkills = pgTable('browser_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  /** Domain this skill applies to, e.g. "craigslist.org" */
  domain: text('domain').notNull(),
  /** Optional URL pattern (substring match), e.g. "/post/" */
  urlPattern: text('url_pattern'),
  /** Short name, e.g. "Choose 'for sale by owner' on Craigslist post type page" */
  name: text('name').notNull(),
  /** What the skill accomplishes */
  intent: text('intent').notNull(),
  /** Sequence of actions to replay/adapt */
  steps: jsonb('steps').$type<BrowserSkillStep[]>().notNull().default([]),
  /** Page state snapshot at recording time (simplified DOM text) */
  pageStateSnapshot: text('page_state_snapshot'),
  /** How the skill was created */
  source: text('source').default('user_demonstration'), // 'user_demonstration' | 'agent_learned' | 'manual'
  /** Track success vs failure when used */
  successCount: integer('success_count').default(0),
  successTimes: integer('success_times').default(0), // alias for analytics
  failureCount: integer('failure_count').default(0),
  /** When was this last used successfully */
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdBy: text('created_by'), // user.sub or 'agent'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('browser_skills_org_id_idx').on(t.orgId),
  index('browser_skills_org_domain_idx').on(t.orgId, t.domain),
]);
