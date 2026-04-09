import fetch from 'cross-fetch';
import { interpolateDeep, interpolateString } from '../../lib/interpolation.js';
import { resolveTestVariables } from '../../lib/generators.js';
import { synthesizeInitialUserMessage } from '../../lib/initialUserMessage.js';
import { extractFromConversation } from '../extractionService.js';
import { 
  sendAssistantMessage, 
  createConnectionConfig, 
  AssistantProtocol, 
  AssistantConnectionConfig,
  isStreamingProtocol 
} from '../../lib/assistantClient.js';

/**
 * Resolve a URL that may be relative to the API base.
 * If the URL starts with '/', prepends API_BASE_URL.
 * If already absolute (http:// or https://), returns as-is.
 */
function resolveBaseUrl(url: string): string {
  if (!url) return url;
  // Already absolute
  if (/^https?:\/\//i.test(url)) return url;
  // Relative - prepend API_BASE_URL
  const apiBase = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

export type EngineEnvironment = {
  channel: string;
  baseUrl?: string;
  headers?: Record<string, any>;
  timeoutMs?: number;
  // Protocol for assistant communication: 'http_chat' (default), 'sse', 'websocket'
  protocol?: AssistantProtocol;
  // Path to response field for extracting assistant reply (e.g., 'reply', 'data.response')
  responseFieldPath?: string;
  // SSE-specific configuration
  sse?: {
    contentPath?: string;
    finishPath?: string;
    finishValue?: string | string[];
  };
  // WebSocket-specific configuration
  websocket?: {
    messageFormat?: 'json' | 'text';
    messageField?: string;
    contentPath?: string;
    finishPath?: string;
    finishValue?: string | string[];
    protocols?: string | string[];
  };
};

export type EngineTest = {
  _id: string;
  name?: string;
  orgId: string;
  suiteId: string;
  script: any;
  personaText?: string;
  preSteps?: any[];  // Pre-steps executed before main steps to set up test data
  steps?: any[];
  variables?: Array<{ key: string; value: string; description?: string }>;
  objective?: string;
  maxTurns?: number;
  iterate?: boolean;
  continueAfterPass?: boolean;
  minTurns?: number;
  judgeConfig?: { rubric?: string; threshold?: number };
};

export type EngineContext = {
  orgId: string;
  judgeUrl: string;
  wfUrl?: string;
  authHeader?: string;
  environment: EngineEnvironment;
};

export type EngineRunHooks = {
  executeRequest?: (
    orgId: string,
    requestId: string,
    input: any,
    interpolationContext?: any,
  ) => Promise<{ status: string; payload: any }>;
  log?: (entry: any) => void;
};

export type EngineItemResult = {
  testId: string;
  testName?: string;
  status: string;
  transcript: any[];
  messageCounts: { user: number; assistant: number; total: number };
  assertions: any[];
  confirmations: any[];
  timings: any;
  error?: any;
  artifacts?: { log?: any[] };
};

export type EngineRunResult = {
  items: EngineItemResult[];
  passed: number;
  failed: number;
  skipped: number;
  judgeScores: number[];
};

const defaultFallbackPrompts = [
  'Can you share the official page or link where I can do this?',
  'Could you give me simple step-by-step instructions with where to click?',
  'Can you show me a concrete example I could reuse?',
  'Are there any limits, timing rules, or gotchas I should know about?',
  'What are my next steps from here?'
];

export async function runTestsWithEngine(
  tests: EngineTest[],
  ctx: EngineContext,
  hooks: EngineRunHooks = {},
): Promise<EngineRunResult> {
  const wfUrl = ctx.wfUrl;
  const authHeader = ctx.authHeader;
  const judgeUrl = ctx.judgeUrl;

  const items: EngineItemResult[] = [];
  let passed = 0, failed = 0, skipped = 0;
  const judgeScores: number[] = [];

  const now = () => new Date().toISOString();

  for (const t of tests) {
    const logs: any[] = [];
    const log = (e: any) => {
      logs.push(e);
      hooks.log?.(e);
    };
    try {
      const tScript = typeof (t as any).script === 'string'
        ? (require('js-yaml') as any).load((t as any).script)
        : (t as any).script;

      const personaText = t.personaText || '';
      const environment = ctx.environment;

      let result: any = null;
      const maxTurns = Number((t as any)?.maxTurns || 8);
      const shouldIterate = (t as any)?.iterate !== false;
      const continueAfterPass = (t as any)?.continueAfterPass === true;
      const minTurns = Math.max(1, Number((t as any)?.minTurns || 1));

      if (!wfUrl) {
        const base = environment.baseUrl;
        const chan = environment.channel || 'http_chat';
        if (chan === 'http_chat' && base) {
          // Resolve relative URLs (starting with /) to absolute using API_BASE_URL
          const resolvedBase = resolveBaseUrl(base);
          const chatUrl = `${resolvedBase.replace(/\/$/, '')}/chat`;
          const msgs = Array.isArray((tScript as any)?.messages) ? (tScript as any).messages : [];
          const stepsArr: any[] = Array.isArray((t as any)?.steps) ? (t as any).steps : [];
          const hasSteps = Array.isArray(stepsArr) && stepsArr.length > 0;
          const pending: string[] = hasSteps
            ? []
            : msgs
                .filter((m: any) => String(m?.role || '').toLowerCase() === 'user')
                .map((m: any) => String(m.content || ''));
          const objective = String((t as any)?.objective || '').trim();
          if (!hasSteps && (!pending.length || (objective && pending.length && String(pending[0]).trim() === objective))) {
            const first = await synthesizeInitialUserMessage({
              orgId: String(t.orgId),
              objective,
              personaText,
              judgeUrl,
              authHeader,
              log,
            });
            if (first && (!pending.length || String(pending[0]).trim() === objective)) {
              if (!pending.length) pending.push(first);
              else pending[0] = first;
            }
          }
          if (!hasSteps && !pending.length) throw new Error('no_user_message');
          log({ t: now(), type: 'env', env: { channel: chan, baseUrl: base } });

          const transcriptTurns: any[] = [];
          const latencies: number[] = [];
          let fallbackIdx = 0;
          const bag: any = {
            var: {},
            steps: {}, // Store outputs by step ID for $steps.step_id.output syntax
            preSteps: {}, // Store outputs from pre-steps for variable access in main steps
            last: { assistant: '', user: '', request: undefined },
            transcript: transcriptTurns,
          };
          let turns = 0;
          result = {
            status: 'running',
            transcript: transcriptTurns,
            messageCounts: { user: 0, assistant: 0, total: 0 },
            assertions: [],
            confirmations: [],
            timings: {},
          };

          // Resolve test-level variables (generators evaluated here, before pre-steps)
          const testVarDefs = Array.isArray(t.variables) ? t.variables : [];
          if (testVarDefs.length > 0) {
            const resolved = resolveTestVariables(testVarDefs);
            Object.assign(bag.var, resolved);
            log({ t: now(), type: 'test_variables_resolved', count: testVarDefs.length, keys: Object.keys(resolved), values: resolved });
          }

          // Execute pre-steps before main steps (for test data setup)
          const preStepsArr: any[] = Array.isArray((t as any)?.preSteps) ? (t as any).preSteps : [];
          if (preStepsArr.length > 0 && hooks.executeRequest) {
            log({ t: now(), type: 'pre_steps_start', count: preStepsArr.length });
            
            for (let preStepIdx = 0; preStepIdx < preStepsArr.length; preStepIdx++) {
              const preStep = preStepsArr[preStepIdx] || {};
              const preStepType = String(preStep.type || '').toLowerCase();
              const preStepName = String(preStep.name || preStep.id || `pre_step_${preStepIdx}`);
              
              if (preStepType === 'request' && preStep.requestId) {
                // Pre-step request: execute to set up test data
                const root = {
                  ...bag,
                  lastAssistant: bag?.last?.assistant,
                  lastUser: bag?.last?.user,
                };
                // Support both preStep.input (legacy) and preStep.inputMappings (UI builder)
                const inputSource = preStep.inputMappings ?? preStep.input ?? {};
                const input = interpolateDeep(inputSource, root);
                
                try {
                  const exec: any = await hooks.executeRequest(t.orgId, String(preStep.requestId), input, root);

                  // Store in bag.preSteps for access via ${preSteps.step_name.output}
                  bag.preSteps[preStepName] = { output: exec.payload, status: exec.status };
                  
                  // Also store in bag.var if saveAs is specified
                  const saveAs = String(preStep.saveAs || '').trim();
                  if (saveAs) {
                    bag.var[saveAs] = exec.payload;
                  }
                  
                  // Update last request for interpolation context
                  bag.last = { ...bag.last, request: exec.payload };
                  
                  log({
                    t: now(),
                    type: 'pre_step_request',
                    preStepIndex: preStepIdx,
                    preStepName,
                    stage: 'pre_step',
                    requestId: String(preStep.requestId),
                    status: exec.status,
                    payload: exec.payload,
                    input,
                    requestDetails: exec.requestDetails,
                    responseHeaders: exec.responseHeaders,
                    contentType: exec.contentType,
                  });
                } catch (e: any) {
                  // Log error but continue with remaining pre-steps
                  log({
                    t: now(),
                    type: 'pre_step_error',
                    preStepIndex: preStepIdx,
                    preStepName,
                    stage: 'pre_step',
                    requestId: String(preStep.requestId),
                    error: e?.message || 'exec_failed',
                    input,
                  });
                  
                  // Store error state so subsequent steps can check
                  bag.preSteps[preStepName] = { output: null, status: 'error', error: e?.message };
                }
              } else {
                log({
                  t: now(),
                  type: 'pre_step_skip',
                  preStepIndex: preStepIdx,
                  preStepName,
                  reason: preStepType !== 'request' ? 'unsupported_type' : 'missing_requestId',
                  preStep,
                });
              }
            }
            
            log({ t: now(), type: 'pre_steps_end', preStepsContext: bag.preSteps });
          }

          // Send a user message to the assistant with optional additional inputs
          // Supports HTTP, SSE, and WebSocket protocols based on environment config
          const sendUser = async (userMsg: string, assistantInputMappings?: Record<string, any>, responseFieldPath?: string) => {
            const outTranscript = [...transcriptTurns, { role: 'user', content: userMsg }];
            const payload: any = { message: String(userMsg), transcript: outTranscript };
            if (personaText) payload.persona = String(personaText).slice(0, 4000);
            
            // Merge in any additional assistant inputs (conversation ID, custom headers, etc.)
            if (assistantInputMappings && typeof assistantInputMappings === 'object') {
              // Interpolate the input mappings with current context
              const interpolatedInputs = interpolateDeep(assistantInputMappings, {
                ...bag,
                lastAssistant: bag?.last?.assistant,
                lastUser: bag?.last?.user,
              });
              Object.assign(payload, interpolatedInputs);
            }
            
            const t0 = Date.now();
            const protocol = environment.protocol || 'http_chat';
            const fieldPath = responseFieldPath || environment.responseFieldPath || 'reply';
            
            let jr: any;
            let replyTxt: string;
            let streamChunks: string[] | undefined;
            let firstTokenMs: number | undefined;
            
            // Use unified assistant client for streaming protocols
            if (protocol === 'sse' || protocol === 'websocket') {
              const connectionConfig: AssistantConnectionConfig = {
                baseUrl: resolvedBase,
                protocol,
                headers: {
                  ...(authHeader ? { Authorization: authHeader } : {}),
                  ...(environment.headers || {}),
                },
                timeoutMs: environment.timeoutMs || 60000,
                responseFieldPath: fieldPath,
                sse: environment.sse,
                websocket: environment.websocket,
              };
              
              const chunks: string[] = [];
              const result = await sendAssistantMessage(connectionConfig, payload, (chunk) => {
                chunks.push(chunk);
                // Log streaming progress for live monitoring
                log({ t: now(), type: 'stream_chunk', protocol, chunkIndex: chunks.length, chunk: chunk.slice(0, 200) });
              });
              
              if (result.error) {
                throw new Error(`${protocol}_failed: ${result.error}`);
              }
              
              replyTxt = result.reply;
              jr = result.fullResponse || { reply: replyTxt };
              streamChunks = result.chunks;
              firstTokenMs = result.firstTokenMs;
              
              if (!replyTxt || !replyTxt.trim()) {
                throw new Error(`reply_missing (${protocol} response empty)`);
              }
            } else {
              // Standard HTTP POST for http_chat protocol
              const resp = await fetch(chatUrl, {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  ...(authHeader ? { Authorization: authHeader } : {}),
                  ...(environment.headers || {}),
                },
                body: JSON.stringify(payload),
              });
              if (!resp.ok) {
                const errTxt = await resp.text().catch(() => '');
                throw new Error(`http_chat_failed ${resp.status}: ${errTxt || '(no body)'}`);
              }
              jr = await resp.json().catch(() => ({}));
              
              // Extract reply using the configured responseFieldPath (supports nested paths like "data.response")
              let rawReply: any = jr;
              for (const part of fieldPath.split('.')) {
                rawReply = rawReply?.[part];
              }
              if (typeof rawReply !== 'string' || !rawReply.trim()) throw new Error(`reply_missing (expected at ${fieldPath})`);
              replyTxt = rawReply;
            }
            
            const dt = Date.now() - t0;
            latencies.push(dt);
            transcriptTurns.push({ role: 'user', content: userMsg });
            transcriptTurns.push({ role: 'assistant', content: String(replyTxt) });
            bag.last = { assistant: String(replyTxt), user: userMsg, request: bag.last?.request, fullResponse: jr };
            
            const logEntry: any = { 
              t: now(), 
              type: 'assistant_reply', 
              content: String(replyTxt), 
              latencyMs: dt, 
              transcript: [...transcriptTurns], 
              fullResponse: jr,
              protocol,
            };
            if (streamChunks) logEntry.streamChunks = streamChunks.length;
            if (firstTokenMs !== undefined) logEntry.firstTokenMs = firstTokenMs;
            log(logEntry);
            
            return jr; // Return full response for step output storage
          };

          if (hasSteps) {
            for (let stepIdx = 0; stepIdx < stepsArr.length; stepIdx++) {
              const rawStep = stepsArr[stepIdx];
              const step = rawStep || {};
              const type = String(step.type || '').toLowerCase();
              if (type === 'message') {
                const role = String(step.role || 'user').toLowerCase();
                const contentTpl = step.content;
                const root = {
                  ...bag,
                  lastAssistant: bag?.last?.assistant,
                  lastUser: bag?.last?.user,
                };
                const content = interpolateString(String(contentTpl || ''), root);
                if (role === 'system') {
                  transcriptTurns.push({ role: 'system', content });
                  log({ t: now(), type: 'system_message', stepIndex: stepIdx, stepName: step.name, content });
                } else {
                  log({ t: now(), type: 'user_message', stepIndex: stepIdx, stepName: step.name, content });
                  // Pass assistant input mappings and responseFieldPath from step config
                  const assistantInputMappings = step.assistantInputMappings;
                  const responseFieldPath = step.responseFieldPath;
                  const fullResponse = await sendUser(content, assistantInputMappings, responseFieldPath);
                  
                  // Store step output for variable access
                  const stepKey = step.name || step.id;
                  if (stepKey) {
                    bag.steps[stepKey] = { output: fullResponse, status: 'success' };
                  }
                  
                  turns++;
                  if (turns >= maxTurns) break;
                }
              } else if (type === 'request' && step.requestId && hooks.executeRequest) {
                const root = {
                  ...bag,
                  lastAssistant: bag?.last?.assistant,
                  lastUser: bag?.last?.user,
                };
                // Support both step.input (legacy) and step.inputMappings (UI builder)
                const inputSource = step.inputMappings ?? step.input ?? {};
                const input = interpolateDeep(inputSource, root);
                try {
                  const exec: any = await hooks.executeRequest(t.orgId, String(step.requestId), input, root);
                  bag.last = { ...bag.last, request: exec.payload };
                  const key = String(step.saveAs || step.assign || step.requestId);
                  if (key) bag.var[key] = exec.payload;
                  // Store by step ID for $steps.step_id.output syntax
                  const stepId = String(step.id || '');
                  if (stepId) {
                    bag.steps[stepId] = { output: exec.payload, status: exec.status };
                  }
                  // Also store by step name if different from ID
                  const stepNameKey = String(step.name || '').trim();
                  if (stepNameKey && stepNameKey !== stepId) {
                    bag.steps[stepNameKey] = { output: exec.payload, status: exec.status };
                  }
                  log({
                    t: now(),
                    type: 'request',
                    stepIndex: stepIdx,
                    stepName: step.name,
                    stage: 'step',
                    requestId: String(step.requestId),
                    status: exec.status,
                    payload: exec.payload,
                    input,
                    // Include HTTP details for UI display
                    requestDetails: exec.requestDetails,
                    responseHeaders: exec.responseHeaders,
                    contentType: exec.contentType,
                  });
                } catch (e: any) {
                  log({
                    t: now(),
                    type: 'request_error',
                    stepIndex: stepIdx,
                    stepName: step.name,
                    stage: 'step',
                    requestId: String(step.requestId),
                    error: e?.message || 'exec_failed',
                    input,
                  });
                }
              } else if (type === 'assistant_check') {
                const mode = String((step as any).mode || 'judge');
                if (mode === 'judge') {
                  const rubric = String((step as any).rubric || '').trim();
                  if (!rubric) {
                    log({
                      t: now(),
                      type: 'step_skip',
                      subtype: 'assistant_check_judge',
                      reason: 'missing_rubric',
                      step,
                    });
                  } else {
                    try {
                      const scope = (step as any).scope || 'last';
                      const stepName = (step as any).name || '';
                      const lastAssistant = String(
                        transcriptTurns
                          .slice()
                          .reverse()
                          .find((m: any) => m.role === 'assistant')?.content || '',
                      );
                      const judgeBody = {
                        rubric,
                        threshold: (step as any).threshold,
                        transcript: transcriptTurns,
                        lastAssistant,
                        scope,
                      };
                      const judgeResp = await fetch(judgeUrl, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(judgeBody),
                      });
                      const j = await judgeResp.json().catch(() => ({}));
                      const pass = !!j?.pass;
                      const details = {
                        score: j?.score,
                        threshold: j?.threshold,
                        reasoning: j?.reasoning,
                        rubric,
                        stepName,
                        error: j?.error,
                      };
                      log({
                        t: now(),
                        type: 'judge_check',
                        subtype: 'assistant_check_judge',
                        stepIndex: stepIdx,
                        stepName,
                        pass,
                        details,
                      });
                      const stepAssertion = {
                        type: 'assistant_check',
                        subtype: 'judge',
                        pass,
                        details,
                        config: { rubric, scope, threshold: (step as any).threshold },
                        stepId: (step as any).id,
                        name: stepName,
                        severity: (step as any).severity || 'error',
                      };
                      result.assertions = Array.isArray(result.assertions)
                        ? [...result.assertions, stepAssertion]
                        : [stepAssertion];
                    } catch (e: any) {
                      const stepName = (step as any).name || '';
                      const details = { error: e?.message || 'judge_failed', rubric, stepName };
                      log({
                        t: now(),
                        type: 'step_error',
                        subtype: 'assistant_check_judge',
                        message: details.error,
                        step,
                      });
                      const stepAssertion = {
                        type: 'assistant_check',
                        subtype: 'judge',
                        pass: false,
                        details,
                        config: { rubric, scope: (step as any).scope || 'last', threshold: (step as any).threshold },
                        stepId: (step as any).id,
                        name: stepName,
                        severity: (step as any).severity || 'error',
                      };
                      result.assertions = Array.isArray(result.assertions)
                        ? [...result.assertions, stepAssertion]
                        : [stepAssertion];
                    }
                  }
                } else if (mode === 'variable_check') {
                  // Variable check mode: compare variable value using operator
                  const variablePath = String((step as any).variablePath || '').trim();
                  const operator = String((step as any).operator || 'eq');
                  const rightValue = (step as any).rightValue ?? (step as any).expectEquals ?? '';
                  const stepName = (step as any).name || variablePath || 'variable_check';
                  
                  if (!variablePath) {
                    log({
                      t: now(),
                      type: 'step_skip',
                      subtype: 'assistant_check_variable',
                      reason: 'missing_variable_path',
                      step,
                    });
                  } else {
                    try {
                      // Resolve the variable path from the bag
                      // Supports: steps.stepName.output.field, var.varName, etc.
                      const root = {
                        ...bag,
                        lastAssistant: bag?.last?.assistant,
                        lastUser: bag?.last?.user,
                      };
                      
                      // Get the left value by traversing the path
                      const getByPath = (obj: any, path: string): any => {
                        const parts = path.split('.');
                        let val = obj;
                        for (const part of parts) {
                          if (val == null) return undefined;
                          // Handle array index notation like items[0]
                          const match = part.match(/^([^\[]+)\[(\d+)\]$/);
                          if (match) {
                            val = val[match[1]];
                            if (Array.isArray(val)) {
                              val = val[parseInt(match[2], 10)];
                            } else {
                              return undefined;
                            }
                          } else {
                            val = val[part];
                          }
                        }
                        return val;
                      };
                      
                      const leftValue = getByPath(root, variablePath);
                      
                      // Interpolate the right value in case it references variables
                      const interpolatedRight = interpolateString(String(rightValue), root);
                      
                      // Perform the comparison based on operator
                      let pass = false;
                      let reasoning = '';
                      
                      const leftStr = String(leftValue ?? '');
                      const rightStr = interpolatedRight;
                      const leftNum = parseFloat(leftStr);
                      const rightNum = parseFloat(rightStr);
                      
                      switch (operator) {
                        case 'eq':
                          // Handle both string and numeric equality
                          if (typeof leftValue === 'object' && leftValue !== null) {
                            pass = JSON.stringify(leftValue) === rightStr;
                            reasoning = `${JSON.stringify(leftValue)} === ${rightStr}`;
                          } else {
                            pass = leftStr === rightStr || (leftValue === rightValue);
                            reasoning = `${leftStr} === ${rightStr}`;
                          }
                          break;
                        case 'neq':
                          if (typeof leftValue === 'object' && leftValue !== null) {
                            pass = JSON.stringify(leftValue) !== rightStr;
                            reasoning = `${JSON.stringify(leftValue)} !== ${rightStr}`;
                          } else {
                            pass = leftStr !== rightStr;
                            reasoning = `${leftStr} !== ${rightStr}`;
                          }
                          break;
                        case 'gt':
                          pass = !isNaN(leftNum) && !isNaN(rightNum) && leftNum > rightNum;
                          reasoning = `${leftNum} > ${rightNum}`;
                          break;
                        case 'gte':
                          pass = !isNaN(leftNum) && !isNaN(rightNum) && leftNum >= rightNum;
                          reasoning = `${leftNum} >= ${rightNum}`;
                          break;
                        case 'lt':
                          pass = !isNaN(leftNum) && !isNaN(rightNum) && leftNum < rightNum;
                          reasoning = `${leftNum} < ${rightNum}`;
                          break;
                        case 'lte':
                          pass = !isNaN(leftNum) && !isNaN(rightNum) && leftNum <= rightNum;
                          reasoning = `${leftNum} <= ${rightNum}`;
                          break;
                        case 'contains':
                          if (typeof leftValue === 'string') {
                            pass = leftValue.includes(rightStr);
                            reasoning = `"${leftStr}" contains "${rightStr}"`;
                          } else if (typeof leftValue === 'object' && leftValue !== null) {
                            pass = JSON.stringify(leftValue).includes(rightStr);
                            reasoning = `${JSON.stringify(leftValue)} contains "${rightStr}"`;
                          } else {
                            pass = leftStr.includes(rightStr);
                            reasoning = `"${leftStr}" contains "${rightStr}"`;
                          }
                          break;
                        case 'not_contains':
                          if (typeof leftValue === 'string') {
                            pass = !leftValue.includes(rightStr);
                            reasoning = `"${leftStr}" does not contain "${rightStr}"`;
                          } else if (typeof leftValue === 'object' && leftValue !== null) {
                            pass = !JSON.stringify(leftValue).includes(rightStr);
                            reasoning = `${JSON.stringify(leftValue)} does not contain "${rightStr}"`;
                          } else {
                            pass = !leftStr.includes(rightStr);
                            reasoning = `"${leftStr}" does not contain "${rightStr}"`;
                          }
                          break;
                        case 'regex':
                          try {
                            const re = new RegExp(rightStr);
                            pass = re.test(leftStr);
                            reasoning = `"${leftStr}" matches /${rightStr}/`;
                          } catch (regexErr: any) {
                            pass = false;
                            reasoning = `Invalid regex: ${regexErr?.message}`;
                          }
                          break;
                        case 'exists':
                          pass = leftValue !== undefined && leftValue !== null;
                          reasoning = `${variablePath} exists (value: ${JSON.stringify(leftValue)})`;
                          break;
                        case 'not_exists':
                          pass = leftValue === undefined || leftValue === null;
                          reasoning = `${variablePath} does not exist (value: ${JSON.stringify(leftValue)})`;
                          break;
                        default:
                          pass = leftStr === rightStr;
                          reasoning = `${leftStr} === ${rightStr} (default eq)`;
                      }
                      
                      const details = {
                        variablePath,
                        operator,
                        leftValue: typeof leftValue === 'object' ? JSON.stringify(leftValue) : leftValue,
                        rightValue: interpolatedRight,
                        reasoning,
                        stepName,
                      };
                      
                      log({
                        t: now(),
                        type: 'variable_check',
                        subtype: 'assistant_check_variable',
                        stepIndex: stepIdx,
                        stepName,
                        pass,
                        details,
                      });
                      
                      const stepAssertion = {
                        type: 'assistant_check',
                        subtype: 'variable_check',
                        pass,
                        details,
                        config: { variablePath, operator, rightValue: String(rightValue) },
                        stepId: (step as any).id,
                        name: stepName,
                        severity: (step as any).severity || 'error',
                      };
                      result.assertions = Array.isArray(result.assertions)
                        ? [...result.assertions, stepAssertion]
                        : [stepAssertion];
                    } catch (e: any) {
                      const details = { 
                        error: e?.message || 'variable_check_failed', 
                        variablePath, 
                        operator,
                        stepName 
                      };
                      log({
                        t: now(),
                        type: 'step_error',
                        subtype: 'assistant_check_variable',
                        message: details.error,
                        step,
                      });
                      const stepAssertion = {
                        type: 'assistant_check',
                        subtype: 'variable_check',
                        pass: false,
                        details,
                        config: { variablePath, operator, rightValue: String(rightValue) },
                        stepId: (step as any).id,
                        name: stepName,
                        severity: (step as any).severity || 'error',
                      };
                      result.assertions = Array.isArray(result.assertions)
                        ? [...result.assertions, stepAssertion]
                        : [stepAssertion];
                    }
                  }
                } else if (mode === 'includes') {
                  // Includes mode: check if transcript/last message contains keywords
                  const includes = String((step as any).includes || '').trim();
                  const scope = (step as any).scope || 'transcript';
                  const stepName = (step as any).name || '';
                  
                  if (!includes) {
                    log({
                      t: now(),
                      type: 'step_skip',
                      subtype: 'assistant_check_includes',
                      reason: 'missing_includes',
                      step,
                    });
                  } else {
                    const keywords = includes.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
                    let textToSearch = '';
                    
                    if (scope === 'last') {
                      textToSearch = String(
                        transcriptTurns
                          .slice()
                          .reverse()
                          .find((m: any) => m.role === 'assistant')?.content || '',
                      ).toLowerCase();
                    } else {
                      textToSearch = transcriptTurns
                        .map((m: any) => String(m.content || ''))
                        .join(' ')
                        .toLowerCase();
                    }
                    
                    const foundKeywords = keywords.filter((kw: string) => textToSearch.includes(kw));
                    const missingKeywords = keywords.filter((kw: string) => !textToSearch.includes(kw));
                    const pass = missingKeywords.length === 0;
                    
                    const details = {
                      keywords,
                      foundKeywords,
                      missingKeywords,
                      scope,
                      stepName,
                    };
                    
                    log({
                      t: now(),
                      type: 'includes_check',
                      subtype: 'assistant_check_includes',
                      stepIndex: stepIdx,
                      stepName,
                      pass,
                      details,
                    });
                    
                    const stepAssertion = {
                      type: 'assistant_check',
                      subtype: 'includes',
                      pass,
                      details,
                      config: { includes, scope },
                      stepId: (step as any).id,
                      name: stepName,
                      severity: (step as any).severity || 'error',
                    };
                    result.assertions = Array.isArray(result.assertions)
                      ? [...result.assertions, stepAssertion]
                      : [stepAssertion];
                  }
                } else {
                  log({
                    t: now(),
                    type: 'step_skip',
                    subtype: 'assistant_check',
                    reason: 'unknown_mode',
                    step,
                  });
                }
              } else if (type === 'extract') {
                // Extract step: uses LLM to extract structured data from the conversation
                const variableName = String((step as any).variableName || '').trim();
                const description = String((step as any).description || '').trim();
                const scope = String((step as any).scope || 'last') as 'last' | 'transcript';
                
                if (!variableName) {
                  log({
                    t: now(),
                    type: 'step_skip',
                    subtype: 'extract',
                    reason: 'missing_variable_name',
                    step,
                  });
                } else if (!description) {
                  log({
                    t: now(),
                    type: 'step_skip',
                    subtype: 'extract',
                    reason: 'missing_description',
                    step,
                  });
                } else {
                  try {
                    const lastAssistant = String(
                      transcriptTurns
                        .slice()
                        .reverse()
                        .find((m: any) => m.role === 'assistant')?.content || '',
                    );
                    
                    const extractResult = await extractFromConversation({
                      variableName,
                      description,
                      scope,
                      lastAssistant,
                      transcript: transcriptTurns,
                    }, { orgId: String(t.orgId), serviceKey: 'engine.extract' });
                    
                    // Store extracted value in the bag
                    if (extractResult.success && extractResult.value !== null && extractResult.value !== undefined) {
                      bag.var[variableName] = extractResult.value;
                      // Also store by step ID if provided
                      const stepId = String(step.id || '');
                      if (stepId) {
                        bag.steps[stepId] = { output: extractResult.value, success: true };
                      }
                    }
                    
                    log({
                      t: now(),
                      type: 'extract',
                      variableName,
                      description,
                      scope,
                      success: extractResult.success,
                      value: extractResult.value,
                      reasoning: extractResult.reasoning,
                      error: extractResult.error,
                    });
                  } catch (e: any) {
                    log({
                      t: now(),
                      type: 'step_error',
                      subtype: 'extract',
                      variableName,
                      message: e?.message || 'extract_failed',
                      step,
                    });
                  }
                }
              } else if (type === 'user_objective') {
                // User objective step: multi-turn conversation with a goal
                const stepObjective = String((step as any).description || '').trim();
                const stepMaxTurns = Math.min(Number((step as any).maxTurns) || maxTurns, maxTurns);
                const stepMinTurns = Math.max(1, Number((step as any).minTurns) || 1);
                const stepIterate = (step as any).iterativeConversation !== false;
                const attachedChecks = Array.isArray((step as any).attachedChecks) ? (step as any).attachedChecks : [];
                const stepName = (step as any).name || stepObjective || '(user_objective)';
                
                // Get assistant input mappings for this step
                const objAssistantInputMappings = step.assistantInputMappings;
                const objResponseFieldPath = step.responseFieldPath;
                
                // Exit/entry conditions for assertions
                // exitOnPass: stop conversation when assertion passes (default: true)
                // exitOnFail: stop conversation when assertion fails (default: false)  
                // continueAfterPass: deprecated alias for exitOnPass=false
                const exitOnPass = (step as any).exitOnPass !== false && (step as any).continueAfterPass !== true;
                const exitOnFail = (step as any).exitOnFail === true;
                
                log({
                  t: now(),
                  type: 'user_objective_start',
                  stepIndex: stepIdx,
                  stepName,
                  objective: stepObjective,
                  maxTurns: stepMaxTurns,
                  minTurns: stepMinTurns,
                  exitOnPass,
                  exitOnFail,
                });

                // Synthesize initial user message from objective
                let firstMsg = stepObjective;
                if (stepObjective) {
                  try {
                    const synth = await synthesizeInitialUserMessage({
                      orgId: String(t.orgId),
                      objective: stepObjective,
                      personaText,
                      judgeUrl,
                      authHeader,
                      log,
                    });
                    if (synth) firstMsg = synth;
                  } catch (e: any) {
                    log({ t: now(), type: 'synth_error', error: e?.message });
                  }
                }

                // Run the conversation loop for this objective
                const objPending: string[] = [firstMsg];
                let objTurns = 0;
                let objFallbackIdx = 0;
                // objPassed starts as true if no checks, or will be determined by check results
                let objPassed = attachedChecks.length === 0;
                const objCheckResults: { checkId: string; pass: boolean; score?: number; threshold?: number; reasoning?: string; rubric?: string; name?: string }[] = [];
                let lastFullResponse: any = null;

                while (objPending.length && objTurns < stepMaxTurns && turns < maxTurns) {
                  const userMsg = String(objPending.shift() || '');
                  log({ t: now(), type: 'user_message', stepIndex: stepIdx, stepName, content: userMsg });
                  lastFullResponse = await sendUser(userMsg, objAssistantInputMappings, objResponseFieldPath);
                  objTurns++;
                  turns++;

                  // Run attached checks after each turn (or after conversation ends)
                  for (const check of attachedChecks) {
                    const checkType = String(check.type || '').toLowerCase();
                    if (checkType === 'assistant_check') {
                      const mode = String(check.mode || 'judge');
                      if (mode === 'judge') {
                        const rubric = String(check.rubric || '').trim();
                        if (rubric) {
                          try {
                            const scope = check.scope || 'last';
                            const lastAssistant = String(
                              transcriptTurns
                                .slice()
                                .reverse()
                                .find((m: any) => m.role === 'assistant')?.content || '',
                            );
                            const judgeBody = {
                              rubric,
                              threshold: check.threshold,
                              transcript: transcriptTurns,
                              lastAssistant,
                              scope,
                              requestNext: stepIterate && objTurns < stepMaxTurns,
                              persona: personaText,
                            };
                            const judgeResp = await fetch(judgeUrl, {
                              method: 'POST',
                              headers: {
                                'content-type': 'application/json',
                                ...(authHeader ? { Authorization: authHeader } : {}),
                              },
                              body: JSON.stringify(judgeBody),
                            });
                            const j = await judgeResp.json().catch(() => ({}));
                            const pass = !!j?.pass;
                            const details = {
                              score: j?.score,
                              threshold: j?.threshold,
                              reasoning: j?.reasoning,
                              rubric,
                              stepName,
                              checkId: check.id,
                              error: j?.error,
                            };
                            log({
                              t: now(),
                              type: 'judge_check',
                              subtype: 'user_objective_check',
                              stepIndex: stepIdx,
                              stepName,
                              checkId: check.id,
                              pass,
                              details,
                            });
                            
                            // Track check result for summary
                            objCheckResults.push({
                              checkId: check.id,
                              name: check.name || stepName,
                              pass,
                              score: j?.score,
                              threshold: j?.threshold ?? check.threshold,
                              reasoning: j?.reasoning,
                              rubric,
                            });
                            
                            const checkAssertion = {
                              type: 'assistant_check',
                              subtype: 'judge',
                              pass,
                              details,
                              config: { rubric, scope, threshold: check.threshold },
                              stepId: (step as any).id,
                              checkId: check.id,
                              name: stepName,
                              severity: check.severity || 'error',
                            };
                            result.assertions = Array.isArray(result.assertions)
                              ? [...result.assertions, checkAssertion]
                              : [checkAssertion];
                            
                            // Update step pass status - step passes if all error-severity checks pass
                            // Note: warning-severity checks don't affect pass/fail
                            const isErrorSeverity = check.severity === 'error' || !check.severity;
                            if (!pass && isErrorSeverity) {
                              objPassed = false;
                            } else if (pass && isErrorSeverity) {
                              // Check passed - only set objPassed to true if no error-severity checks have failed yet
                              // This ensures objPassed reflects "all error-severity checks passed so far"
                              const anyErrorSeverityFailed = objCheckResults.some(
                                (r) => r.pass === false && ((attachedChecks.find((c: any) => c.id === r.checkId) as any)?.severity === 'error' || !(attachedChecks.find((c: any) => c.id === r.checkId) as any)?.severity)
                              );
                              if (!anyErrorSeverityFailed) {
                                objPassed = true;
                              }
                            }

                            // Handle exit conditions based on assertion result
                            const haveMinTurns = objTurns >= stepMinTurns;
                            if (pass && exitOnPass && haveMinTurns) {
                              objPending.length = 0; // Stop iteration on pass
                              break;
                            }
                            if (!pass && exitOnFail) {
                              objPending.length = 0; // Stop iteration on fail
                              break;
                            }

                            // Get next user message if iterating
                            if (stepIterate && objTurns < stepMaxTurns) {
                              const nextUserRaw = typeof j?.nextUser === 'string' ? j.nextUser : '';
                              let nextUser = nextUserRaw;
                              if (!nextUser) {
                                const lastUserPrev = transcriptTurns
                                  .slice()
                                  .reverse()
                                  .find((m: any) => m.role === 'user')?.content || '';
                                for (let k = 0; k < defaultFallbackPrompts.length; k++) {
                                  const idx = (objFallbackIdx + k) % defaultFallbackPrompts.length;
                                  const cand = defaultFallbackPrompts[idx];
                                  if (String(cand).trim().toLowerCase() !== String(lastUserPrev).trim().toLowerCase()) {
                                    nextUser = cand;
                                    objFallbackIdx = (idx + 1) % defaultFallbackPrompts.length;
                                    break;
                                  }
                                }
                                nextUser = nextUser || defaultFallbackPrompts[0];
                              }
                              if (nextUser && j?.shouldContinue !== false) {
                                const lastUserPrev = transcriptTurns
                                  .slice()
                                  .reverse()
                                  .find((m: any) => m.role === 'user')?.content || '';
                                if (String(nextUser).trim().toLowerCase() !== String(lastUserPrev).trim().toLowerCase()) {
                                  objPending.push(String(nextUser));
                                  log({ t: now(), type: 'plan', content: `next_user: ${String(nextUser).slice(0, 200)}` });
                                }
                              }
                            }
                          } catch (e: any) {
                            log({
                              t: now(),
                              type: 'step_error',
                              subtype: 'user_objective_check',
                              stepIndex: stepIdx,
                              checkId: check.id,
                              message: e?.message || 'judge_failed',
                            });
                          }
                        }
                      }
                    }
                  }
                }

                // Store step result
                const stepId = String((step as any).id || '');
                if (stepId) {
                  bag.steps[stepId] = { 
                    passed: objPassed, 
                    turns: objTurns,
                    objective: stepObjective,
                  };
                }

                // Gather attached check summaries for display
                const attachedCheckSummaries = attachedChecks.map((check: any) => {
                  const checkResult = objCheckResults.find((r) => r.checkId === check.id);
                  return {
                    id: check.id,
                    name: check.name || checkResult?.name,
                    rubric: check.rubric,
                    pass: checkResult?.pass,
                    score: checkResult?.score,
                    threshold: checkResult?.threshold ?? check.threshold,
                    reasoning: checkResult?.reasoning,
                  };
                });

                // Store step output for variable access
                const stepKey = stepName || step.id;
                if (stepKey && lastFullResponse) {
                  bag.steps[stepKey] = { output: lastFullResponse, status: objPassed ? 'passed' : 'failed' };
                }

                log({
                  t: now(),
                  type: 'user_objective_end',
                  stepIndex: stepIdx,
                  stepName,
                  objective: stepObjective,
                  turns: objTurns,
                  passed: objPassed,
                  attachedChecks: attachedCheckSummaries,
                });
              } else {
                log({ t: now(), type: 'step_skip', reason: 'unknown_type', raw: step });
              }
            }
          } else {
            while (pending.length && turns < maxTurns) {
              const userMsg = String(pending.shift() || '');
              log({ t: now(), type: 'user_message', content: userMsg });
              await sendUser(userMsg);
              turns++;

              if (shouldIterate && t.judgeConfig?.rubric) {
                try {
                  const rubric = t.judgeConfig?.rubric;
                  const threshold = t.judgeConfig?.threshold;
                  const lastA = String(
                    transcriptTurns
                      .slice()
                      .reverse()
                      .find((m: any) => m.role === 'assistant')?.content || '',
                  );
                  const judgeBody = {
                    rubric,
                    threshold,
                    transcript: transcriptTurns,
                    lastAssistant: lastA,
                    requestNext: true,
                    persona: personaText,
                  };
                  const judgeResp = await fetch(judgeUrl, {
                    method: 'POST',
                    headers: {
                      'content-type': 'application/json',
                      ...(authHeader ? { Authorization: authHeader } : {}),
                    },
                    body: JSON.stringify(judgeBody),
                  });
                  const j = await judgeResp.json();
                  const pass = !!j?.pass;
                  const details = {
                    score: j?.score,
                    threshold: j?.threshold,
                    reasoning: j?.reasoning,
                    rubric,
                    error: j?.error,
                  };
                  log({ t: now(), type: 'judge_check', subtype: 'semantic', pass, details });
                  const haveMinTurns = turns >= minTurns;
                  const nextUserRaw = typeof j?.nextUser === 'string' ? j.nextUser : '';
                  const shouldContinue = j?.shouldContinue !== false;
                  let willBreak = false;
                  if (pass) {
                    if (!continueAfterPass && haveMinTurns) {
                      willBreak = true;
                    } else {
                      log({
                        t: now(),
                        type: 'judge_decision',
                        content: `pass but continuing (minTurns=${minTurns}, continueAfterPass=${continueAfterPass})`,
                      });
                    }
                  }
                  if (willBreak) break;
                  if (shouldContinue && turns < maxTurns) {
                    let nextUser = nextUserRaw;
                    if (!nextUser) {
                      const lastUserPrev =
                        transcriptTurns
                          .slice()
                          .reverse()
                          .find((m: any) => m.role === 'user')?.content || '';
                      for (let k = 0; k < defaultFallbackPrompts.length; k++) {
                        const idx = (fallbackIdx + k) % defaultFallbackPrompts.length;
                        const cand = defaultFallbackPrompts[idx];
                        if (
                          String(cand).trim().toLowerCase() !==
                          String(lastUserPrev).trim().toLowerCase()
                        ) {
                          nextUser = cand;
                          fallbackIdx = (idx + 1) % defaultFallbackPrompts.length;
                          break;
                        }
                      }
                      nextUser = nextUser || defaultFallbackPrompts[0];
                    }
                    if (nextUser) {
                      const lastUserPrev =
                        transcriptTurns
                          .slice()
                          .reverse()
                          .find((m: any) => m.role === 'user')?.content || '';
                      if (
                        String(nextUser).trim().toLowerCase() !==
                        String(lastUserPrev).trim().toLowerCase()
                      ) {
                        pending.push(String(nextUser));
                        log({
                          t: now(),
                          type: 'plan',
                          content: `next_user: ${String(nextUser).slice(0, 200)}`,
                        });
                      } else {
                        log({
                          t: now(),
                          type: 'plan_skip',
                          content: 'skipped duplicate follow-up',
                        });
                        break;
                      }
                    } else {
                      break;
                    }
                  }
                } catch (e: any) {
                  log({
                    t: now(),
                    type: 'judge_check',
                    subtype: 'semantic',
                    pass: false,
                    details: { error: e?.message || 'judge_failed' },
                  });
                }
              }
            }
          }

          const stats = (() => {
            const arr = latencies.slice().sort((a, b) => a - b);
            const pick = (p: number) =>
              arr.length
                ? arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))]
                : undefined;
            const avg = arr.length
              ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
              : undefined;
            return {
              // These are assistant endpoint latencies (time to get response from the target being tested)
              source: 'assistant' as const,
              label: 'Assistant Response Time',
              perTurnMs: latencies,
              avgMs: avg,
              p50Ms: pick(0.5),
              p95Ms: pick(0.95),
              maxMs: arr.length ? arr[arr.length - 1] : undefined,
            };
          })();
          const msgCounts = {
            user: transcriptTurns.filter((m) => m.role === 'user').length,
            assistant: transcriptTurns.filter((m) => m.role === 'assistant').length,
            total: transcriptTurns.length,
          };
          if (!result || typeof result !== 'object') result = {};
          // Determine status based on assertions - fail if any error-severity assertion failed
          const assertionsFailed = Array.isArray(result.assertions) && result.assertions.some(
            (a: any) => a.pass === false && (a.severity === 'error' || !a.severity)
          );
          result.status = assertionsFailed ? 'failed' : 'passed';
          result.transcript = transcriptTurns;
          result.messageCounts = msgCounts;
          result.assertions = Array.isArray(result.assertions) ? result.assertions : [];
          result.confirmations = Array.isArray(result.confirmations) ? result.confirmations : [];
          result.timings = stats;
        } else {
          throw new Error('workflow_unconfigured');
        }
      } else {
        const r = await fetch(`${wfUrl}/testing/run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            script: tScript,
            environment,
            variables: {},
            judge: { url: judgeUrl, orgId: String(t.orgId) },
          }),
        });
        result = await r.json();
      }

      const item: EngineItemResult = {
        testId: String(t._id),
        testName: t.name || undefined,
        status: result?.status || 'failed',
        transcript: result.transcript || [],
        messageCounts: result.messageCounts || { user: 0, assistant: 0, total: 0 },
        assertions: Array.isArray(result.assertions) ? result.assertions : [],
        confirmations: Array.isArray(result.confirmations) ? result.confirmations : [],
        timings: result.timings || {},
        error: result.error,
        artifacts: { log: logs },
      };

      items.push(item);
      if (item.status === 'passed') passed++;
      else failed++;
    } catch (e: any) {
      const cleanMsg = e?.message || 'exec_failed';
      items.push({
        testId: String(t._id),
        testName: t.name || undefined,
        status: 'failed',
        transcript: [],
        messageCounts: { user: 0, assistant: 0, total: 0 },
        assertions: [],
        confirmations: [],
        timings: {},
        error: { message: cleanMsg },
      });
      failed++;
    }
  }

  return { items, passed, failed, skipped, judgeScores };
}
