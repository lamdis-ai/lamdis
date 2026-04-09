import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { userDevices } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';

const registerDeviceSchema = z.object({
  platform: z.enum(['ios', 'android']),
  pushToken: z.string().min(1),
  deviceName: z.string().optional(),
  appVersion: z.string().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * Mobile API routes — /v1/mobile/*
 *
 * Provides:
 * - Device registration for push notifications
 * - Token refresh for mobile auth flows
 * - Device management (list, remove)
 */
export default async function mobileRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // ── Device Registration ──────────────────────────────────────────

  /**
   * POST /v1/mobile/devices
   * Register a mobile device for push notifications.
   */
  fastify.post('/v1/mobile/devices', async (req, reply) => {
    const user = (req as any).user;
    const apiKeyAuth = (req as any).apiKeyAuth;
    const userSub = user?.sub || apiKeyAuth?.userSub;
    const orgId = (req as any).orgId || apiKeyAuth?.orgId;

    if (!userSub || !orgId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const parsed = registerDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.issues });
    }

    const { platform, pushToken, deviceName, appVersion } = parsed.data;

    // Upsert: if push token already exists, update it
    const existing = await db.select({ id: userDevices.id })
      .from(userDevices)
      .where(eq(userDevices.pushToken, pushToken))
      .limit(1);

    if (existing.length > 0) {
      await db.update(userDevices)
        .set({
          orgId,
          userSub,
          platform,
          deviceName,
          appVersion,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userDevices.id, existing[0].id));

      return reply.send({ id: existing[0].id, registered: true });
    }

    const [device] = await db.insert(userDevices).values({
      orgId,
      userSub,
      platform,
      pushToken,
      deviceName,
      appVersion,
      lastActiveAt: new Date(),
    }).returning({ id: userDevices.id });

    return reply.code(201).send({ id: device.id, registered: true });
  });

  /**
   * GET /v1/mobile/devices
   * List registered devices for the current user.
   */
  fastify.get('/v1/mobile/devices', async (req, reply) => {
    const user = (req as any).user;
    const apiKeyAuth = (req as any).apiKeyAuth;
    const userSub = user?.sub || apiKeyAuth?.userSub;
    const orgId = (req as any).orgId || apiKeyAuth?.orgId;

    if (!userSub || !orgId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const devices = await db.select({
      id: userDevices.id,
      platform: userDevices.platform,
      deviceName: userDevices.deviceName,
      appVersion: userDevices.appVersion,
      enabled: userDevices.enabled,
      lastActiveAt: userDevices.lastActiveAt,
      createdAt: userDevices.createdAt,
    })
      .from(userDevices)
      .where(and(
        eq(userDevices.orgId, orgId),
        eq(userDevices.userSub, userSub),
      ));

    return reply.send({ devices });
  });

  /**
   * DELETE /v1/mobile/devices/:deviceId
   * Unregister a device.
   */
  fastify.delete('/v1/mobile/devices/:deviceId', async (req, reply) => {
    const user = (req as any).user;
    const apiKeyAuth = (req as any).apiKeyAuth;
    const userSub = user?.sub || apiKeyAuth?.userSub;
    const { deviceId } = req.params as { deviceId: string };

    if (!userSub) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    await db.delete(userDevices)
      .where(and(
        eq(userDevices.id, deviceId),
        eq(userDevices.userSub, userSub),
      ));

    return reply.send({ deleted: true });
  });

  // ── Token Refresh ────────────────────────────────────────────────

  /**
   * POST /v1/mobile/auth/refresh
   * Exchange a refresh token for new access + refresh tokens.
   * Proxies to Auth0's /oauth/token endpoint.
   */
  fastify.post('/v1/mobile/auth/refresh', async (req, reply) => {
    const parsed = refreshTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'refreshToken is required' });
    }

    const auth0Domain = process.env.AUTH0_DOMAIN;
    const auth0ClientId = process.env.AUTH0_APP_CLIENT_ID;

    if (!auth0Domain || !auth0ClientId) {
      return reply.code(501).send({ error: 'Token refresh not configured (no Auth0)' });
    }

    try {
      const response = await fetch(`https://${auth0Domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: auth0ClientId,
          refresh_token: parsed.data.refreshToken,
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return reply.code(response.status).send({
          error: data.error || 'Token refresh failed',
          description: data.error_description,
        });
      }

      return reply.send({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Token refresh error');
      return reply.code(502).send({ error: 'Auth provider unavailable' });
    }
  });

  // ── App Health ───────────────────────────────────────────────────

  /**
   * GET /v1/mobile/status
   * Mobile-specific status endpoint with API version info.
   */
  fastify.get('/v1/mobile/status', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      apiVersion: 1,
      minimumAppVersion: '1.0.0',
    });
  });
}
