import { bedrockChatOnce } from '../lib/bedrockRuntime.js';
import type { MeterContext } from '../lib/llmCostControl.js';

export interface ExtractRequest {
  variableName: string;
  description: string;
  scope: 'last' | 'transcript';
  lastAssistant?: string;
  transcript?: any[];
}

export interface ExtractResult {
  success: boolean;
  value: any;
  reasoning?: string;
  error?: string;
}

/**
 * Uses AWS Bedrock (Claude) to extract structured data from the conversation.
 * The LLM analyzes the conversation (or last message) and extracts
 * the requested information based on the description provided.
 */
export async function extractFromConversation(req: ExtractRequest, meterContext: MeterContext): Promise<ExtractResult> {
  // Determine what text to analyze based on scope
  const contextText = req.scope === 'transcript'
    ? JSON.stringify(req.transcript || [], null, 2)
    : String(req.lastAssistant || '');

  if (!contextText.trim()) {
    return {
      success: false,
      value: null,
      error: 'no_content_to_extract_from',
    };
  }

  const sys = [
    'You are a data extraction assistant.',
    'Your task is to extract a specific piece of information from the conversation.',
    'Return ONLY valid JSON matching this structure:',
    '{ "success": boolean, "value": any, "reasoning": string }',
    '',
    'Guidelines:',
    '- If you can find the requested information, set success=true and value to the extracted data',
    '- The value can be a string, number, boolean, object, or array depending on what was requested',
    '- If extracting a number, return it as a number type, not a string',
    '- If the information is not found, set success=false and value=null',
    '- Keep reasoning brief (<30 words)',
    'Do not include any text outside the JSON.',
  ].join('\n');

  const user = JSON.stringify({
    variableName: req.variableName,
    extractionDescription: req.description,
    scope: req.scope,
    content: contextText,
  });

  try {
    const bedrockModelId = process.env.BEDROCK_JUDGE_MODEL_ID || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
    const bedrockTemp = process.env.BEDROCK_JUDGE_TEMPERATURE
      ? Number(process.env.BEDROCK_JUDGE_TEMPERATURE)
      : (process.env.BEDROCK_TEMPERATURE ? Number(process.env.BEDROCK_TEMPERATURE) : 0.1);
    
    const reply = await bedrockChatOnce({
      modelId: bedrockModelId,
      temperature: bedrockTemp,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'extractionService' },
    });
    
    const jsonStr = String(reply || '').replace(/^```json\n?|```$/g, '').trim();
    const out = JSON.parse(jsonStr);

    if (!out || typeof out.success !== 'boolean') {
      return {
        success: false,
        value: null,
        error: 'extraction_parse_failed',
      };
    }

    return {
      success: out.success,
      value: out.value,
      reasoning: out.reasoning,
      error: out.success ? undefined : 'value_not_found',
    };
  } catch (e: any) {
    return {
      success: false,
      value: null,
      error: `extraction_error: ${e?.message || 'bedrock_failed'}`,
    };
  }
}
