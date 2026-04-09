import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import rawBody from 'fastify-raw-body';
import formbody from '@fastify/formbody';
import { env } from './lib/env.js';
import { authPlugin } from './plugins/auth.js';
import fp from 'fastify-plugin';
import healthRoutes from './routes/health.js';
import usageRoutes from './routes/usage.js';
import budgetsRoutes from './routes/budgets.js';
import { BudgetExceededError } from './services/llmCostControl/index.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import actionLibraryRoutes from './routes/action-library.js';
import orgsRoutes from './routes/orgs.js';
import publicRoutes from './routes/public.js';
import meRoutes from './routes/me.js';
import integrationsRoutes from './routes/integrations.js';
import demoRoutes from './routes/demo.js';
import oauthRoutes from './routes/oauth.js';
import providerTemplateRoutes from './routes/provider-templates.js';
import webhooksRoutes from './routes/webhooks.js';
import analyticsRoutes from './routes/analytics.js';
import ingestRoutes from './routes/ingest.js';
import mockAssistantRoutes from './routes/mockAssistant.js';
import knowledgeRoutes from './routes/knowledge.js';
import knowledgeSearchRoutes from './routes/knowledge-search.js';
import knowledgeEmbedRoutes from './routes/knowledge-embed.js';
import requestTemplatesRoutes from './routes/request-templates.js';
import knowledgeCategoriesRoutes from './routes/knowledge-categories.js';
import assistantRoutes from './routes/assistant.js';
import assistantsRoutes from './routes/assistants.js';
import auth0OrgsRoutes from './routes/auth0-orgs.js';
import actionBindingsRoutes from './routes/action-bindings.js';
import environmentsRoutes from './routes/environments.js';
import auditRoutes from './routes/audit.js';
import rolesRoutes from './routes/roles.js';
import userProfileRoutes from './routes/user-profile.js';
import { registerCiRoutesFastify } from './integrations/ci/routes.fastify.js';
import { registerDeveloperKeyRoutesFastify } from './integrations/developer/apiKeys/routes.fastify.js';
import selfhostedSetupRoutes from './routes/selfhosted-setup.js';
import selfhostedOrgsRoutes from './routes/selfhosted-orgs.js';
import internalRoutes from './routes/internal.js';
import { entitlementPlugin } from './plugins/entitlementPlugin.js';
import { shutdownLamdis } from './lib/lamdis.js';

import { initializeToolRegistry } from './lib/assistant/tool-registry.js';
import { isCloud, isSelfHosted, deploymentMode, authMode, entitlementsMode } from './lib/deploymentMode.js';
import { startEventConsumer, stopEventConsumer } from './workers/eventConsumer.js';
import { startTunnel, getPublicUrl } from './services/tunnel/tunnelService.js';
import { startEvaluationScheduler, stopEvaluationScheduler } from './workers/evaluationScheduler.js';
import { startAgentScheduler, stopAgentScheduler } from './services/automation/outcomeOrchestrator.js';
import { startSchedulerWorker, stopSchedulerWorker } from './workers/agentSchedulerWorker.js';
import workflowRoutes from './routes/interactions.js';
import actionExecutionRoutes from './routes/action-executions.js';
import playbookRoutes from './routes/playbooks.js';
import proofRoutes from './routes/proof.js';
import conversationRoutes from './routes/conversations.js';
import policyRoutes from './routes/policies.js';
import categoryRoutes from './routes/categories.js';
import runRoutes from './routes/runs.js';
import testingRoutes from './routes/testing.js';
import evidenceRoutes from './routes/evidence.js';
import setupsRoutes from './routes/setups.js';
import outcomeBuilderRoutes from './routes/outcome-builder.js';
import channelRoutes from './routes/channels.js';
import evaluationScheduleRoutes from './routes/evaluation-schedules.js';
import codeExecutionRoutes from './routes/code-execution.js';
import agentRoutes from './routes/agent.js';
import inputRequestRoutes from './routes/input-requests.js';
import workspaceRoutes from './routes/workspaces.js';
import bridgeRoutes from './routes/bridge.js';
import toolRoutes from './routes/tools.js';
import identityRoutes from './routes/identities.js';
import credentialRoutes from './routes/credentials.js';
import communicationRoutes from './routes/communication.js';
import scheduleRoutes from './routes/schedules.js';
import browserViewRoutes from './routes/browser-view.js';
import approvalRoutes from './routes/approvals.js';
import eventsIngestRoutes from './routes/events-ingest.js';
import mobileRoutes from './routes/mobile.js';
import { closeNatsPublisher } from './lib/natsPublisher.js';

