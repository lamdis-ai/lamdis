import type { FastifyPluginAsync } from 'fastify';
import { eq, and, or, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { members, organizations } from '@lamdis/db/schema';
import { isSelfHosted } from '../lib/deploymentMode.js';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const user = (req as any).user;
    // Claim any pending invites by email
    if (user?.email) {
      await db.update(members)
        .set({ userSub: user.sub, status: 'active', acceptedAt: new Date() })
        .where(
          and(
            eq(members.email, user.email.toLowerCase()),
            eq(members.status, 'invited'),
            isNull(members.userSub),
          )
        );
    }

    const conditions: any[] = [];
    if (user?.sub) conditions.push(eq(members.userSub, user.sub));
    if (user?.email) conditions.push(eq(members.email, user.email.toLowerCase()));

    const rows = await db.select()
      .from(members)
      .innerJoin(organizations, eq(members.orgId, organizations.id))
      .where(conditions.length ? or(...conditions) : eq(members.userSub, '__none__'));

    // In self-hosted mode, return all orgs; in cloud mode, only Auth0-linked orgs
    const validOrgs = rows
      .filter((r: any) => isSelfHosted() ? r.organizations : r.organizations?.auth0OrgId)
      .map((r: any) => ({ orgId: r.organizations?.id, role: r.members.role, org: r.organizations }));

    return { user, orgs: validOrgs };
  });

  app.get('/orgs', async (req) => {
    const user = (req as any).user;
    const rows = await db.select()
      .from(members)
      .innerJoin(organizations, eq(members.orgId, organizations.id))
      .where(eq(members.userSub, user?.sub ?? ''));

    // In self-hosted mode, return all orgs; in cloud mode, only Auth0-linked orgs
    const validOrgs = rows
      .filter((r: any) => isSelfHosted() ? r.organizations : r.organizations?.auth0OrgId)
      .map((r: any) => ({ orgId: r.organizations?.id, role: r.members.role, org: r.organizations }));
    return { orgs: validOrgs };
  });

  // Bootstrap endpoint removed for cloud - users must create organizations via /auth0-orgs/create
  // For self-hosted, use /setup/bootstrap instead
  app.post('/bootstrap', async (req, reply) => {
    if (isSelfHosted()) {
      return reply.code(301).send({
        error: 'Use /setup/bootstrap for self-hosted setup',
        redirect: '/setup/bootstrap',
      });
    }
    return reply.code(410).send({
      error: 'Bootstrap endpoint deprecated',
      message: 'Please create an organization using the organization creation flow'
    });
  });
};

export default routes;
