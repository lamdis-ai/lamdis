import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createHash } from 'crypto';
import { db } from '../db.js';
import {
  evidenceModels,
  evidenceVaultEntries,
  evidenceAccessLogs,
  organizations,
} from '@lamdis/db/schema';
import { eq, and, desc, sql, count, gte, lte, ilike } from 'drizzle-orm';
import { isCustomerOwnedStorageMode } from '../lib/feature.js';
import { decryptValue } from '../lib/crypto-variables.js';

import { validateEvidence } from '../services/evidenceValidation.js';
import { extractDerivedEvidence } from '../services/derivedEvidenceExtractor.js';
import { requestJitUrl } from '../services/vaultBroker.js';

export default async function evidenceRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // ===== Evidence Models CRUD =====

  // List all evidence models for an org
  fastify.get('/orgs/:orgId/evidence-models', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const rows = await db.select().from(evidenceModels)
      .where(eq(evidenceModels.orgId, orgId))
      .orderBy(evidenceModels.name);

    return reply.send(rows);
  });

  // Get a specific evidence model
  fastify.get('/orgs/:orgId/evidence-models/:modelId', async (request, reply) => {
    const { orgId, modelId } = request.params as { orgId: string; modelId: string };

    const [model] = await db.select().from(evidenceModels)
      .where(and(eq(evidenceModels.id, modelId), eq(evidenceModels.orgId, orgId)))
      .limit(1);

    if (!model) {
      return reply.code(404).send({ error: 'Evidence model not found' });
    }

    // Get count of vault entries for this model
    const [entryCountRow] = await db.select({ count: count() }).from(evidenceVaultEntries)
      .where(and(eq(evidenceVaultEntries.orgId, orgId), eq(evidenceVaultEntries.evidenceModelId, modelId)));

    return reply.send({ ...model, entryCount: entryCountRow?.count || 0 });
  });

  // Create a new evidence model
  fastify.post('/orgs/:orgId/evidence-models', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const sub = (request as any).user?.sub;
    const body = request.body as any;

    if (!body.name) {
      return reply.code(400).send({ error: 'Name is required' });
    }

    if (!body.dataSchema || !body.dataSchema.properties) {
      return reply.code(400).send({ error: 'Schema with properties is required' });
    }

    const [created] = await db.insert(evidenceModels).values({
      orgId,
      name: body.name,
      description: body.description,
      dataSchema: body.dataSchema,
      examples: body.examples || [],
      webhook: body.webhook,
      vault: body.vault,
      tags: body.tags || [],
      createdBy: sub,
    }).returning();

    return reply.code(201).send(created);
  });

  // Update an evidence model
  fastify.put('/orgs/:orgId/evidence-models/:modelId', async (request, reply) => {
    const { orgId, modelId } = request.params as { orgId: string; modelId: string };
    const body = request.body as any;

    const [existing] = await db.select().from(evidenceModels)
      .where(and(eq(evidenceModels.id, modelId), eq(evidenceModels.orgId, orgId)))
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: 'Evidence model not found' });
    }

    const [updated] = await db.update(evidenceModels)
      .set({
        name: body.name ?? existing.name,
        description: body.description !== undefined ? body.description : existing.description,
        dataSchema: body.dataSchema ?? existing.dataSchema,
        examples: body.examples ?? existing.examples,
        webhook: body.webhook ?? existing.webhook,
        vault: body.vault ?? existing.vault,
        tags: body.tags ?? existing.tags,
        disabled: body.disabled !== undefined ? body.disabled : existing.disabled,
        updatedAt: new Date(),
      })
      .where(and(eq(evidenceModels.id, modelId), eq(evidenceModels.orgId, orgId)))
      .returning();

    return reply.send(updated);
  });

  // Delete an evidence model
  fastify.delete('/orgs/:orgId/evidence-models/:modelId', async (request, reply) => {
    const { orgId, modelId } = request.params as { orgId: string; modelId: string };

    // Check if there are vault entries using this model
    const [entryCountRow] = await db.select({ count: count() }).from(evidenceVaultEntries)
      .where(and(eq(evidenceVaultEntries.orgId, orgId), eq(evidenceVaultEntries.evidenceModelId, modelId)));

    if ((entryCountRow?.count || 0) > 0) {
      return reply.code(400).send({
        error: 'Cannot delete evidence model with vault entries',
        entryCount: entryCountRow?.count || 0,
      });
    }

    await db.delete(evidenceModels)
      .where(and(eq(evidenceModels.id, modelId), eq(evidenceModels.orgId, orgId)));

    return reply.code(204).send();
  });

  // ===== Evidence Submission Endpoint =====

  // Submit evidence for processing (async)
  fastify.post('/orgs/:orgId/evidence/:modelId/submit', async (request, reply) => {
    const { orgId, modelId } = request.params as { orgId: string; modelId: string };
    const body = request.body as any;

    // Get the evidence model
    const [evidenceModel] = await db.select().from(evidenceModels)
      .where(and(eq(evidenceModels.id, modelId), eq(evidenceModels.orgId, orgId)))
      .limit(1);

    if (!evidenceModel) {
      return reply.code(404).send({ error: 'Evidence model not found' });
    }

    if (evidenceModel.disabled) {
      return reply.code(400).send({ error: 'Evidence model is disabled' });
    }

    // Check org storage mode
    const [org] = await db.select().from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const customerOwned = isCustomerOwnedStorageMode(org);

    // In customer_owned mode, evidence data and artifact pointer are separate fields
    // In lamdis_hosted mode, the entire body is the evidence data (backward compatible)
    const evidenceData = customerOwned ? (body.data || body) : body;
    const artifactPointer = customerOwned ? body.artifactPointer : undefined;

    // Guardrail: customer_owned mode requires an artifact pointer
    if (customerOwned && !artifactPointer) {
      return reply.code(400).send({
        error: 'Customer-owned vault mode requires an artifactPointer in the request body',
        hint: 'Send { data: {...}, artifactPointer: { provider, bucket, key, region } }',
      });
    }

    const validationResult = await validateEvidence(evidenceModel, evidenceData);

    // Compute SHA-256 hash
    const dataHash = createHash('sha256')
      .update(JSON.stringify(evidenceData))
      .digest('hex');

    // Calculate scheduled deletion date if retention is configured
    let scheduledDeletionAt: Date | undefined;
    if (evidenceModel.vault?.retentionDays && evidenceModel.vault.retentionDays > 0) {
      scheduledDeletionAt = new Date();
      scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + evidenceModel.vault.retentionDays);
    }

    if (customerOwned) {
      // === Customer-Owned Vault Mode ===

      const derivedEvidence = extractDerivedEvidence(evidenceData, evidenceModel, validationResult);

      const [vaultEntry] = await db.insert(evidenceVaultEntries).values({
        orgId,
        evidenceModelId: modelId,
        data: null, // Raw data NOT stored
        storageMode: 'customer_owned' as const,
        artifactPointer: {
          provider: artifactPointer.provider || 's3',
          bucket: artifactPointer.bucket,
          key: artifactPointer.key,
          region: artifactPointer.region,
          size: artifactPointer.size,
          contentType: artifactPointer.contentType,
          uploadedAt: artifactPointer.uploadedAt || new Date().toISOString(),
        },
        submittedDataHashSha256: dataHash,
        derivedEvidence,
        status: validationResult.isValid ? 'received' as const : 'failed' as const,
        validation: validationResult,
        source: {
          systemId: evidenceData?.systemId,
          referenceId: evidenceData?.referenceId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
        overallResult: 'pending' as const,
        scheduledDeletionAt,
      }).returning();

      if (!validationResult.isValid) {
        return reply.code(400).send({
          error: 'Evidence validation failed',
          vaultEntryId: vaultEntry.id,
          validation: validationResult,
          storageMode: 'customer_owned',
        });
      }


      return reply.code(202).send({
        message: 'Evidence received and queued for processing (customer-owned vault)',
        vaultEntryId: vaultEntry.id,
        storageMode: 'customer_owned',
        submittedDataHashSha256: dataHash,
        status: 'received',
        validation: validationResult,
      });

    } else {
      // === Lamdis-Hosted Mode (Default) ===

      const [vaultEntry] = await db.insert(evidenceVaultEntries).values({
        orgId,
        evidenceModelId: modelId,
        data: evidenceData,
        storageMode: 'lamdis_hosted' as const,
        submittedDataHashSha256: dataHash,
        status: validationResult.isValid ? 'received' as const : 'failed' as const,
        validation: validationResult,
        source: {
          systemId: (evidenceData as any).systemId,
          referenceId: (evidenceData as any).referenceId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
        overallResult: 'pending' as const,
        scheduledDeletionAt,
      }).returning();

      if (!validationResult.isValid) {
        return reply.code(400).send({
          error: 'Evidence validation failed',
          vaultEntryId: vaultEntry.id,
          validation: validationResult,
        });
      }

      return reply.code(202).send({
        message: 'Evidence received and queued for processing',
        vaultEntryId: vaultEntry.id,
        status: 'received',
        validation: validationResult,
      });
    }
  });

  // ===== Evidence Vault Query =====

  // List vault entries
  fastify.get('/orgs/:orgId/evidence-vault', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const query = request.query as any;

    const conditions = [eq(evidenceVaultEntries.orgId, orgId)];

    if (query.evidenceModelId) {
      conditions.push(eq(evidenceVaultEntries.evidenceModelId, query.evidenceModelId));
    }
    if (query.status) {
      conditions.push(eq(evidenceVaultEntries.status, query.status));
    }
    if (query.overallResult) {
      conditions.push(eq(evidenceVaultEntries.overallResult, query.overallResult));
    }
    if (query.flaggedForReview === 'true') {
      conditions.push(eq(evidenceVaultEntries.flaggedForReview, true));
    }
    if (query.startDate) {
      conditions.push(gte(evidenceVaultEntries.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      conditions.push(lte(evidenceVaultEntries.createdAt, new Date(query.endDate)));
    }

    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const skip = parseInt(query.skip) || 0;

    const entries = await db.select().from(evidenceVaultEntries)
      .where(and(...conditions))
      .orderBy(desc(evidenceVaultEntries.createdAt))
      .limit(limit)
      .offset(skip);

    const [totalRow] = await db.select({ count: count() }).from(evidenceVaultEntries)
      .where(and(...conditions));

    return reply.send({ entries, total: totalRow?.count || 0, limit, skip });
  });

  // Get a specific vault entry
  fastify.get('/orgs/:orgId/evidence-vault/:entryId', async (request, reply) => {
    const { orgId, entryId } = request.params as { orgId: string; entryId: string };

    const [entry] = await db.select().from(evidenceVaultEntries)
      .where(and(eq(evidenceVaultEntries.id, entryId), eq(evidenceVaultEntries.orgId, orgId)))
      .limit(1);

    if (!entry) {
      return reply.code(404).send({ error: 'Vault entry not found' });
    }

    return reply.send(entry);
  });

  // Flag vault entry for review
  fastify.post('/orgs/:orgId/evidence-vault/:entryId/flag', async (request, reply) => {
    const { orgId, entryId } = request.params as { orgId: string; entryId: string };
    const { notes } = request.body as { notes?: string };

    const [entry] = await db.select().from(evidenceVaultEntries)
      .where(and(eq(evidenceVaultEntries.id, entryId), eq(evidenceVaultEntries.orgId, orgId)))
      .limit(1);

    if (!entry) {
      return reply.code(404).send({ error: 'Vault entry not found' });
    }

    const updateData: any = { flaggedForReview: true, updatedAt: new Date() };
    if (notes) updateData.reviewNotes = notes;

    const [updated] = await db.update(evidenceVaultEntries)
      .set(updateData)
      .where(and(eq(evidenceVaultEntries.id, entryId), eq(evidenceVaultEntries.orgId, orgId)))
      .returning();

    return reply.send(updated);
  });

  // Review vault entry
  fastify.post('/orgs/:orgId/evidence-vault/:entryId/review', async (request, reply) => {
    const { orgId, entryId } = request.params as { orgId: string; entryId: string };
    const sub = (request as any).user?.sub;
    const { notes } = request.body as { notes?: string };

    const [entry] = await db.select().from(evidenceVaultEntries)
      .where(and(eq(evidenceVaultEntries.id, entryId), eq(evidenceVaultEntries.orgId, orgId)))
      .limit(1);

    if (!entry) {
      return reply.code(404).send({ error: 'Vault entry not found' });
    }

    const updateData: any = {
      reviewedAt: new Date(),
      reviewedBy: sub,
      flaggedForReview: false,
      updatedAt: new Date(),
    };
    if (notes) updateData.reviewNotes = notes;

    const [updated] = await db.update(evidenceVaultEntries)
      .set(updateData)
      .where(and(eq(evidenceVaultEntries.id, entryId), eq(evidenceVaultEntries.orgId, orgId)))
      .returning();

    return reply.send(updated);
  });

  // ===== JIT Signed URL for Customer-Owned Vault =====

  // Generate a temporary signed URL for viewing raw evidence
  fastify.post('/orgs/:orgId/evidence-vault/:entryId/jit-url', async (request, reply) => {
    const { orgId, entryId } = request.params as { orgId: string; entryId: string };
    const sub = (request as any).user?.sub;
    const userEmail = (request as any).user?.email || (request as any).user?.name;

    // Load vault entry
    const [entry] = await db.select().from(evidenceVaultEntries)
      .where(and(eq(evidenceVaultEntries.id, entryId), eq(evidenceVaultEntries.orgId, orgId)))
      .limit(1);

    if (!entry) {
      return reply.code(404).send({ error: 'Vault entry not found' });
    }

    if (entry.storageMode !== 'customer_owned') {
      return reply.code(400).send({ error: 'JIT URL only available for customer-owned vault entries' });
    }

    const pointer = entry.artifactPointer;
    if (!pointer?.key) {
      return reply.code(400).send({ error: 'Vault entry has no artifact pointer' });
    }

    // Load org vault config
    const [org] = await db.select().from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const vaultConfig = org?.evidenceVault;
    if (!vaultConfig?.broker?.url || !vaultConfig?.broker?.authHeader_enc) {
      return reply.code(400).send({ error: 'Vault broker not configured' });
    }

    // Decrypt broker auth header
    const enc = vaultConfig.broker.authHeader_enc as { ciphertext: string; iv: string; tag: string };
    let authHeader: string;
    try {
      authHeader = decryptValue(enc.ciphertext, enc.iv, enc.tag);
    } catch {
      return reply.code(500).send({ error: 'Failed to decrypt broker credentials' });
    }

    const ttlSeconds = vaultConfig.jitTtlSeconds || 60;

    try {
      const result = await requestJitUrl(
        { url: vaultConfig.broker.url, authHeader },
        {
          provider: pointer.provider || 's3',
          bucket: pointer.bucket || '',
          key: pointer.key,
          region: pointer.region,
        },
        ttlSeconds,
      );

      // Log the access
      await db.insert(evidenceAccessLogs).values({
        orgId,
        resourceType: 'vault_entry',
        resourceId: entryId,
        artifactKey: pointer.key,
        artifactProvider: pointer.provider,
        actorSub: sub,
        actorEmail: userEmail,
        action: 'jit_url_generated',
        jitTtlSeconds: result.ttlSeconds,
        jitExpiresAt: new Date(result.expiresAt),
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        url: result.url,
        expiresAt: result.expiresAt,
        ttlSeconds: result.ttlSeconds,
        artifactKey: pointer.key,
        hashSha256: entry.submittedDataHashSha256,
      });
    } catch (err: any) {
      // Log the failed access attempt
      await db.insert(evidenceAccessLogs).values({
        orgId,
        resourceType: 'vault_entry',
        resourceId: entryId,
        artifactKey: pointer.key,
        artifactProvider: pointer.provider,
        actorSub: sub,
        actorEmail: userEmail,
        action: 'jit_url_failed',
        failureReason: err?.message,
        userAgent: request.headers['user-agent'],
      });

      return reply.code(502).send({
        error: 'Failed to generate JIT URL',
        reason: err?.message || 'Broker request failed',
      });
    }
  });

  // ===== Evidence Access Logs =====

  // List evidence access logs (for auditing JIT URL usage)
  fastify.get('/orgs/:orgId/evidence-access-logs', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const query = request.query as any;

    const conditions = [eq(evidenceAccessLogs.orgId, orgId)];

    if (query.resourceId) {
      conditions.push(eq(evidenceAccessLogs.resourceId, query.resourceId));
    }
    if (query.resourceType) {
      conditions.push(eq(evidenceAccessLogs.resourceType, query.resourceType));
    }
    if (query.actorSub) {
      conditions.push(eq(evidenceAccessLogs.actorSub, query.actorSub));
    }
    if (query.actorEmail) {
      conditions.push(ilike(evidenceAccessLogs.actorEmail, `%${query.actorEmail}%`));
    }
    if (query.action) {
      conditions.push(eq(evidenceAccessLogs.action, query.action));
    }
    if (query.from) {
      conditions.push(gte(evidenceAccessLogs.ts, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lte(evidenceAccessLogs.ts, new Date(query.to)));
    }

    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const skip = parseInt(query.skip) || 0;

    const logs = await db.select().from(evidenceAccessLogs)
      .where(and(...conditions))
      .orderBy(desc(evidenceAccessLogs.ts))
      .limit(limit)
      .offset(skip);

    const [totalRow] = await db.select({ count: count() }).from(evidenceAccessLogs)
      .where(and(...conditions));

    return reply.send({ logs, total: totalRow?.count || 0, limit, skip });
  });
}
