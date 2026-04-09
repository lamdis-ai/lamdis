import type { FastifyPluginAsync } from 'fastify';
import { eq, and, or, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { connectors, connectorInstallations, auditLogs, members, actions } from '@lamdis/db/schema';
import { encrypt, decrypt } from '../lib/crypto.js';

const routes: FastifyPluginAsync = async (app) => {
  // List connectors: everyone sees active; users also see their own org's pending
  app.get('/', async (req) => {
    const user = (req as any).user;
    let orgIds: string[] = [];
    if (user?.sub) {
      const mems = await db
        .select()
        .from(members)
        .where(eq(members.userSub, user.sub));
      orgIds = mems.map(m => m.orgId);
    }

    // Build query: status = 'active' OR (status = 'pending' AND submittedByOrgId IN orgIds)
    const conditions = orgIds.length > 0
      ? or(
          eq(connectors.status, 'active'),
          and(eq(connectors.status, 'pending'), inArray(connectors.submittedByOrgId, orgIds))
        )
      : eq(connectors.status, 'active');

    const list = await db.select().from(connectors).where(conditions);
    return { connectors: list };
  });

  // Submit new connector (always pending)
  app.post('/', async (req) => {
    const user = (req as any).user;
    const body = req.body as any;
    let submittedByOrgId: string | undefined = undefined;
    if (user?.sub) {
      const [mem] = await db
        .select()
        .from(members)
        .where(eq(members.userSub, user.sub))
        .limit(1);
      submittedByOrgId = mem?.orgId;
    }
    const [created] = await db
      .insert(connectors)
      .values({ ...body, status: 'pending', submittedByOrgId })
      .returning();
    await db.insert(auditLogs).values({
      orgId: submittedByOrgId || created.id, // fallback orgId
      actor: { sub: user?.sub },
      action: 'connector.submit',
      details: { key: created.key },
    });
    return { connector: created };
  });

  app.post('/:key/install', async (req) => {
    const { key } = req.params as any;
    const { orgId, config, tokens } = req.body as any;
    const [connector] = await db
      .select()
      .from(connectors)
      .where(eq(connectors.key, key))
      .limit(1);
    if (!connector) return { error: 'Not found' };
    const encConfig = encrypt(config || {});
    const encTokens = encrypt(tokens || {});
    const [install] = await db
      .insert(connectorInstallations)
      .values({ orgId, connectorId: connector.id, config: encConfig, tokens: encTokens })
      .returning();
    await db.insert(auditLogs).values({
      orgId,
      actor: { sub: (req as any).user?.sub },
      action: 'connector.install',
      details: { key },
    });
    // If active connector publishes actions, add them to org actions collection (enabled)
    if (connector.status === 'active' && Array.isArray(connector.actions)) {
      for (const a of connector.actions as any[]) {
        try {
          // Upsert: check if action with this actionId + orgId exists
          const actionId = a.id || a.actionId;
          if (actionId) {
            const [existing] = await db
              .select()
              .from(actions)
              .where(and(eq(actions.orgId, orgId), eq(actions.actionId, actionId)))
              .limit(1);
            if (existing) {
              await db.update(actions)
                .set({ ...a, orgId, enabled: true, updatedAt: new Date() })
                .where(eq(actions.id, existing.id));
            } else {
              await db.insert(actions).values({ ...a, orgId, actionId, enabled: true });
            }
          }
        } catch {}
      }
      await db.insert(auditLogs).values({
        orgId,
        actor: { sub: (req as any).user?.sub },
        action: 'connector.publish_actions',
        details: { key, count: (connector.actions as any[])?.length || 0 },
      });
    }
    return { installation: install };
  });

  app.get('/installations', async (req) => {
    const { orgId } = (req.query as any) || {};
    // Get installations with their connector data via a join
    const installList = await db
      .select()
      .from(connectorInstallations)
      .where(eq(connectorInstallations.orgId, orgId));

    // Fetch related connectors for each installation
    const connectorIds = [...new Set(installList.map(i => i.connectorId))];
    const connectorMap: Record<string, any> = {};
    if (connectorIds.length > 0) {
      const connectorRows = await db
        .select()
        .from(connectors)
        .where(inArray(connectors.id, connectorIds));
      for (const c of connectorRows) {
        connectorMap[c.id] = c;
      }
    }

    const redacted = installList.map((i: any) => ({
      ...i,
      connector: connectorMap[i.connectorId] || null,
      config: '[encrypted]',
      tokens: '[encrypted]',
    }));
    return { installations: redacted };
  });
};

export default routes;