async function buildServer() {
  const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 }); // 20MB for image uploads

  // Map BudgetExceededError thrown by the bedrockChat wrapper → HTTP 429.
  // Other errors fall through to Fastify's default handler.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BudgetExceededError) {
      return reply.code(429).send({
        error: err.code,
        scope: err.scope,
        scopeRefId: err.scopeRefId,
        limitUsd: err.limitUsd,
        usedUsd: err.usedUsd,
        periodType: err.periodType,
        message: err.message,
      });
    }
    reply.send(err);
  });

  await app.register(cors, {
    origin: (origin, cb) => { cb(null, true); },
    credentials: true,
  });
  await app.register(helmet);
  await app.register(swagger, { openapi: { info: { title: 'Lamdis API', version: '0.1.0' } } });
  await app.register(swaggerUI, { routePrefix: '/docs' });
  await app.register(rawBody, { field: 'rawBody', global: false });
  await app.register(formbody); // Twilio webhooks are URL-encoded

  // WebSocket support for local filesystem bridge
  const websocketPlugin = await import('@fastify/websocket');
  await app.register(websocketPlugin.default || websocketPlugin);

  console.log(`[Lamdis] mode=${deploymentMode} auth=${authMode} entitlements=${entitlementsMode}`);

  await initializeToolRegistry().catch(err => {
    console.warn('[ToolRegistry] Failed to initialize (non-fatal):', err?.message);
  });

  await app.register(fp(authPlugin));
  await app.register(fp(entitlementPlugin));

  // Lamdis SDK: extract x-lamdis-instance-id from incoming requests
  try {
    const { fastifyPlugin: lamdisPlugin } = await import('@lamdis-ai/sdk');
    await app.register(fp(lamdisPlugin));
  } catch (err: any) {
    console.warn('[Lamdis SDK] Failed to register plugin (non-fatal):', err?.message);
  }

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(billingRoutes, { prefix: '/billing' });
  await app.register(actionLibraryRoutes, { prefix: '/action-library' });
  await app.register(orgsRoutes, { prefix: '/orgs' });
  await app.register(publicRoutes, { prefix: '/public' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(integrationsRoutes, { prefix: '/' });
  await app.register(demoRoutes, { prefix: '/' });
  await app.register(oauthRoutes, { prefix: '/' });
  await app.register(providerTemplateRoutes, { prefix: '/' });
  await app.register(webhooksRoutes, { prefix: '/' });
  await app.register(analyticsRoutes, { prefix: '/' });
  await app.register(ingestRoutes, { prefix: '/' });
  await app.register(mockAssistantRoutes, { prefix: '/' });
  await app.register(knowledgeRoutes, { prefix: '/' });
  await app.register(knowledgeSearchRoutes, { prefix: '/' });
  await app.register(knowledgeEmbedRoutes, { prefix: '/' });
  await app.register(requestTemplatesRoutes, { prefix: '/' });
  await app.register(knowledgeCategoriesRoutes, { prefix: '/' });
  await app.register(assistantRoutes, { prefix: '/orgs' });
  // LLM cost control: usage telemetry + budget CRUD
  await app.register(usageRoutes, { prefix: '/orgs' });
  await app.register(budgetsRoutes, { prefix: '/orgs' });
  await app.register(assistantsRoutes, { prefix: '/' });
  if (isCloud()) {
    await app.register(auth0OrgsRoutes, { prefix: '/auth0-orgs' });
  }
  await app.register(actionBindingsRoutes, { prefix: '/' });
  await app.register(environmentsRoutes, { prefix: '/' });
  await app.register(auditRoutes, { prefix: '/orgs' });
  await app.register(rolesRoutes, { prefix: '/orgs' });
  await app.register(userProfileRoutes, { prefix: '/user-profile' });
  await app.register(selfhostedSetupRoutes, { prefix: '/setup' });
  await app.register(selfhostedOrgsRoutes, { prefix: '/selfhosted' });
  await app.register(internalRoutes, { prefix: '/internal' });
  // Outcomes (was: workflows — traceable outcome model)
  await app.register(workflowRoutes, { prefix: '/' });
  // Action Executions
  await app.register(actionExecutionRoutes, { prefix: '/' });
  await app.register(playbookRoutes, { prefix: '/' });
  // Proof / Decision Dossiers
  await app.register(proofRoutes, { prefix: '/' });
  // Conversations (chat-driven outcomes)
  await app.register(conversationRoutes, { prefix: '/' });
  // Policies (knowledge base)
  await app.register(policyRoutes, { prefix: '/' });
  // Categories (hierarchical taxonomy)
  await app.register(categoryRoutes, { prefix: '/' });
  // Runs (batch workflow execution)
  await app.register(runRoutes, { prefix: '/' });
  // Testing (suites, tests, test runs, folders)
  await app.register(testingRoutes, { prefix: '/' });
  // Evidence (models, vault, access logs)
  await app.register(evidenceRoutes, { prefix: '/' });
  // Setups (environment/connection configurations)
  await app.register(setupsRoutes, { prefix: '/' });
  // Outcome Builder (AI chat-to-build)
  await app.register(outcomeBuilderRoutes, { prefix: '/' });
  // Channels (deployable chat endpoints)
  await app.register(channelRoutes, { prefix: '/' });
  // Evaluation Schedules (continuous evaluation timers)
  await app.register(evaluationScheduleRoutes, { prefix: '/' });
  // Code Execution (sandboxed JavaScript)
  await app.register(codeExecutionRoutes, { prefix: '/' });
  // Agent (autonomous agent loop control)
  await app.register(agentRoutes, { prefix: '/' });
  await app.register(bridgeRoutes, { prefix: '/' });
  // Browser View (live Playwright streaming)
  await app.register(browserViewRoutes, { prefix: '/' });
  // Input Requests (structured agent-to-user requests)
  await app.register(inputRequestRoutes, { prefix: '/' });
  // Workspaces (persistent agent code workspaces)
  await app.register(workspaceRoutes, { prefix: '/' });
  // Tools (base + custom tool registry)
  await app.register(toolRoutes, { prefix: '/' });
  // Identities (agent identity management)
  await app.register(identityRoutes, { prefix: '/' });
  // Credentials (encrypted credential vault + request flow)
  await app.register(credentialRoutes, { prefix: '/' });
  // Communication (multi-channel messaging hub)
  await app.register(communicationRoutes, { prefix: '/' });
  // Schedules (agent self-scheduling)
  await app.register(scheduleRoutes, { prefix: '/' });
  // Approval Chains & Approver Roles
  await app.register(approvalRoutes, { prefix: '/' });
  // Event ingestion (merged from lamdis-ingest service)
  await app.register(eventsIngestRoutes, { prefix: '/' });
  // Mobile API (device registration, token refresh, push)
  await app.register(mobileRoutes, { prefix: '/' });
  // Teams (org structure groups)
  const teamRoutes = (await import('./routes/teams.js')).default;
  await app.register(teamRoutes, { prefix: '/' });
  // Integrations
  await registerDeveloperKeyRoutesFastify(app);
  await registerCiRoutesFastify(app);

  return app;
}

const port = Number(env.PORT);

buildServer()
  .then(async (app) => {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Lamdis API listening on port ${port}`);

    // Start tunnel for inbound webhooks (Twilio, etc.)
    startTunnel(port).then(url => {
      if (url) console.log(`[tunnel] Inbound webhooks available at: ${url}`);
    }).catch(err => {
      console.warn('[tunnel] Failed to start (non-fatal):', err?.message);
    });

    startEventConsumer().catch(err => {
      console.warn('[EventConsumer] Failed to start (non-fatal):', err?.message);
    });

    startEvaluationScheduler();
    startAgentScheduler(); // legacy 30s global tick (backward compat)
    startSchedulerWorker(); // new per-instance scheduler

    const shutdown = async () => {
      console.log('Shutting down...');
      await shutdownLamdis();
      stopEvaluationScheduler();
      stopAgentScheduler();
      stopSchedulerWorker();
      await stopEventConsumer();
      await closeNatsPublisher();
      await app.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
