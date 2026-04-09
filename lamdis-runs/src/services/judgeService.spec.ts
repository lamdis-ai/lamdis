import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { judgeBodySchema, judgeConversation } from './judgeService.js';

// Mock bedrockChatOnce
vi.mock('../lib/bedrockRuntime.js', () => ({
  bedrockChatOnce: vi.fn(),
}));

describe('judgeService', () => {
  describe('judgeBodySchema', () => {
    it('validates minimal valid body', () => {
      const body = { rubric: 'Test rubric' };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    it('rejects empty rubric', () => {
      const body = { rubric: '' };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    it('rejects missing rubric', () => {
      const body = { threshold: 0.8 };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    it('accepts full body with all optional fields', () => {
      const body = {
        rubric: 'Test rubric',
        threshold: 0.8,
        transcript: [{ role: 'user', content: 'hello' }],
        lastAssistant: 'Hello! How can I help?',
        requestNext: true,
        persona: 'friendly customer',
      };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.threshold).toBe(0.8);
        expect(result.data.requestNext).toBe(true);
      }
    });

    it('defaults transcript to empty array', () => {
      const body = { rubric: 'Test' };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transcript).toEqual([]);
      }
    });

    it('accepts scope parameter', () => {
      const body = { rubric: 'Test', scope: 'transcript' };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scope).toBe('transcript');
      }
    });

    it('defaults scope to last', () => {
      const body = { rubric: 'Test' };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scope).toBe('last');
      }
    });

    it('rejects invalid scope values', () => {
      const body = { rubric: 'Test', scope: 'invalid' };
      const result = judgeBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });
  });

  describe('judgeConversation with Bedrock', () => {
    const originalEnv = process.env;

    beforeEach(async () => {
      vi.resetModules();
      process.env = { ...originalEnv };
      vi.clearAllMocks();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('calls bedrock and returns parsed result', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: true, score: 0.9, threshold: 0.75, reasoning: 'Bedrock judge passed' })
      );

      const body = {
        rubric: 'Test rubric',
        transcript: [],
        lastAssistant: 'Test response',
      };

      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(bedrockChatOnce).toHaveBeenCalled();
      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.9);
      expect(result.reasoning).toBe('Bedrock judge passed');
    });

    it('handles bedrock response with markdown code blocks', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        '```json\n{"pass": true, "score": 0.8, "reasoning": "Good"}\n```'
      );

      const body = { rubric: 'Test', transcript: [], lastAssistant: 'Test' };
      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.8);
    });

    it('returns error on bedrock failure', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Bedrock unavailable'));

      const body = { rubric: 'Test', transcript: [], lastAssistant: 'Test' };
      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(result.pass).toBe(false);
      expect(result.reasoning).toContain('judge_error');
      expect(result.reasoning).toContain('Bedrock unavailable');
    });

    it('uses custom model ID from env', async () => {
      process.env.BEDROCK_JUDGE_MODEL_ID = 'custom-model';
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: true, score: 0.7, reasoning: 'ok' })
      );

      const body = { rubric: 'Test', transcript: [], lastAssistant: 'Test' };
      await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(bedrockChatOnce).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: 'custom-model' })
      );
    });

    it('uses custom temperature from env', async () => {
      process.env.BEDROCK_JUDGE_TEMPERATURE = '0.5';
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: true, score: 0.7, reasoning: 'ok' })
      );

      const body = { rubric: 'Test', transcript: [], lastAssistant: 'Test' };
      await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(bedrockChatOnce).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 })
      );
    });

    it('uses default threshold of 0.75 when not provided', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: true, score: 0.8, reasoning: 'good' })
      );

      const body = {
        rubric: 'test rubric',
        transcript: [],
        lastAssistant: 'test response',
      };

      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(result.threshold).toBe(0.75);
    });

    it('defaults score to threshold when missing and pass is true', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: true, reasoning: 'Good' })
      );

      const body = { rubric: 'Test', threshold: 0.6, transcript: [], lastAssistant: 'Test' };
      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(result.threshold).toBe(0.6);
      expect(result.score).toBe(0.6); // Defaults to threshold when pass is true
    });

    it('defaults score to 0 when pass is false', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: false, reasoning: 'Bad' })
      );

      const body = { rubric: 'Test', threshold: 0.6, transcript: [], lastAssistant: 'Test' };
      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(result.score).toBe(0);
    });

    it('evaluates only lastAssistant when scope is "last"', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: false, score: 0.2, reasoning: 'Keywords not found' })
      );

      const body = {
        rubric: 'password reset',
        threshold: 0.3,
        transcript: [
          { role: 'user', content: 'I forgot my password' },
          { role: 'assistant', content: 'I can help you reset your password right away.' },
        ],
        lastAssistant: 'Thank you for contacting us!',
        scope: 'last' as const,
      };

      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      // Should use lastAssistant only
      expect(bedrockChatOnce).toHaveBeenCalled();
      expect(result.pass).toBe(false);
    });

    it('evaluates entire transcript when scope is "transcript"', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ pass: true, score: 0.8, reasoning: 'Found in transcript' })
      );

      const body = {
        rubric: 'password reset',
        threshold: 0.3,
        transcript: [
          { role: 'user', content: 'I forgot my password' },
          { role: 'assistant', content: 'I can help you reset your password right away.' },
        ],
        lastAssistant: 'Thank you for contacting us!',
        scope: 'transcript' as const,
      };

      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(result.pass).toBe(true);
    });

    it('returns parse failed on invalid JSON', async () => {
      const { bedrockChatOnce } = await import('../lib/bedrockRuntime.js');
      (bedrockChatOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'Not valid JSON at all'
      );

      const body = {
        rubric: 'Test rubric',
        transcript: [],
        lastAssistant: 'Test response',
      };

      const result = await judgeConversation(body, { orgId: 'test-org', serviceKey: 'test' });

      expect(result.pass).toBe(false);
      expect(result.reasoning).toContain('judge_error');
    });
  });
});
