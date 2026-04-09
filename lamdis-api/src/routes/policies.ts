import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db.js';
import {
  policies,
  policyVersions,
  workflows,
  policyChecks,
  analysisJobs,
  categories,
} from '@lamdis/db/schema';
import { eq, and, desc, asc, count, ilike, sql } from 'drizzle-orm';
import { bedrockChatOnce, type ChatMessage } from '../lib/bedrockChat.js';

const CONVERT_MODEL = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-4-5-20251001-v1:0';

function parseJsonResponse<T>(response: string): T {
  let raw = response.trim()
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```\s*$/, '');

  try {
    return JSON.parse(raw) as T;
  } catch {
    raw = raw.replace(/,\s*$/, '');
    const quoteCount = (raw.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) raw += '"';
    let braces = 0, brackets = 0, inString = false;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"' && (i === 0 || raw[i - 1] !== '\\')) { inString = !inString; continue; }
      if (inString) continue;
      if (raw[i] === '{') braces++;
      else if (raw[i] === '}') braces--;
      else if (raw[i] === '[') brackets++;
      else if (raw[i] === ']') brackets--;
    }
    while (braces > 0) { raw += '}'; braces--; }
    while (brackets > 0) { raw += ']'; brackets--; }
    return JSON.parse(raw) as T;
  }
}

export default async function policyRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // =========================================================================
  // POLICIES CRUD
  // =========================================================================

  // List policies
  fastify.get('/orgs/:orgId/policies', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const query = req.query as { categoryId?: string; status?: string; search?: string };

    const conditions = [eq(policies.orgId, orgId)];
    if (query.categoryId) conditions.push(eq(policies.categoryId, query.categoryId));
    if (query.status) conditions.push(eq(policies.status, query.status as any));
    if (query.search) conditions.push(ilike(policies.title, `%${query.search}%`));

    const rows = await db.select({
      policy: policies,
      categoryName: categories.name,
    })
      .from(policies)
      .leftJoin(categories, eq(policies.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(policies.updatedAt));

    return reply.send(rows.map(r => ({
      ...r.policy,
      categoryName: r.categoryName,
    })));
  });

  // Create policy
  fastify.post('/orgs/:orgId/policies', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as {
      title: string;
      content?: string;
      categoryId?: string;
      tags?: string[];
      status?: string;
    };

    if (!body.title?.trim()) {
      return reply.code(400).send({ error: 'Title is required' });
    }

    const userSub = (req as any).user?.sub;

    const [created] = await db.insert(policies).values({
      orgId,
      title: body.title.trim(),
      content: body.content || '',
      categoryId: body.categoryId || null,
      tags: body.tags || [],
      status: (body.status || 'draft') as any,
      createdBy: userSub,
      updatedBy: userSub,
    }).returning();

    // Create initial version
    await db.insert(policyVersions).values({
      policyId: created.id,
      version: 1,
      title: created.title,
      content: created.content,
      changedBy: userSub,
      changeNote: 'Initial version',
    });

    return reply.code(201).send(created);
  });

  // Get policy by ID
  fastify.get('/orgs/:orgId/policies/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };

    const [row] = await db.select({
      policy: policies,
      categoryName: categories.name,
    })
      .from(policies)
      .leftJoin(categories, eq(policies.categoryId, categories.id))
      .where(and(eq(policies.id, id), eq(policies.orgId, orgId)))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Policy not found' });

    // Get linked workflows
    const linkedWorkflows = await db.select({
      id: workflows.id,
      name: workflows.name,
      category: workflows.category,
    }).from(workflows)
      .where(eq(workflows.sourcePolicyId, id))
      .orderBy(desc(workflows.createdAt));

    // Get version count
    const [versionCount] = await db.select({ count: count() }).from(policyVersions)
      .where(eq(policyVersions.policyId, id));

    return reply.send({
      ...row.policy,
      categoryName: row.categoryName,
      linkedWorkflows,
      versionCount: Number(versionCount?.count || 0),
    });
  });

  // Update policy (creates version snapshot before updating)
  fastify.put('/orgs/:orgId/policies/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as {
      title?: string;
      content?: string;
      categoryId?: string;
      tags?: string[];
      status?: string;
      changeNote?: string;
    };

    const userSub = (req as any).user?.sub;

    // Get current policy for versioning
    const [current] = await db.select().from(policies)
      .where(and(eq(policies.id, id), eq(policies.orgId, orgId)))
      .limit(1);

    if (!current) return reply.code(404).send({ error: 'Policy not found' });

    // Get the latest version number
    const [latestVersion] = await db.select({ version: policyVersions.version })
      .from(policyVersions)
      .where(eq(policyVersions.policyId, id))
      .orderBy(desc(policyVersions.version))
      .limit(1);

    const nextVersion = (latestVersion?.version || 0) + 1;

    // Create version snapshot of current state
    await db.insert(policyVersions).values({
      policyId: id,
      version: nextVersion,
      title: body.title || current.title,
      content: body.content !== undefined ? body.content : current.content,
      changedBy: userSub,
      changeNote: body.changeNote || null,
    });

    // Update the policy
    const [updated] = await db.update(policies)
      .set({
        title: body.title,
        content: body.content,
        categoryId: body.categoryId,
        tags: body.tags,
        status: body.status as any,
        updatedBy: userSub,
        updatedAt: new Date(),
      })
      .where(and(eq(policies.id, id), eq(policies.orgId, orgId)))
      .returning();

    return reply.send(updated);
  });

  // Delete policy (soft-delete: set status='archived')
  fastify.delete('/orgs/:orgId/policies/:id', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };

    const [updated] = await db.update(policies)
      .set({
        status: 'archived',
        updatedBy: (req as any).user?.sub,
        updatedAt: new Date(),
      })
      .where(and(eq(policies.id, id), eq(policies.orgId, orgId)))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Policy not found' });
    return reply.code(200).send(updated);
  });

  // =========================================================================
  // VERSION HISTORY
  // =========================================================================

  // List versions
  fastify.get('/orgs/:orgId/policies/:id/versions', async (req, reply) => {
    const { id } = req.params as { orgId: string; id: string };

    const versions = await db.select().from(policyVersions)
      .where(eq(policyVersions.policyId, id))
      .orderBy(desc(policyVersions.version));

    return reply.send(versions);
  });

  // Get specific version
  fastify.get('/orgs/:orgId/policies/:id/versions/:version', async (req, reply) => {
    const { id, version } = req.params as { orgId: string; id: string; version: string };

    const [row] = await db.select().from(policyVersions)
      .where(and(
        eq(policyVersions.policyId, id),
        eq(policyVersions.version, parseInt(version, 10)),
      ))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Version not found' });
    return reply.send(row);
  });

  // =========================================================================
  // AI: Convert policy to workflow suggestions
  // =========================================================================

  fastify.post('/orgs/:orgId/policies/:id/convert', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };

    const [policy] = await db.select().from(policies)
      .where(and(eq(policies.id, id), eq(policies.orgId, orgId)))
      .limit(1);

    if (!policy) return reply.code(404).send({ error: 'Policy not found' });

    // Track as analysis job
    const [job] = await db.insert(analysisJobs).values({
      orgId,
      type: 'policy_import',
      status: 'running',
      inputSummary: { policyId: id, title: policy.title },
      startedAt: new Date(),
    } as any).returning();

    try {
      const suggestions = await convertPolicyToWorkflows(policy.title, policy.content, {
        orgId,
        serviceKey: 'route.convertPolicyToWorkflows',
      });

      if (job) {
        await db.update(analysisJobs).set({
          status: 'completed',
          result: { workflowCount: suggestions.workflows?.length || 0 },
          completedAt: new Date(),
        }).where(eq(analysisJobs.id, job.id));
      }

      return reply.send(suggestions);
    } catch (err: any) {
      if (job) {
        await db.update(analysisJobs).set({
          status: 'failed',
          error: { message: err?.message },
          completedAt: new Date(),
        }).where(eq(analysisJobs.id, job.id));
      }
      req.log.error({ err }, 'Policy conversion failed');
      return reply.code(500).send({ error: 'Failed to convert policy', details: err?.message });
    }
  });

  // Create workflows from AI suggestions
  fastify.post('/orgs/:orgId/policies/:id/create-workflows', async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as {
      workflows: Array<{
        name: string;
        description?: string;
        category?: string;
        expectedEventTypes?: string[];
        checks?: Array<{
          name: string;
          description?: string;
          category?: string;
          severity?: string;
          checkType: string;
          config?: Record<string, unknown>;
          requiredEvidenceLevel?: string;
          appliesTo?: { eventTypes?: string[] };
        }>;
      }>;
    };

    const userSub = (req as any).user?.sub;
    const created: any[] = [];

    for (const wfInput of body.workflows) {
      // Create the workflow with sourcePolicyId
      const [wf] = await db.insert(workflows).values({
        orgId,
        sourcePolicyId: id,
        name: wfInput.name,
        description: wfInput.description,
        category: wfInput.category || 'operational',
        expectedEventTypes: wfInput.expectedEventTypes || [],
        createdBy: userSub,
      }).returning();

      // Create associated checks
      const createdChecks: any[] = [];
      for (const check of (wfInput.checks || [])) {
        const [c] = await db.insert(policyChecks).values({
          orgId,
          outcomeTypeId: wf.id,
          name: check.name,
          description: check.description,
          category: (check.category || 'compliance') as any,
          severity: (check.severity || 'error') as any,
          checkType: check.checkType as any,
          config: check.config || {},
          requiredEvidenceLevel: (check.requiredEvidenceLevel || 'A') as any,
          appliesTo: check.appliesTo,
        }).returning();
        createdChecks.push(c);
      }

      created.push({ workflow: wf, checks: createdChecks });
    }

    return reply.code(201).send({ created });
  });
}

// ---------------------------------------------------------------------------
// Helper: Convert policy markdown to workflow suggestions
// ---------------------------------------------------------------------------

async function convertPolicyToWorkflows(title: string, content: string, meterContext: import('../services/llmCostControl/index.js').MeterContext): Promise<{
  workflows: Array<{
    name: string;
    description: string;
    category: string;
    expectedEventTypes: string[];
    reasoning: string;
    checks: Array<{
      name: string;
      description: string;
      category: string;
      severity: string;
      checkType: string;
      config: Record<string, unknown>;
      requiredEvidenceLevel: string;
      appliesTo: { eventTypes: string[] };
      reasoning: string;
    }>;
  }>;
}> {
  const systemPrompt = `You are a compliance architect for Lamdis, an AI workflow monitoring platform. Given a policy document (markdown), extract structured workflow definitions with checks.

Each policy document may contain multiple distinct requirements — group related requirements into workflows.

For each workflow:
- name: concise name for the business process
- description: what this workflow monitors
- category: compliance | safety | quality | security | operational
- expectedEventTypes: dot-notation event types this workflow should observe
- reasoning: why this workflow was extracted from the policy
- checks: array of policy checks

For each check:
- name: what must be true
- description: detailed requirement
- category: compliance | safety | quality | security | operational
- severity: critical | error | warning | info
- checkType: judge | includes | regex | json_path | event_presence | event_sequence | timing | confirmation_level
- config: type-specific config (e.g., { "prompt": "..." } for judge)
- requiredEvidenceLevel: A (assertion) to E (cryptographic proof)
- appliesTo.eventTypes: which event types this check evaluates (linking check to specific evidence)
- reasoning: why this check was created

Return ONLY valid JSON:
{
  "workflows": [...]
}`;

  const userPrompt = `Convert this policy document into workflow definitions:

**Title:** ${title}

**Content:**
${content}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await bedrockChatOnce({
    modelId: CONVERT_MODEL,
    messages,
    temperature: 0.2,
    maxTokens: 8192,
    meterContext: { ...meterContext, serviceKey: 'route.convertPolicyToWorkflows' },
  });

  return parseJsonResponse(response);
}
