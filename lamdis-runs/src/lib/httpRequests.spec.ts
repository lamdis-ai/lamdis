import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock cross-fetch
vi.mock('cross-fetch', () => ({
  default: vi.fn(),
}));

// Mock repo (replaces old Mongoose model mocks)
vi.mock('../db/repo.js', () => ({
  repo: {
    getAction: vi.fn(),
    getDefaultEnvironment: vi.fn(),
    getActionBinding: vi.fn(),
  },
}));

import { resolveAuthHeaderFromBlock, executeRequest } from './httpRequests.js';
import { repo } from '../db/repo.js';
import fetch from 'cross-fetch';

/** Helper: create a mock fetch response with proper headers.forEach */
function mockResponse(opts: { contentType?: string; body?: any; status?: number }) {
  const ct = opts.contentType ?? 'application/json';
  const headersMap = new Map([['content-type', ct]]);
  return {
    headers: {
      get: (k: string) => headersMap.get(k.toLowerCase()) ?? null,
      forEach: (cb: (v: string, k: string) => void) => headersMap.forEach((v, k) => cb(v, k)),
    },
    json: () => Promise.resolve(opts.body ?? {}),
    text: () => Promise.resolve(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body ?? {})),
    status: opts.status ?? 200,
  };
}

describe('httpRequests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveAuthHeaderFromBlock', () => {
    it('returns undefined for null auth', async () => {
      const result = await resolveAuthHeaderFromBlock(null, {});
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-object auth', async () => {
      const result = await resolveAuthHeaderFromBlock('string', {});
      expect(result).toBeUndefined();
    });

    it('returns undefined for unknown kind', async () => {
      const result = await resolveAuthHeaderFromBlock({ kind: 'unknown' }, {});
      expect(result).toBeUndefined();
    });

    it('extracts authorization from headers block', async () => {
      const auth = {
        headers: {
          authorization: 'Bearer my-token',
        },
      };
      const result = await resolveAuthHeaderFromBlock(auth, {});
      expect(result).toBe('Bearer my-token');
    });

    it('extracts Authorization (capitalized) from headers block', async () => {
      const auth = {
        headers: {
          Authorization: 'Bearer my-capitalized-token',
        },
      };
      const result = await resolveAuthHeaderFromBlock(auth, {});
      expect(result).toBe('Bearer my-capitalized-token');
    });

    it('interpolates variables in headers', async () => {
      const auth = {
        headers: {
          authorization: 'Bearer ${env.API_TOKEN}',
        },
      };
      const rootVars = { env: { API_TOKEN: 'interpolated-token' } };
      const result = await resolveAuthHeaderFromBlock(auth, rootVars);
      expect(result).toBe('Bearer interpolated-token');
    });

    it('returns undefined if authorization header not a string', async () => {
      const auth = {
        headers: {
          authorization: { nested: 'object' },
        },
      };
      const result = await resolveAuthHeaderFromBlock(auth, {});
      expect(result).toBeUndefined();
    });

    describe('oauth_client_credentials', () => {
      it('returns undefined if clientId is missing', async () => {
        const auth = {
          kind: 'oauth_client_credentials',
          clientSecret: 'secret',
          tokenUrl: 'https://example.com/token',
        };
        const result = await resolveAuthHeaderFromBlock(auth, {});
        expect(result).toBeUndefined();
      });

      it('returns undefined if clientSecret is missing', async () => {
        const auth = {
          kind: 'oauth_client_credentials',
          clientId: 'id',
          tokenUrl: 'https://example.com/token',
        };
        const result = await resolveAuthHeaderFromBlock(auth, {});
        expect(result).toBeUndefined();
      });

      it('returns undefined if tokenUrl is missing', async () => {
        const auth = {
          kind: 'oauth_client_credentials',
          clientId: 'id',
          clientSecret: 'secret',
        };
        const result = await resolveAuthHeaderFromBlock(auth, {});
        expect(result).toBeUndefined();
      });

      it('fetches token from OAuth endpoint', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'oauth-token', expires_in: 3600 }),
        });

        const auth = {
          kind: 'oauth_client_credentials',
          clientId: 'my-client-id',
          clientSecret: 'my-client-secret',
          tokenUrl: 'https://auth.example.com/token',
        };

        const result = await resolveAuthHeaderFromBlock(auth, {});

        expect(fetch).toHaveBeenCalledWith(
          'https://auth.example.com/token',
          expect.objectContaining({
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          })
        );
        expect(result).toBe('Bearer oauth-token');
      });

      it('includes scopes in token request', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'scoped-token' }),
        });

        const auth = {
          kind: 'oauth_client_credentials',
          clientId: 'client',
          clientSecret: 'secret',
          tokenUrl: 'https://auth.example.com/token',
          scopes: ['read', 'write'],
        };

        await resolveAuthHeaderFromBlock(auth, {});

        const callBody = (fetch as any).mock.calls[0][1].body;
        expect(callBody).toContain('scope=read+write');
      });

      it('uses cached token if not expired', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          json: () => Promise.resolve({ access_token: 'cached-token', expires_in: 3600 }),
        });

        const auth = {
          kind: 'oauth_client_credentials',
          clientId: 'cached-client',
          clientSecret: 'secret',
          tokenUrl: 'https://auth.example.com/token',
        };

        // First call - fetches token
        const result1 = await resolveAuthHeaderFromBlock(auth, {});
        expect(result1).toBe('Bearer cached-token');

        // Second call - should use cache
        const result2 = await resolveAuthHeaderFromBlock(auth, {});
        expect(result2).toBe('Bearer cached-token');

        // fetch should only have been called once
        expect(fetch).toHaveBeenCalledTimes(1);
      });

      it('returns undefined and logs when token fetch fails', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

        const auth = {
          kind: 'oauth_client_credentials',
          clientId: 'failing-client',
          clientSecret: 'secret',
          tokenUrl: 'https://auth.example.com/token',
        };

        const logEntries: any[] = [];
        const log = (e: any) => logEntries.push(e);

        const result = await resolveAuthHeaderFromBlock(auth, {}, log);

        expect(result).toBeUndefined();
        expect(logEntries).toHaveLength(1);
        expect(logEntries[0].type).toBe('auth_error');
      });

      it('returns undefined when access_token is empty', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: '' }),
          status: 200,
        });

        const auth = {
          kind: 'oauth_client_credentials',
          clientId: 'empty-token-client',
          clientSecret: 'secret',
          tokenUrl: 'https://auth.example.com/token',
        };

        const logEntries: any[] = [];
        const result = await resolveAuthHeaderFromBlock(auth, {}, (e) => logEntries.push(e));

        expect(result).toBeUndefined();
        expect(logEntries[0].type).toBe('auth_error');
      });

      it('interpolates clientId and clientSecret from vars', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'env-token' }),
        });

        const auth = {
          kind: 'oauth_client_credentials',
          clientId: '${env.CLIENT_ID}',
          clientSecret: '${env.CLIENT_SECRET}',
          tokenUrl: 'https://auth.example.com/token',
        };

        const rootVars = {
          env: { CLIENT_ID: 'from-env-id', CLIENT_SECRET: 'from-env-secret' },
        };

        await resolveAuthHeaderFromBlock(auth, rootVars);

        const callBody = (fetch as any).mock.calls[0][1].body;
        expect(callBody).toContain('client_id=from-env-id');
        expect(callBody).toContain('client_secret=from-env-secret');
      });
    });
  });

  describe('executeRequest', () => {
    it('throws error when action not found', async () => {
      (repo.getAction as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(executeRequest('org-1', 'missing-action', {}))
        .rejects.toThrow('action_not_found: missing-action');
    });

    it('throws error when URL is missing', async () => {
      (repo.getAction as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'test-action', actionId: 'test-action' });
      (repo.getDefaultEnvironment as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(executeRequest('org-1', 'test-action', {}))
        .rejects.toThrow('action_binding_required');
    });

    it('uses fileActions when provided', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse({ body: { success: true } })
      );

      const fileActions = {
        'my-action': {
          method: 'GET',
          path: 'https://api.example.com/data',
        },
      };

      const result = await executeRequest('org-1', 'my-action', {}, undefined, undefined, fileActions);

      expect(result.status).toBe(200);
      expect(result.payload).toEqual({ success: true });
      expect(result.kind).toBe('data');
    });

    it('makes GET request with query params', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse({ body: { id: 123 } })
      );

      const fileActions = {
        'get-user': {
          method: 'GET',
          path: 'https://api.example.com/users',
        },
      };

      await executeRequest('org-1', 'get-user', { id: '123' }, undefined, undefined, fileActions);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('id=123'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('makes POST request with JSON body', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse({ body: { created: true }, status: 201 })
      );

      const fileActions = {
        'create-user': {
          method: 'POST',
          path: 'https://api.example.com/users',
        },
      };

      const result = await executeRequest(
        'org-1', 'create-user', { name: 'Test' }, undefined, undefined, fileActions
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        })
      );
      expect(result.status).toBe(201);
    });

    it('includes auth header when provided', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse({ body: {} })
      );

      const fileActions = {
        'authed-action': {
          method: 'GET',
          path: 'https://api.example.com/secure',
        },
      };

      await executeRequest('org-1', 'authed-action', {}, 'Bearer my-token', undefined, fileActions);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
        })
      );
    });

    it('handles text response', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse({ contentType: 'text/plain', body: 'Hello World' })
      );

      const fileActions = {
        'text-action': {
          method: 'GET',
          path: 'https://api.example.com/text',
        },
      };

      const result = await executeRequest('org-1', 'text-action', {}, undefined, undefined, fileActions);

      expect(result.kind).toBe('text');
      expect(result.payload).toBe('Hello World');
    });

    it('interpolates URL template variables', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse({ body: {} })
      );

      const fileActions = {
        'templated-action': {
          method: 'GET',
          path: 'https://api.example.com/users/{userId}',
        },
      };

      await executeRequest('org-1', 'templated-action', { userId: '456' }, undefined, undefined, fileActions);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/456'),
        expect.any(Object)
      );
    });

    it('calls log function for action execution and result', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse({ body: {} })
      );

      const fileActions = {
        'logged-action': {
          method: 'GET',
          path: 'https://api.example.com/log',
        },
      };

      const logEntries: any[] = [];
      await executeRequest('org-1', 'logged-action', {}, undefined, (e) => logEntries.push(e), fileActions);

      // Logs include binding lookup entries + exec + result
      expect(logEntries.length).toBeGreaterThanOrEqual(2);
      const types = logEntries.map((e) => e.type);
      expect(types).toContain('action_exec');
      expect(types).toContain('action_result');
    });
  });
});
