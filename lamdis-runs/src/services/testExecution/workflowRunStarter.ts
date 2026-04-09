/**
 * Workflow Run Starter
 *
 * Adapts the new workflow model to the existing test execution engine.
 * Maps workflow.syntheticScript → EngineTest format, then runs via
 * runTestsWithEngine. Stores results as workflow_instances + runs.
 */

import yaml from 'js-yaml';
import { repo } from '../../db/repo.js';
import { executeRequest } from '../../lib/httpRequests.js';
import { runTestsWithEngine, EngineContext, EngineTest, EngineRunResult } from './engine.js';
import { checkRunEntitlement } from '../entitlementCheck.js';
import { randomUUID } from 'crypto';

export type WorkflowRunInput = {
  trigger: 'manual' | 'schedule' | 'ci';
  orgId: string;
  suiteId?: string;       // workflow suite ID
  workflowIds?: string[]; // specific workflows to run (or all in suite)
  envId?: string;
  connKey?: string;
  gitContext?: any;
  authHeader?: string;
  webhookUrl?: string;
};

export async function startWorkflowRun(body: WorkflowRunInput) {
  const { orgId } = body;

  // Entitlement check
  const entitlement = await checkRunEntitlement(orgId);
  if (!entitlement.allowed) {
    return { error: 'entitlement_exceeded', reason: entitlement.reason } as any;
  }

  // Get workflows to run
  let workflowDocs: any[];
  if (body.workflowIds?.length) {
    workflowDocs = await repo.getWorkflowsByIds(body.workflowIds);
  } else if (body.suiteId) {
    workflowDocs = await repo.getWorkflowsBySuiteId(body.suiteId);
  } else {
    return { error: 'no_workflows_specified' } as any;
  }

  if (workflowDocs.length === 0) {
    return { error: 'no_workflows_found' } as any;
  }

  // Filter to only workflows with syntheticScript (runnable in CI)
  const runnableWorkflows = workflowDocs.filter(w => w.syntheticScript);
  if (runnableWorkflows.length === 0) {
    return { error: 'no_runnable_workflows', detail: 'None of the selected workflows have a syntheticScript defined' } as any;
  }

  // Create run record
  const run = await repo.createRun({
    orgId,
    suiteId: body.suiteId || null,
    trigger: body.trigger,
    environment: 'ci',
    status: 'queued',
    gitContext: body.gitContext,
    webhookUrl: body.webhookUrl,
    instanceIds: [],
  });

  // Fire-and-forget async execution
  void (async () => {
    const runId = String(run.id);
    await repo.updateRun(runId, {
      status: 'running',
      startedAt: new Date(),
      progress: { completed: 0, total: runnableWorkflows.length },
    });

    try {
      const allInstanceIds: string[] = [];
      let totalPassed = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      let totalError = 0;

      for (let i = 0; i < runnableWorkflows.length; i++) {
        const workflow = runnableWorkflows[i];
        const script = workflow.syntheticScript;

        // Create a workflow instance for this execution
        const instanceId = randomUUID();
        await repo.createWorkflowInstance({
          id: instanceId,
          orgId,
          workflowId: workflow.id,
          environment: 'ci',
          trigger: body.trigger,
          status: 'open',
          runId,
          gitContext: body.gitContext,
          metadata: { workflowKey: workflow.name },
        });

        allInstanceIds.push(instanceId);

        // Map workflow syntheticScript to EngineTest
        const engineTest: EngineTest = {
          _id: instanceId,
          name: workflow.name,
          orgId,
          suiteId: body.suiteId || workflow.suiteId || '',
          script: typeof script === 'string' ? yaml.load(script) : null,
          preSteps: script.preSteps || [],
          steps: script.steps || [],
          variables: script.variables || [],
          objective: script.objective,
          maxTurns: script.maxTurns || 8,
          iterate: script.iterate ?? true,
          continueAfterPass: script.continueAfterPass ?? false,
          minTurns: script.minTurns || 1,
          judgeConfig: script.judgeConfig,
        };

        // Resolve persona if specified
        if (script.personaId) {
          try {
            const persona = await repo.getPersona(orgId, script.personaId);
            if (persona) {
              engineTest.personaText = (persona as any)?.yaml || (persona as any)?.text || '';
            }
          } catch {}
        }

        // Build engine environment from connection
        let engineEnv: EngineContext['environment'] = { channel: 'http_chat' };
        const connKey = script.connectionKey || body.connKey;
        if (connKey) {
          try {
            const org = await repo.getOrganizationById(orgId);
            const conn = (org?.connections as any)?.[connKey];
            if (conn?.base_url) {
              engineEnv = {
                channel: conn.protocol || 'http_chat',
                baseUrl: conn.base_url,
                headers: conn.headers,
                timeoutMs: conn.timeoutMs || conn.timeout_ms,
                protocol: conn.protocol || 'http_chat',
                responseFieldPath: conn.responseFieldPath || 'reply',
                sse: conn.sse || conn.sseConfig,
                websocket: conn.websocket || conn.websocketConfig,
              };
            }
          } catch {}
        }

        const judgeBase = process.env.JUDGE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3101}`;
        const ctx: EngineContext = {
          orgId,
          judgeUrl: `${judgeBase}/orgs/${orgId}/judge`,
          authHeader: body.authHeader,
          environment: engineEnv,
        };

        // Run the engine for this single workflow
        let result: EngineRunResult;
        try {
          result = await runTestsWithEngine([engineTest], ctx, {
            executeRequest: async (oid, requestId, input, interpCtx) => {
              const exec = await executeRequest(oid, requestId, input, body.authHeader, () => {}, undefined, undefined, body.envId, interpCtx);
              return { status: String(exec.status), payload: exec.payload };
            },
          });
        } catch (e: any) {
          // Engine failure for this workflow
          await repo.updateWorkflowInstance(instanceId, {
            status: 'error',
            completedAt: new Date(),
            totals: { passed: 0, failed: 0, skipped: 0, error: 1 },
          });
          totalError++;
          continue;
        }

        // Map engine result to workflow instance
        const item = result.items[0];
        const instanceStatus = item?.status === 'passed' ? 'passed' : item?.status === 'skipped' ? 'passed' : 'failed';

        await repo.updateWorkflowInstance(instanceId, {
          status: instanceStatus,
          transcript: item?.transcript || [],
          completedAt: new Date(),
          totals: {
            passed: result.passed,
            failed: result.failed,
            skipped: result.skipped,
            error: 0,
          },
        });

        if (instanceStatus === 'passed') totalPassed++;
        else totalFailed++;

        // Update run progress
        await repo.updateRun(runId, {
          progress: { completed: i + 1, total: runnableWorkflows.length, currentWorkflow: workflow.name },
          instanceIds: allInstanceIds,
        });
      }

      // Finalize the run
      const runStatus = totalFailed === 0 && totalError === 0 ? 'passed' : 'failed';
      await repo.updateRun(runId, {
        status: runStatus,
        finishedAt: new Date(),
        instanceIds: allInstanceIds,
        totals: {
          total: runnableWorkflows.length,
          passed: totalPassed,
          failed: totalFailed,
          skipped: totalSkipped,
          error: totalError,
        },
      });

      // Fire webhook if configured
      if (body.webhookUrl) {
        try {
          await fetch(body.webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              runId,
              status: runStatus,
              totals: { total: runnableWorkflows.length, passed: totalPassed, failed: totalFailed },
            }),
          });
        } catch {}
      }
    } catch (e: any) {
      await repo.updateRun(runId, {
        status: 'failed',
        finishedAt: new Date(),
        error: { message: e?.message || 'run_failed' },
      });
    }
  })();

  return { runId: String(run.id), status: 'queued' };
}
