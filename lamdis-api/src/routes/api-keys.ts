import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { apiKeys } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// Generate a secure API key
function generateApiKey(): { secret: string; hash: string; salt: string; prefix: string } {
  const secret = `lam_sk_${crypto.randomBytes(32).toString('base64url')}`;
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.createHash('sha256').update(secret + ':' + salt).digest('hex');
  const prefix = secret.substring(0, 15); // "lam_sk_" + first 8 chars of random
  return { secret, hash, salt, prefix };
}

// Validate an API key and return the key document if valid
export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  orgId?: string;
  keyId?: string;
  scopes?: string[];
  error?: string;
}> {
  if (!apiKey || !apiKey.startsWith('lam_sk_')) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const prefix = apiKey.substring(0, 15);

  // Find keys with matching prefix
  const keys = await db.select().from(apiKeys).where(and(
    eq(apiKeys.keyPrefix, prefix),
    eq(apiKeys.disabled, false)
  ));

  if (keys.length === 0) {
    return { valid: false, error: 'API key not found' };
  }

  // Check hash against each matching key
  for (const key of keys) {
    const computedHash = crypto.createHash('sha256').update(apiKey + ':' + key.keySalt).digest('hex');
    if (computedHash === key.keyHash) {
      // Check expiration
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Update last used timestamp (fire and forget)
      db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});

      return {
        valid: true,
        orgId: key.orgId,
        keyId: key.id,
        scopes: key.scopes || [],
      };
    }
  }

  return { valid: false, error: 'Invalid API key' };
}

// Check if a scope matches the required scope
export function hasScope(scopes: string[], required: string): boolean {
  return scopes.some(scope => {
    if (scope === '*') return true;
    if (scope === required) return true;
    // Wildcard matching: "workflows:*" matches "workflows:read"
    if (scope.endsWith(':*')) {
      const prefix = scope.slice(0, -1); // "workflows:"
      return required.startsWith(prefix);
    }
    return false;
  });
}

export default async function apiKeysRoutes(app: FastifyInstance) {
  // List API keys for an org
  app.get('/orgs/:orgId/api-keys', async (req) => {
    const { orgId } = z.object({ orgId: z.string() }).parse(req.params as any);

    const keys = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdBy: apiKeys.createdBy,
      createdAt: apiKeys.createdAt,
      disabled: apiKeys.disabled,
    }).from(apiKeys).where(eq(apiKeys.orgId, orgId)).orderBy(sql`${apiKeys.createdAt} DESC`);

    // Return keys without sensitive hash/salt data
    return keys;
  });

  // Create a new API key
  app.post('/orgs/:orgId/api-keys', async (req, reply) => {
    const { orgId } = z.object({ orgId: z.string() }).parse(req.params as any);
    const body = z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string()).optional().default(['workflows:*']),
      expiresAt: z.string().datetime().optional(),
    }).parse(req.body as any);

    const { secret, hash, salt, prefix } = generateApiKey();

    // Get user ID from request if available
    const userId = (req as any).user?.sub || (req as any).user?.id;

    const [doc] = await db.insert(apiKeys).values({
      orgId,
      name: body.name,
      keyHash: hash,
      keySalt: salt,
      keyPrefix: prefix,
      scopes: body.scopes,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      createdBy: userId,
      disabled: false,
    }).returning();

    // Return the key once - it will never be shown again
    return {
      id: doc.id,
      name: doc.name,
      keyPrefix: doc.keyPrefix,
      scopes: doc.scopes,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
      // Only return the secret on creation
      secret,
    };
  });

  // Update an API key (name, scopes, expiration only)
  app.patch('/orgs/:orgId/api-keys/:keyId', async (req, reply) => {
    const { orgId, keyId } = z.object({
      orgId: z.string(),
      keyId: z.string()
    }).parse(req.params as any);

    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      scopes: z.array(z.string()).optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      disabled: z.boolean().optional(),
    }).parse(req.body as any);

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.scopes !== undefined) updates.scopes = body.scopes;
    if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.disabled !== undefined) updates.disabled = body.disabled;

    const [doc] = await db.update(apiKeys)
      .set(updates)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)))
      .returning();

    if (!doc) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return {
      id: doc.id,
      name: doc.name,
      keyPrefix: doc.keyPrefix,
      scopes: doc.scopes,
      lastUsedAt: doc.lastUsedAt,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
      disabled: doc.disabled,
    };
  });

  // Delete/revoke an API key
  app.delete('/orgs/:orgId/api-keys/:keyId', async (req, reply) => {
    const { orgId, keyId } = z.object({
      orgId: z.string(),
      keyId: z.string()
    }).parse(req.params as any);

    const result = await db.delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)))
      .returning();

    if (result.length === 0) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return reply.code(204).send();
  });
}