import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AssistantProtocol,
  AssistantConnectionConfig,
  isStreamingProtocol,
  createConnectionConfig,
} from './assistantClient.js';

describe('assistantClient', () => {
  describe('isStreamingProtocol', () => {
    it('should return true for SSE protocol', () => {
      expect(isStreamingProtocol('sse')).toBe(true);
    });

    it('should return true for WebSocket protocol', () => {
      expect(isStreamingProtocol('websocket')).toBe(true);
    });

    it('should return false for http_chat protocol', () => {
      expect(isStreamingProtocol('http_chat')).toBe(false);
    });
  });

  describe('createConnectionConfig', () => {
    it('should create a valid HTTP config', () => {
      const config = createConnectionConfig({
        baseUrl: 'https://api.example.com/chat',
        headers: { Authorization: 'Bearer token' },
        responseFieldPath: 'data.reply',
      });

      expect(config.protocol).toBe('http_chat');
      expect(config.baseUrl).toBe('https://api.example.com/chat');
      expect(config.headers?.Authorization).toBe('Bearer token');
      expect(config.responseFieldPath).toBe('data.reply');
    });

    it('should create a valid SSE config', () => {
      const config = createConnectionConfig({
        baseUrl: 'https://api.example.com/stream',
        protocol: 'sse',
        sse: {
          contentPath: 'choices[0].delta.content',
          finishPath: 'choices[0].finish_reason',
          finishValue: ['stop', 'length'],
        },
      });

      expect(config.protocol).toBe('sse');
      expect(config.sse?.contentPath).toBe('choices[0].delta.content');
      expect(config.sse?.finishPath).toBe('choices[0].finish_reason');
      expect(config.sse?.finishValue).toEqual(['stop', 'length']);
    });

    it('should create a valid WebSocket config', () => {
      const config = createConnectionConfig({
        baseUrl: 'wss://api.example.com/ws',
        protocol: 'websocket',
        websocket: {
          messageFormat: 'json',
          messageField: 'content',
          contentPath: 'response.text',
          finishPath: 'type',
          finishValue: 'done',
        },
      });

      expect(config.protocol).toBe('websocket');
      expect(config.websocket?.messageFormat).toBe('json');
      expect(config.websocket?.messageField).toBe('content');
      expect(config.websocket?.contentPath).toBe('response.text');
    });

    it('should set default timeout', () => {
      const config = createConnectionConfig({
        baseUrl: 'https://api.example.com/chat',
      });

      expect(config.timeoutMs).toBe(60000);
    });

    it('should allow custom timeout', () => {
      const config = createConnectionConfig({
        baseUrl: 'https://api.example.com/chat',
        timeoutMs: 120000,
      });

      expect(config.timeoutMs).toBe(120000);
    });
  });
});