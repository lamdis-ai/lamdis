import { z } from 'zod';
import { bedrockChatOnce } from '../lib/bedrockRuntime.js';
import type { MeterContext } from '../lib/llmCostControl.js';

export const judgeBodySchema = z.object({
  rubric: z.string().min(1),
  threshold: z.number().optional(),
  transcript: z.array(z.any()).default([]),
  lastAssistant: z.string().optional(),
  requestNext: z.boolean().optional(),
  persona: z.string().optional(),
  scope: z.enum(['last', 'transcript']).optional().default('last'),
});

export type JudgeBody = z.infer<typeof judgeBodySchema>;
export type JudgeBodyInput = z.input<typeof judgeBodySchema>;

export interface JudgeResult {
  pass: boolean;
  score: number;
  threshold: number;
  reasoning: string;
  nextUser?: string;
  shouldContinue?: boolean;
  [key: string]: any;
}

export async function judgeConversation(body: JudgeBodyInput, meterContext: MeterContext): Promise<JudgeResult> {
  const parsed = judgeBodySchema.parse(body);
  const threshold = typeof parsed.threshold === 'number' ? parsed.threshold : 0.75;
  const scope = parsed.scope || 'last';

  const scopeInstruction = scope === 'transcript'
    ? 'Evaluate the ENTIRE conversation transcript holistically.'
    : 'Evaluate only the LAST assistant message.';

  const sys = [
    'You are a strict evaluator for assistant conversations.',
    scopeInstruction,
    'Return ONLY valid JSON matching this TypeScript type:',
    '{ pass: boolean, score: number, threshold: number, reasoning: string, nextUser?: string, shouldContinue?: boolean }',
    'Score should be in [0,1]. Keep reasoning concise (<= 60 words).',
    'If requestNext is true, propose a single short, natural next user message to move closer to the goal.',
    'The "persona" field describes the tone and style the simulated user should adopt (e.g. frustrated, polite). Apply this tone to the nextUser message naturally — do NOT quote or repeat the persona instructions literally. The nextUser must read like a real customer message, not like an instruction.',
    'Do not include any extra text outside JSON.'
  ].join('\n');
  const user = JSON.stringify({
    rubric: parsed.rubric,
    threshold,
    persona: parsed.persona,
    scope,
    lastAssistant: scope === 'last' ? parsed.lastAssistant : undefined,
    transcript: parsed.transcript,
    requestNext: !!parsed.requestNext,
  });

  let out: any = undefined;

  try {
    const bedrockModelId = process.env.BEDROCK_JUDGE_MODEL_ID || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
    const bedrockTemp = process.env.BEDROCK_JUDGE_TEMPERATURE
      ? Number(process.env.BEDROCK_JUDGE_TEMPERATURE)
      : (process.env.BEDROCK_TEMPERATURE ? Number(process.env.BEDROCK_TEMPERATURE) : 0.3);
    const reply = await bedrockChatOnce({
      modelId: bedrockModelId,
      temperature: bedrockTemp,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'judgeService' },
    });
    const jsonStr = String(reply || '').replace(/^```json\n?|```$/g, '').trim();
    out = JSON.parse(jsonStr);
  } catch (e: any) {
    return { pass: false, score: 0, threshold, reasoning: `judge_error: ${e?.message || 'bedrock_failed'}` } as any;
  }

  if (!out || typeof out.pass !== 'boolean') {
    return { pass: false, score: 0, threshold, reasoning: 'judge_parse_failed' } as any;
  }
  if (typeof out.threshold !== 'number') out.threshold = threshold;
  if (typeof out.score !== 'number') out.score = out.pass ? out.threshold : 0;
  return out as any;
}
