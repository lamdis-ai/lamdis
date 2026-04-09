/**
 * Media Review Service
 *
 * LLM-powered review of evidence media (images, screenshots, documents, audio transcripts).
 * Uses Bedrock Claude multimodal to verify that submitted evidence matches
 * what a task claims it should be.
 */

import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import type { MeterContext } from '../llmCostControl/index.js';

const MODEL_ID = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaReviewResult {
  verified: boolean;
  reasoning: string;
  confidence: number;    // 0-1
  extractedFacts?: Record<string, unknown>;  // structured data pulled from the media
}

// ---------------------------------------------------------------------------
// Image evidence review (multimodal)
// ---------------------------------------------------------------------------

export async function reviewImageEvidence(
  imageBase64: string,
  mimeType: string,
  taskDescription: string,
  expectedOutcome: string,
  meterContext: MeterContext,
): Promise<MediaReviewResult> {
  const prompt = `You are reviewing evidence for a task. Analyze the image and determine if it satisfies the task requirements.

## Task
${taskDescription}

## Expected Outcome
${expectedOutcome}

## Instructions
1. Describe what you see in the image
2. Determine if the image provides evidence that the task was completed
3. Extract any relevant structured data (dates, amounts, names, locations, etc.)

Respond with JSON:
{
  "verified": true/false,
  "reasoning": "Explanation of your assessment",
  "confidence": 0.0-1.0,
  "extracted_facts": { "key": "value" }
}`;

  const raw = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages: [{
      role: 'user',
      content: prompt,
      attachments: [{ data: imageBase64, mimeType }],
    }],
    system: 'You are an evidence verification assistant. Respond only with valid JSON.',
    maxTokens: 2048,
    temperature: 0.1,
    meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'mediaReview.image' },
  });

  return parseReviewResult(raw);
}

// ---------------------------------------------------------------------------
// Screenshot verification
// ---------------------------------------------------------------------------

export async function reviewScreenshotEvidence(
  screenshotBase64: string,
  mimeType: string,
  expectedState: string,
  meterContext: MeterContext,
): Promise<MediaReviewResult> {
  const prompt = `You are verifying a screenshot. Determine if it shows the expected state.

## Expected State
${expectedState}

## Instructions
1. Describe what the screenshot shows (app, page, content, status indicators)
2. Determine if it matches the expected state
3. Extract any visible text, numbers, or status indicators

Respond with JSON:
{
  "verified": true/false,
  "reasoning": "What you see vs what was expected",
  "confidence": 0.0-1.0,
  "extracted_facts": { "visible_text": "...", "status": "..." }
}`;

  const raw = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages: [{
      role: 'user',
      content: prompt,
      attachments: [{ data: screenshotBase64, mimeType }],
    }],
    system: 'You are an evidence verification assistant. Respond only with valid JSON.',
    maxTokens: 2048,
    temperature: 0.1,
    meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'mediaReview.screenshot' },
  });

  return parseReviewResult(raw);
}

// ---------------------------------------------------------------------------
// Document review (text-based)
// ---------------------------------------------------------------------------

export async function reviewDocumentEvidence(
  documentText: string,
  taskDescription: string,
  meterContext: MeterContext,
  expectedContent?: string,
): Promise<MediaReviewResult> {
  const prompt = `You are reviewing a document submitted as evidence for a task.

## Task
${taskDescription}

${expectedContent ? `## Expected Content\n${expectedContent}` : ''}

## Document Content
${documentText.slice(0, 6000)}

## Instructions
1. Assess whether the document content satisfies the task requirements
2. Extract key facts (dates, amounts, names, terms, etc.)
3. Note any concerns (incomplete, wrong format, suspicious)

Respond with JSON:
{
  "verified": true/false,
  "reasoning": "Your assessment",
  "confidence": 0.0-1.0,
  "extracted_facts": { "key": "value" }
}`;

  const raw = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are an evidence verification assistant. Respond only with valid JSON.',
    maxTokens: 2048,
    temperature: 0.1,
    meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'mediaReview.document' },
  });

  return parseReviewResult(raw);
}

// ---------------------------------------------------------------------------
// Audio transcript review
// ---------------------------------------------------------------------------

export async function reviewAudioEvidence(
  transcription: string,
  taskDescription: string,
  meterContext: MeterContext,
  expectedOutcome?: string,
): Promise<MediaReviewResult> {
  const prompt = `You are reviewing an audio transcript submitted as evidence for a task.

## Task
${taskDescription}

${expectedOutcome ? `## Expected Outcome\n${expectedOutcome}` : ''}

## Transcript
${transcription.slice(0, 6000)}

## Instructions
1. Assess whether the conversation/audio satisfies the task requirements
2. Extract key facts (commitments, agreements, prices, dates, names)
3. Note the sentiment and outcome of the conversation

Respond with JSON:
{
  "verified": true/false,
  "reasoning": "Your assessment",
  "confidence": 0.0-1.0,
  "extracted_facts": { "key": "value" }
}`;

  const raw = await bedrockChatOnce({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are an evidence verification assistant. Respond only with valid JSON.',
    maxTokens: 2048,
    temperature: 0.1,
    meterContext: { ...meterContext, serviceKey: meterContext.serviceKey || 'mediaReview.audio' },
  });

  return parseReviewResult(raw);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseReviewResult(raw: string): MediaReviewResult {
  let json: any;
  try {
    json = JSON.parse(raw.trim());
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) json = JSON.parse(match[1].trim());
    else {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end > start) json = JSON.parse(raw.slice(start, end + 1));
      else throw new Error('Could not parse review response');
    }
  }

  return {
    verified: json.verified === true,
    reasoning: json.reasoning || 'No reasoning provided',
    confidence: typeof json.confidence === 'number' ? json.confidence : 0.5,
    extractedFacts: json.extracted_facts || json.extractedFacts,
  };
}
