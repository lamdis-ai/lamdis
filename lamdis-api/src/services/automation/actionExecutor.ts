import { db } from '../../db.js';
import { actions, actionBindings, actionExecutions, evidenceEvents, outcomeInstances, inputRequests } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto.js';
import { executeHostedJS } from '../hosted/executor.js';
import { isPrivateHost } from '../hosted/ssrf-guard.js';
import { assertConnectorAllowed, type PlaybookViolation } from '../playbooks/playbookEnforcement.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecuteActionResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

interface ExecutionStep {
  step: string;
  status: string;
  at: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Execute an action from an actionExecution record.
 * This is the critical missing piece: it actually invokes the HTTP endpoint or hosted JS,
 * records execution steps, emits evidence, and updates the execution status.
 *
 * Set `skipPlaybookEnforcement` to true to bypass the playbook connector gate
 * for this single invocation. Used when the user has explicitly approved an
 * unbound system via an input request.
 */
export interface ExecuteActionOptions {
  inputOverride?: Record<string, unknown>;
  skipPlaybookEnforcement?: boolean;
}

export async function executeAction(
  actionExecutionId: string,
  optsOrInput?: ExecuteActionOptions | Record<string, unknown>,
): Promise<ExecuteActionResult> {
  // Backwards-compat: callers that passed a plain inputOverride object still work.
  const opts: ExecuteActionOptions =
    optsOrInput && ('inputOverride' in optsOrInput || 'skipPlaybookEnforcement' in optsOrInput)
      ? (optsOrInput as ExecuteActionOptions)
      : { inputOverride: optsOrInput as Record<string, unknown> | undefined };
  const inputOverride = opts.inputOverride;
  const startTime = Date.now();
  const steps: ExecutionStep[] = [];

  function step(name: string, status: string, details?: unknown) {
    steps.push({ step: name, status, at: new Date().toISOString(), details });
  }

  try {
    // 1. Load the action execution record
    const [exec] = await db.select().from(actionExecutions)
      .where(eq(actionExecutions.id, actionExecutionId))
      .limit(1);

    if (!exec) {
      return { ok: false, error: 'Action execution not found', durationMs: Date.now() - startTime };
    }

    step('load_execution', 'ok');

    // Mark as executing
    await db.update(actionExecutions).set({
      status: 'executing',
      startedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(actionExecutions.id, actionExecutionId));

    // 2. Load the action definition
    if (!exec.actionId) {
      return fail(actionExecutionId, steps, 'No actionId on execution record', startTime);
    }

    const [action] = await db.select().from(actions)
      .where(eq(actions.id, exec.actionId))
      .limit(1);

    if (!action) {
      return fail(actionExecutionId, steps, `Action ${exec.actionId} not found`, startTime);
    }

    step('load_action', 'ok', { actionId: action.actionId, title: action.title });

    // 3. Determine execution mode and run
    const input = inputOverride ?? (exec.evidenceSnapshot as any)?.actionInput ?? {};
    let result: unknown;

    if (action.isMock && action.staticResponse) {
      // --- Mock mode ---
      step('execute_mock', 'ok');
      result = action.staticResponse;

    } else if (action.hosted?.code) {
      // --- Hosted JS execution ---
      step('execute_hosted', 'running');
      const hostedResult = await executeHostedJS({
        code: action.hosted.code,
        input,
        permissions: action.hosted.permissions,
        timeoutMs: action.hosted.timeout_ms,
      });

      if (!hostedResult.ok) {
        step('execute_hosted', 'failed', { error: hostedResult.error });
        return fail(actionExecutionId, steps, `Hosted execution failed: ${hostedResult.error}`, startTime);
      }

      step('execute_hosted', 'ok', { logs: hostedResult.logs });
      result = hostedResult.body;

    } else if (action.method && action.path) {
      // --- HTTP execution ---
      // Resolve binding for environment-specific URL/auth
      const binding = await resolveBinding(action.orgId, action.actionId, exec.orgId);
      const baseUrl = binding?.baseUrl || (action.transport as any)?.authority || '';

      if (!baseUrl) {
        return fail(actionExecutionId, steps, 'No baseUrl: action has no binding or transport authority', startTime);
      }

      // Playbook gate: if a playbook is active on this instance, ensure the
      // binding's connector is bound to it. Skipped when the caller has
      // explicitly approved this execution past the gate.
      if (!opts.skipPlaybookEnforcement && exec.outcomeInstanceId) {
        const enforcement = await assertConnectorAllowed(
          exec.outcomeInstanceId,
          binding?.connectorInstanceId ?? null,
        );
        if (!enforcement.allowed) {
          step('playbook_blocked', 'blocked', enforcement.violation);
          return blockByPlaybook(
            actionExecutionId,
            exec.orgId,
            exec.outcomeInstanceId,
            action,
            enforcement.violation,
            steps,
            startTime,
          );
        }
        step('playbook_allowed', 'ok', { connectorInstanceId: binding?.connectorInstanceId ?? null });
      }

      const url = `${baseUrl.replace(/\/$/, '')}${action.path}`;

      // SSRF guard
      try {
        const hostname = new URL(url).hostname;
        if (isPrivateHost(hostname)) {
          return fail(actionExecutionId, steps, `SSRF blocked: ${hostname} is a private address`, startTime);
        }
      } catch {
        return fail(actionExecutionId, steps, `Invalid URL: ${url}`, startTime);
      }

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(action.headers as Record<string, string> || {}),
        ...(binding?.headers as Record<string, string> || {}),
      };

      // Resolve auth from binding/connector
      if (binding?.auth) {
        await resolveAuth(binding.auth, headers, exec.orgId);
      }

      step('execute_http', 'running', { method: action.method, url });

      const fetchOpts: RequestInit = {
        method: action.method,
        headers,
        signal: AbortSignal.timeout(binding?.timeoutMs || 30000),
      };

      if (action.method !== 'GET' && action.method !== 'HEAD') {
        const body = mergeInputWithBody(action.body as Record<string, unknown>, input);
        fetchOpts.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOpts);
      const responseBody = await safeParseResponse(response);

      if (!response.ok) {
        step('execute_http', 'failed', { status: response.status, body: responseBody });
        return fail(actionExecutionId, steps, `HTTP ${response.status}: ${JSON.stringify(responseBody)}`, startTime);
      }

      step('execute_http', 'ok', { status: response.status });
      result = responseBody;

    } else {
      return fail(actionExecutionId, steps, 'Action has no executable configuration (no hosted code, HTTP method/path, or mock)', startTime);
    }

    // 4. Record success
    step('completed', 'ok');
    const durationMs = Date.now() - startTime;

    await db.update(actionExecutions).set({
      status: 'completed',
      executionLog: { steps, result },
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(actionExecutions.id, actionExecutionId));

    // 5. Emit evidence event
    if (exec.outcomeInstanceId) {
      await emitActionEvidence(exec.orgId, exec.outcomeInstanceId, actionExecutionId, action, result, durationMs);
    }

    return { ok: true, result, durationMs };

  } catch (err: any) {
    step('error', 'fatal', { message: err?.message });
    await fail(actionExecutionId, steps, err?.message || 'Unknown execution error', startTime);
    return { ok: false, error: err?.message, durationMs: Date.now() - startTime };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fail(
  executionId: string,
  steps: ExecutionStep[],
  error: string,
  startTime: number,
): Promise<ExecuteActionResult> {
  try {
    await db.update(actionExecutions).set({
      status: 'failed',
      executionLog: { steps, error },
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(actionExecutions.id, executionId));
  } catch { /* best effort */ }
  return { ok: false, error, durationMs: Date.now() - startTime };
}

/**
 * Mark an execution as blocked by playbook enforcement and create an
 * inputRequest so the user can either approve the unbound system once or
 * pick a bound alternative. Returns a non-OK result so callers (e.g. the
 * orchestrator) can stop further work and surface the wait state.
 */
async function blockByPlaybook(
  executionId: string,
  orgId: string,
  outcomeInstanceId: string,
  action: any,
  violation: PlaybookViolation,
  steps: ExecutionStep[],
  startTime: number,
): Promise<ExecuteActionResult> {
  try {
    await db.update(actionExecutions).set({
      status: 'blocked_by_playbook',
      blockedReason: `Connector "${violation.connectorInstanceName ?? 'unbound'}" not in active playbook`,
      executionLog: { steps, violation },
      updatedAt: new Date(),
    } as any).where(eq(actionExecutions.id, executionId));
  } catch { /* best effort */ }

  // Build a human description of the violation
  const reasonText =
    violation.reason === 'no_connector_link'
      ? `Action "${action.title || action.actionId}" has no connector instance linked to its binding, so it cannot be matched against the active playbook.`
      : `Action "${action.title || action.actionId}" wants to use the connector "${violation.connectorInstanceName ?? violation.connectorInstanceId}", which is not bound to the active playbook.`;

  const boundList = violation.boundConnectorInstanceNames
    .map((b) => `- ${b.name}`)
    .join('\n');

  const description = [
    reasonText,
    '',
    'Bound systems for this playbook:',
    boundList || '(none)',
    '',
    'Choose how to resolve:',
    '- approve_unbound: run this action once with the unbound system and record the override',
    '- pick_bound: pick one of the bound systems to use instead',
    '- cancel: cancel this action',
  ].join('\n');

  try {
    await db.insert(inputRequests).values({
      orgId,
      outcomeInstanceId,
      requestType: 'approval',
      title: 'Action blocked by active playbook',
      description,
      schema: {
        kind: 'playbook_violation',
        actionExecutionId: executionId,
        actionId: action.id,
        actionTitle: action.title || action.actionId,
        blockedConnectorInstanceId: violation.connectorInstanceId,
        boundConnectorInstanceIds: violation.boundConnectorInstanceIds,
        boundConnectorInstanceNames: violation.boundConnectorInstanceNames,
        activePlaybookId: violation.activePlaybookId,
        choices: ['approve_unbound', 'pick_bound', 'cancel'],
      },
      priority: 'high',
      status: 'pending',
    } as any);
  } catch (err: any) {
    console.error('[action-executor] Failed to create playbook block input request:', err?.message);
  }

  // Emit an evidence event so the timeline shows the violation
  try {
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId,
      eventType: 'playbook.violation.blocked',
      eventSource: 'agent:action_executor',
      payload: {
        actionExecutionId: executionId,
        actionId: action.actionId,
        violation,
      },
      confirmationLevel: 'A',
      idempotencyKey: `pb-violation-${executionId}`,
      emittedAt: new Date(),
    });
  } catch { /* best effort */ }

  return {
    ok: false,
    error: 'blocked_by_playbook',
    durationMs: Date.now() - startTime,
  };
}

async function resolveBinding(
  actionOrgId: string,
  actionSlug: string,
  execOrgId: string,
) {
  // Try to find a binding for this action in the execution's org
  const [binding] = await db.select().from(actionBindings)
    .where(and(
      eq(actionBindings.orgId, execOrgId),
      eq(actionBindings.actionId, actionSlug),
      eq(actionBindings.enabled, true),
    ))
    .limit(1);
  return binding || null;
}

async function resolveAuth(
  authConfig: Record<string, unknown>,
  headers: Record<string, string>,
  orgId: string,
) {
  const type = authConfig.type as string;

  if (type === 'bearer' || type === 'token') {
    // Token may be stored encrypted in connector installation
    const connectionKey = authConfig.connectionKey as string;
    if (connectionKey) {
      const tokens = await loadConnectorTokens(orgId, connectionKey);
      if (tokens?.access_token) {
        const prefix = (authConfig.tokenPrefix as string) || 'Bearer';
        headers['Authorization'] = `${prefix} ${tokens.access_token}`;
      }
    } else if (authConfig.tokenVariableKey) {
      // Token from env variable
      const envVal = process.env[authConfig.tokenVariableKey as string];
      if (envVal) {
        headers['Authorization'] = `Bearer ${envVal}`;
      }
    }
  }

  // Custom headers from auth config
  if (authConfig.customHeaders && typeof authConfig.customHeaders === 'object') {
    Object.assign(headers, authConfig.customHeaders);
  }
}

async function loadConnectorTokens(orgId: string, connectionKey: string): Promise<any> {
  // Load from connector_installations table by connectionKey
  try {
    const { connectorInstallations } = await import('@lamdis/db/schema');
    const [inst] = await db.select().from(connectorInstallations)
      .where(and(
        eq(connectorInstallations.orgId, orgId),
      ))
      .limit(1);
    if (inst?.tokens) {
      return decrypt(inst.tokens);
    }
  } catch { /* connector not installed */ }
  return null;
}

function mergeInputWithBody(
  bodyTemplate: Record<string, unknown> | null | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (!bodyTemplate) return input;
  // Simple template variable replacement: {{key}} → input[key]
  const merged = JSON.stringify(bodyTemplate);
  const resolved = merged.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = input[key];
    return val !== undefined ? String(val) : '';
  });
  try {
    return JSON.parse(resolved);
  } catch {
    return { ...bodyTemplate, ...input };
  }
}

async function safeParseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { return await response.json(); } catch { /* fall through */ }
  }
  return await response.text();
}

