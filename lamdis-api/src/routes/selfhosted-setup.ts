import type { FastifyPluginAsync } from 'fastify';
import { count } from 'drizzle-orm';
import { env } from '../lib/env.js';
import { isSelfHosted } from '../lib/deploymentMode.js';
import { db } from '../db.js';
import { organizations, members } from '@lamdis/db/schema';

/**
 * Self-hosted bootstrap and setup routes.
 * Available only when LAMDIS_DEPLOYMENT_MODE=self_hosted.
 *
 * These routes are auth-bypassed in the auth plugin and instead
 * protected by the LAMDIS_ADMIN_TOKEN header.
 */
const routes: FastifyPluginAsync = async (app) => {
  // Guard: this entire route file is a no-op in cloud mode
  if (!isSelfHosted()) return;

  /** Verify the admin token from the x-admin-token header */
  function verifyAdminToken(req: any, reply: any): boolean {
    const token = req.headers['x-admin-token'];
    if (!env.LAMDIS_ADMIN_TOKEN) {
      reply.code(500).send({ error: 'LAMDIS_ADMIN_TOKEN not configured' });
      return false;
    }
    if (token !== env.LAMDIS_ADMIN_TOKEN) {
      reply.code(401).send({ error: 'Invalid admin token' });
      return false;
    }
    return true;
  }

  /**
   * GET /setup/status
   * Returns the current setup state — whether bootstrap is needed,
   * whether OIDC is configured, and license status.
   * Protected by admin token.
   */
  app.get('/status', async (req, reply) => {
    if (!verifyAdminToken(req, reply)) return;

    const [orgRow] = await db.select({ count: count() }).from(organizations);
    const [memberRow] = await db.select({ count: count() }).from(members);
    const orgCount = orgRow?.count ?? 0;
    const memberCount = memberRow?.count ?? 0;

    return {
      bootstrapNeeded: orgCount === 0,
      orgCount,
      memberCount,
      authMode: env.LAMDIS_AUTH_MODE,
      entitlementsMode: env.LAMDIS_ENTITLEMENTS_MODE,
      oidcConfigured: Boolean(env.OIDC_ISSUER),
      licensePath: env.LAMDIS_LICENSE_PATH || null,
    };
  });

  /**
   * POST /setup/bootstrap
   * Creates the first organization and admin member.
   * Only works when no organizations exist (or LAMDIS_BOOTSTRAP_FORCE=true).
   * Protected by admin token.
   *
   * Body: { orgName: string, adminEmail: string, adminSub?: string }
   */
  app.post('/bootstrap', async (req, reply) => {
    if (!verifyAdminToken(req, reply)) return;

    const [orgRow] = await db.select({ count: count() }).from(organizations);
    const existingOrgs = orgRow?.count ?? 0;
    if (existingOrgs > 0 && env.LAMDIS_BOOTSTRAP_FORCE !== 'true') {
      return reply.code(409).send({
        error: 'bootstrap_already_done',
        message: 'Organizations already exist. Set LAMDIS_BOOTSTRAP_FORCE=true to override.',
        orgCount: existingOrgs,
      });
    }

    const { orgName, adminEmail, adminSub } = req.body as any;

    if (!orgName) {
      return reply.code(400).send({ error: 'orgName is required' });
    }
    if (!adminEmail) {
      return reply.code(400).send({ error: 'adminEmail is required' });
    }

    // Create the organization (no Auth0 org ID needed for self-hosted)
    const [org] = await db.insert(organizations).values({
      name: orgName,
      subscriptionStatus: 'active',
      currentPlan: 'enterprise', // Self-hosted orgs start at enterprise tier (license controls actual limits)
    }).returning();

    // Create the admin member
    const [member] = await db.insert(members).values({
      orgId: org.id,
      userSub: adminSub || `admin|${adminEmail}`,
      email: adminEmail.toLowerCase(),
      role: 'admin',
      status: 'active',
      acceptedAt: new Date(),
    }).returning();

    app.log.info({ orgId: org.id, email: adminEmail }, 'self-hosted bootstrap complete');

    return {
      success: true,
      org: { id: org.id, name: org.name },
      member: { id: member.id, email: adminEmail, role: 'admin' },
      message: 'Bootstrap complete. Configure your OIDC provider and restart with LAMDIS_AUTH_MODE=oidc.',
    };
  });
};

export default routes;
