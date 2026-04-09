import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { judgeBodySchema, judgeConversation } from '../services/judgeService.js';
import { registerRunsAuth } from '../services/runsAuth.js';
import { runFileBodySchema, runTestFile } from '../services/testExecution/fileRunner.js';
import { jsonSuitesBodySchema, runJsonSuites } from '../services/testExecution/jsonSuitesRunner.js';
import { startWorkflowRun } from '../services/testExecution/workflowRunStarter.js';
import { startDbBackedRun } from '../services/testExecution/dbRunStarter.js';

export default async function runsRoutes(app: FastifyInstance) {
  // Judge endpoint (AWS Bedrock Claude)
  app.post('/orgs/:orgId/judge', async (req) => {
    const { orgId } = req.params as { orgId: string };
    const body = judgeBodySchema.parse(req.body as any);
    return judgeConversation(body, { orgId, serviceKey: 'route.judge' });
  });

  registerRunsAuth(app);

  // Workflow run starter
  app.post('/internal/workflow-runs/start', async (req) => {
    const body = z.object({
      trigger: z.enum(['manual', 'schedule', 'ci']).default('ci'),
      orgId: z.string(),
      suiteId: z.string().optional(),
      workflowIds: z.array(z.string()).optional(),
      envId: z.string().optional(),
      connKey: z.string().optional(),
      gitContext: z.any().optional(),
      authHeader: z.string().optional(),
      webhookUrl: z.string().url().optional(),
    }).parse(req.body as any);

    return startWorkflowRun(body as any);
  });

  // DB-backed test run starter
  app.post('/internal/test-runs/start', async (req) => {
    const body = z.object({
      trigger: z.enum(['manual', 'schedule', 'ci']).default('ci'),
      suiteId: z.string(),
      envId: z.string().optional(),
      connKey: z.string().optional(),
      tests: z.array(z.string()).optional(),
      gitContext: z.any().optional(),
      authHeader: z.string().optional(),
      webhookUrl: z.string().url().optional(),
    }).parse(req.body as any);

    return startDbBackedRun(body as any);
  });

  // Run a JSON test file directly (dev mode)
  app.post('/internal/run-file', async (req, reply) => {
    const body = runFileBodySchema.parse(req.body as any);
    const { statusCode, payload } = await runTestFile(body);
    return reply.code(statusCode).send(payload as any);
  });

  // Run JSON suites from disk
  app.post('/internal/run-json-suites', async (req, reply) => {
    const body = jsonSuitesBodySchema.parse(req.body as any);
    const { statusCode, payload } = await runJsonSuites(body);
    return reply.code(statusCode).send(payload as any);
  });
}