async function emitActionEvidence(
  orgId: string,
  outcomeInstanceId: string,
  executionId: string,
  action: any,
  result: unknown,
  durationMs: number,
) {
  try {
    await db.insert(evidenceEvents).values({
      orgId,
      outcomeInstanceId,
      eventType: 'action.executed',
      eventSource: 'agent:action_executor',
      payload: {
        actionId: action.actionId,
        actionTitle: action.title,
        executionId,
        result: truncateResult(result),
        durationMs,
      },
      confirmationLevel: 'A',
      idempotencyKey: `action-exec-${executionId}`,
      emittedAt: new Date(),
    });

    // Increment event count on instance
    const { sql: sqlFn } = await import('drizzle-orm');
    await db.update(outcomeInstances).set({
      eventCount: sqlFn`COALESCE(${outcomeInstances.eventCount}, 0) + 1`,
      lastEventAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(outcomeInstances.id, outcomeInstanceId));
  } catch (err: any) {
    console.error('[action-executor] Failed to emit evidence:', err?.message);
  }
}

function truncateResult(result: unknown): unknown {
  // Prevent huge payloads in evidence events
  const str = JSON.stringify(result);
  if (str && str.length > 10000) {
    return { _truncated: true, preview: str.slice(0, 2000), originalLength: str.length };
  }
  return result;
}
