/**
 * DB-backed Test Run Starter
 *
 * Restored from legacy and updated to use Drizzle ORM repo methods.
 * Loads a test suite from the database, runs its tests through the engine,
 * and persists results back to the test_runs table.
 */

import yaml from 'js-yaml';
import { repo } from '../../db/repo.js';
import { writeRunResultToDisk } from '../../lib/resultsStore.js';
import { appendQuery } from '../../lib/url.js';
import { executeRequest } from '../../lib/httpRequests.js';
import { runTestsWithEngine, EngineContext, EngineTest } from './engine.js';
import { checkRunEntitlement } from '../entitlementCheck.js';

export type DbRunStartInput = {
  trigger: 'manual' | 'schedule' | 'ci';
  gitContext?: any;
  authHeader?: string;
  webhookUrl?: string;
  suiteId: string;
  envId?: string;
  connKey?: string;
  tests?: string[];
};

export async function startDbBackedRun(body: DbRunStartInput) {
  const suite = await repo.getSuiteById(body.suiteId);
  if (!suite) return { error: 'suite_not_found' } as any;

  // Entitlement backstop: verify the org is allowed to run tests
  const orgId = String(suite.orgId);
  const entitlement = await checkRunEntitlement(orgId);
  if (!entitlement.allowed) {
    return { error: 'entitlement_exceeded', reason: entitlement.reason } as any;
  }

  let chosenConnKey: string | undefined = undefined;
  if (body.connKey) chosenConnKey = body.connKey;
  if (!chosenConnKey && !body.envId && suite.defaultConnectionKey) {
    chosenConnKey = String(suite.defaultConnectionKey);
  }

  const run = await repo.createTestRun({
    orgId: suite.orgId,
    suiteId: suite.id,
    trigger: body.trigger,
    envId: body.envId,
    connectionKey: chosenConnKey,
    status: 'queued',
    gitContext: body.gitContext,
  });

  void (async () => {
    const runId = String(run.id);
    const startedAt = new Date();
    await repo.updateTestRun(run.id, {
      status: 'running',
      startedAt,
      progress: {
        status: 'running',
        items: [],
        updatedAt: new Date().toISOString(),
      },
    });

    try {
      const testsRaw = await repo.getTests({
        orgId: String(suite.orgId),
        suiteId: String(suite.id),
        ids: body.tests,
      });

      const envId = body.envId || suite.defaultEnvId;
      const envDoc = envId
        ? await repo.getEnvironment(orgId, envId)
        : null;

      // Helper to resolve relative URLs to absolute using API_BASE_URL
      const resolveBaseUrl = (url: string): string => {
        if (!url) return url;
        const apiBase = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url)) {
          const urlObj = new URL(url);
          const path = urlObj.pathname + urlObj.search + urlObj.hash;
          return `${apiBase}${path}`;
        }
        if (/^https?:\/\//i.test(url)) return url;
        return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
      };

      let connEnv: {
        channel: string;
        baseUrl?: string;
        headers?: any;
        timeoutMs?: number;
        protocol?: string;
        responseFieldPath?: string;
        sse?: { contentPath?: string; finishPath?: string; finishValue?: string | string[] };
        websocket?: { messageFormat?: string; messageField?: string; contentPath?: string; finishPath?: string; finishValue?: string | string[]; protocols?: string | string[] };
      } | null = null;

      if (body.connKey) {
        try {
          const org = await repo.getOrganizationById(String(suite.orgId));
          const key = body.connKey;
          const conn = (org?.connections as any)?.[key];
          if (conn?.base_url) {
            connEnv = {
              channel: conn.protocol || 'http_chat',
              baseUrl: resolveBaseUrl(conn.base_url),
              headers: conn.headers || undefined,
              timeoutMs: conn.timeoutMs || conn.timeout_ms || undefined,
              protocol: conn.protocol || 'http_chat',
              responseFieldPath: conn.responseFieldPath || conn.response_field_path || 'reply',
              sse: conn.sse || conn.sseConfig || undefined,
              websocket: conn.websocket || conn.websocketConfig || undefined,
            };
          }
        } catch {}
      } else if (!envDoc && suite.defaultConnectionKey) {
        try {
          const org = await repo.getOrganizationById(String(suite.orgId));
          const key = suite.defaultConnectionKey;
          const conn = (org?.connections as any)?.[key];
          if (conn?.base_url) {
            connEnv = {
              channel: 'http_chat',
              baseUrl: resolveBaseUrl(conn.base_url),
              headers: undefined,
              timeoutMs: undefined,
            };
            if (!chosenConnKey) {
              chosenConnKey = String(key);
              await repo.updateTestRun(run.id, { connectionKey: chosenConnKey });
            }
          }
        } catch {}
      }

      // Fallback: if no environment or connection selected, use the first available org connection
      if (!connEnv && !envDoc) {
        try {
          const org = await repo.getOrganizationById(String(suite.orgId));
          const connections = (org?.connections as any) || {};
          const firstKey = Object.keys(connections)[0];
          if (firstKey && connections[firstKey]?.base_url) {
            connEnv = {
              channel: 'http_chat',
              baseUrl: resolveBaseUrl(connections[firstKey].base_url),
              headers: undefined,
              timeoutMs: undefined,
            };
            chosenConnKey = firstKey;
            await repo.updateTestRun(run.id, { connectionKey: chosenConnKey });
          }
        } catch {}
      }

      const engineEnv = (connEnv || {
        channel: (envDoc as any)?.channel || 'http_chat',
        baseUrl: (envDoc as any)?.baseUrl,
        headers: (envDoc as any)?.headers,
        timeoutMs: (envDoc as any)?.timeoutMs,
      }) as EngineContext['environment'];

      // Store assistant metadata in the run for visibility
      const assistantName = chosenConnKey || (envDoc as any)?.name || undefined;
      const assistantMeta = {
        name: assistantName,
        url: engineEnv.baseUrl,
        channel: engineEnv.channel,
      };
      await repo.updateTestRun(run.id, { assistant: assistantMeta });

      const authHeader = body.authHeader || undefined;
      const judgeBase = process.env.JUDGE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3101}`;
      const judgeUrl = `${judgeBase}/orgs/${suite.orgId}/judge`;

      const engineTests: EngineTest[] = [];
      for (const t of testsRaw) {
        let personaText = '';
        try {
          const personaId = t.personaId as string | undefined;
          if (personaId) {
            const p = await repo.getPersona(String(suite.orgId), personaId);
            personaText = (p as any)?.yaml || (p as any)?.text || '';
          }
        } catch {}

        const script = typeof t.script === 'string'
          ? (yaml.load(t.script) as any)
          : t.script;

        engineTests.push({
          _id: String(t.id),
          name: t.name || undefined,
          orgId: String(suite.orgId),
          suiteId: String(suite.id),
          script,
          personaText,
          preSteps: t.preSteps as any,
          steps: t.steps as any,
          variables: t.variables as any,
          objective: t.objective || undefined,
          maxTurns: t.maxTurns || undefined,
          iterate: t.iterate ?? undefined,
          continueAfterPass: t.continueAfterPass ?? undefined,
          minTurns: t.minTurns || undefined,
          judgeConfig: t.judgeConfig as any,
        });
      }

      // Extract ALL pending steps from all tests for progress display
      const pendingSteps: any[] = [];
      for (const et of engineTests) {
        const steps = Array.isArray(et.steps) ? et.steps : [];
        steps.forEach((step: any, idx: number) => {
          const stepType = String(step?.type || '').toLowerCase();
          const baseStep = {
            testId: et._id,
            testName: et.name,
            stepIndex: idx,
            stepId: step.id || `step_${idx}`,
            stepType,
            stepName: step.name || `Step ${idx + 1}`,
          };

          if (stepType === 'assistant_check') {
            pendingSteps.push({
              ...baseStep,
              rubric: step.rubric,
              threshold: step.threshold,
              mode: step.mode || 'judge',
            });
          } else if (stepType === 'message') {
            pendingSteps.push({
              ...baseStep,
              role: step.role || 'user',
              content: step.content,
            });
          } else if (stepType === 'request') {
            pendingSteps.push({
              ...baseStep,
              requestId: step.requestId,
              inputMappings: step.inputMappings,
              saveAs: step.saveAs,
            });
          } else {
            pendingSteps.push(baseStep);
          }
        });
      }

      // Store pending steps in progress
      if (pendingSteps.length > 0) {
        await repo.updateTestRun(run.id, {
          progress: {
            status: 'running',
            pendingSteps,
            completedAssertions: [],
            completedSteps: [],
            updatedAt: new Date().toISOString(),
          } as any,
        });
      }

      const ctx: EngineContext = {
        orgId: String(suite.orgId),
        judgeUrl,
        authHeader,
        environment: engineEnv,
      };

      const engineResult = await runTestsWithEngine(engineTests, ctx, {
        executeRequest: async (oid, requestId, input, interpolationContext) => {
          const exec = await executeRequest(oid, requestId, input, authHeader, () => {}, undefined, undefined, envId, interpolationContext);
          return { status: String(exec.status), payload: exec.payload };
        },
        log: async (entry: any) => {
          const fresh = await repo.getTestRunById(run.id);
          if ((fresh as any)?.stopRequested) throw new Error('stopped');

          const freshProgress = (fresh as any)?.progress || {};

          // Extract last judge check if this entry is a judge_check
          const lastJudge = entry?.type === 'judge_check' ? {
            pass: entry.pass,
            details: entry.details,
            subtype: entry.subtype,
          } : (freshProgress.lastJudge || undefined);

          const tailTranscript = Array.isArray(entry?.transcript) ? entry.transcript : (freshProgress.tailTranscript || undefined);

          const existingLatencies = Array.isArray(freshProgress.latencies) ? freshProgress.latencies : [];
          const latencies = entry?.type === 'assistant_reply' && typeof entry?.latencyMs === 'number'
            ? [...existingLatencies, entry.latencyMs]
            : existingLatencies;

          const existingAssertions = Array.isArray(freshProgress.completedAssertions) ? freshProgress.completedAssertions : [];
          const completedAssertions = entry?.type === 'judge_check' && entry?.stepIndex != null
            ? [...existingAssertions.filter((a: any) => a.stepIndex !== entry.stepIndex), {
                stepIndex: entry.stepIndex,
                stepName: entry.details?.stepName || entry.stepName,
                pass: entry.pass,
                score: entry.details?.score,
                threshold: entry.details?.threshold,
                rubric: entry.details?.rubric,
                reasoning: entry.details?.reasoning,
              }]
            : existingAssertions;

          const existingSteps = Array.isArray(freshProgress.completedSteps) ? freshProgress.completedSteps : [];
          let completedSteps = existingSteps;

          if (entry?.type === 'user_message' && entry?.stepIndex != null) {
            completedSteps = [...existingSteps.filter((s: any) => s.stepIndex !== entry.stepIndex), {
              stepIndex: entry.stepIndex, stepType: 'message', role: 'user',
              content: entry.content, status: 'completed', completedAt: new Date().toISOString(),
            }];
          } else if (entry?.type === 'system_message' && entry?.stepIndex != null) {
            completedSteps = [...existingSteps.filter((s: any) => s.stepIndex !== entry.stepIndex), {
              stepIndex: entry.stepIndex, stepType: 'message', role: 'system',
              content: entry.content, status: 'completed', completedAt: new Date().toISOString(),
            }];
          } else if (entry?.type === 'request' && entry?.stepIndex != null) {
            completedSteps = [...existingSteps.filter((s: any) => s.stepIndex !== entry.stepIndex), {
              stepIndex: entry.stepIndex, stepType: 'request', requestId: entry.requestId,
              status: entry.status || 'completed', response: entry.payload, input: entry.input,
              requestDetails: entry.requestDetails, responseHeaders: entry.responseHeaders,
              contentType: entry.contentType, completedAt: new Date().toISOString(),
            }];
          } else if (entry?.type === 'request_error' && entry?.stepIndex != null) {
            completedSteps = [...existingSteps.filter((s: any) => s.stepIndex !== entry.stepIndex), {
              stepIndex: entry.stepIndex, stepType: 'request', requestId: entry.requestId,
              status: 'error', error: entry.error, input: entry.input,
              completedAt: new Date().toISOString(),
            }];
          } else if (entry?.type === 'judge_check' && entry?.stepIndex != null) {
            completedSteps = [...existingSteps.filter((s: any) => s.stepIndex !== entry.stepIndex), {
              stepIndex: entry.stepIndex, stepType: 'assistant_check', pass: entry.pass,
              score: entry.details?.score, threshold: entry.details?.threshold,
              rubric: entry.details?.rubric, reasoning: entry.details?.reasoning,
              status: 'completed', completedAt: new Date().toISOString(),
            }];
          } else if (entry?.type === 'user_objective_end' && entry?.stepIndex != null) {
            completedSteps = [...existingSteps.filter((s: any) => s.stepIndex !== entry.stepIndex), {
              stepIndex: entry.stepIndex, stepType: 'user_objective', name: entry.stepName,
              objective: entry.objective, pass: entry.passed, turns: entry.turns,
              attachedChecks: entry.attachedChecks, status: 'completed',
              completedAt: new Date().toISOString(),
            }];
          }

          const currentStepIndex = entry?.stepIndex ?? freshProgress.currentStepIndex ?? 0;

          await repo.updateTestRun(run.id, {
            progress: {
              status: 'running',
              currentTestId: entry?.currentTestId,
              currentStepIndex,
              tailLogs: [entry],
              tailTranscript,
              lastJudge,
              completedAssertions,
              completedSteps,
              latencies,
              pendingSteps: freshProgress.pendingSteps,
              updatedAt: new Date().toISOString(),
            } as any,
          });
        },
      });

      const { items, passed, failed, skipped, judgeScores } = engineResult;

      const passRate = passed / Math.max(1, passed + failed + skipped);
      let avgJudge: number | undefined = undefined;
      if (judgeScores.length) {
        const normalized = judgeScores.map((s) => {
          if (typeof s !== 'number' || !isFinite(s)) return 0;
          if (s <= 1) return s;
          if (s <= 10) return s / 10;
          return s / 100;
        });
        avgJudge = normalized.reduce((a, b) => a + b, 0) / normalized.length;
      }

      const finishedAt = new Date();
      const runStatus = failed === 0 && skipped === 0 ? 'passed' : failed === 0 ? 'partial' : 'failed';

      const savedItems = items.map((it) => ({
        testId: it.testId,
        testName: it.testName,
        status: it.status,
        transcript: it.transcript || [],
        messageCounts: it.messageCounts,
        assertions: it.assertions,
        confirmations: it.confirmations,
        timings: it.timings,
        artifacts: it.artifacts,
        error: it.error,
      }));

      await repo.updateTestRun(run.id, {
        status: runStatus,
        finishedAt,
        items: savedItems as any,
        totals: { passed, failed, skipped },
        summaryScore: avgJudge,
        progress: {
          status: 'completed',
          updatedAt: new Date().toISOString(),
        } as any,
      });

      try {
        const fullResultDoc = {
          id: runId,
          suiteId: String(suite.id),
          orgId: String(suite.orgId),
          startedAt,
          finishedAt,
          result: {
            items,
            totals: { passed, failed, skipped },
            passRate,
            judge: { avgScore: avgJudge },
          },
        };
        await writeRunResultToDisk(runId, fullResultDoc as any);
      } catch {}

      await repo.createUsage({
        orgId: String(suite.orgId),
        suiteId: String(suite.id),
        runId,
        status: runStatus,
        startedAt,
        finishedAt,
        itemsCount: items.length,
      } as any);

      if (body.webhookUrl) {
        try {
          const url = appendQuery(body.webhookUrl, {
            runId,
            suiteId: String(suite.id),
            orgId: String(suite.orgId),
            status: runStatus,
          });
          await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              runId,
              status: runStatus,
              totals: { passed, failed, skipped },
              passRate,
              judge: { avgScore: avgJudge },
            }),
          });
        } catch {}
      }
    } catch (e: any) {
      const errMsg = e?.message || 'run_failed';
      await repo.updateTestRun(run.id, {
        status: errMsg === 'stopped' ? 'stopped' : 'failed',
        finishedAt: new Date(),
      });
    }
  })();

  return { runId: String(run.id), status: 'queued' } as any;
}
