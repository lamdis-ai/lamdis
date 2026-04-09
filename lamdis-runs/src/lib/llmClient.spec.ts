import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('llmClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('runLLMConversation', () => {
    it('uses Bedrock with default model', async () => {
      delete process.env.BEDROCK_MODEL_ID;
      
      const mockBedrockChat = vi.fn().mockResolvedValue('Bedrock response');
      
      vi.doMock('./bedrockChat.js', () => ({
        bedrockChatOnce: mockBedrockChat,
      }));
      
      const { runLLMConversation } = await import('./llmClient.js');
      
      const result = await runLLMConversation([{ role: 'user', content: 'Hello' }], { orgId: 'test-org', serviceKey: 'test' });
      
      expect(mockBedrockChat).toHaveBeenCalledWith(expect.objectContaining({
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      }));
      expect(result.messages[result.messages.length - 1].content).toBe('Bedrock response');
    });

    it('uses custom Bedrock model ID from env', async () => {
      process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';
      
      const mockBedrockChat = vi.fn().mockResolvedValue('response');
      
      vi.doMock('./bedrockChat.js', () => ({
        bedrockChatOnce: mockBedrockChat,
      }));
      
      const { runLLMConversation } = await import('./llmClient.js');
      
      await runLLMConversation([{ role: 'user', content: 'Hello' }], { orgId: 'test-org', serviceKey: 'test' });
      
      expect(mockBedrockChat).toHaveBeenCalledWith(expect.objectContaining({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      }));
    });

    it('returns messages with assistant response appended', async () => {
      const mockBedrockChat = vi.fn().mockResolvedValue('Assistant reply');
      
      vi.doMock('./bedrockChat.js', () => ({
        bedrockChatOnce: mockBedrockChat,
      }));
      
      const { runLLMConversation } = await import('./llmClient.js');
      
      const result = await runLLMConversation([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ], { orgId: 'test-org', serviceKey: 'test' });
      
      expect(result.messages).toHaveLength(3);
      expect(result.messages[2]).toEqual({ role: 'assistant', content: 'Assistant reply' });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
