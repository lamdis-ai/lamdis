/**
 * Vault Broker Client
 *
 * Communicates with a customer-owned broker endpoint to request JIT signed URLs
 * for raw evidence artifacts. Lamdis never holds vault credentials — the customer's
 * broker handles signing and access control.
 *
 * Broker API contract:
 *   POST <broker_url>
 *   Authorization: <customer-provided auth header>
 *   Body: { artifact_pointer: { provider, bucket, key, region }, ttl_seconds: number }
 *   Response: { url: string, expires_at: string, ttl_seconds: number }
 */

export interface BrokerConfig {
  url: string;
  authHeader: string; // Decrypted Authorization header value
}

export interface ArtifactPointer {
  provider: string;
  bucket: string;
  key: string;
  region?: string;
  size?: number;
  contentType?: string;
  uploadedAt?: Date;
}

export interface JitUrlResponse {
  url: string;
  expiresAt: string;  // ISO 8601
  ttlSeconds: number;
}

export interface BrokerTestResult {
  success: boolean;
  error?: string;
  latencyMs: number;
}

const BROKER_TIMEOUT_MS = 10_000;

/**
 * Request a JIT signed URL from the customer's broker endpoint.
 */
export async function requestJitUrl(
  config: BrokerConfig,
  pointer: ArtifactPointer,
  ttlSeconds: number,
): Promise<JitUrlResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROKER_TIMEOUT_MS);

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.authHeader,
      },
      body: JSON.stringify({
        artifact_pointer: {
          provider: pointer.provider,
          bucket: pointer.bucket,
          key: pointer.key,
          region: pointer.region,
        },
        ttl_seconds: ttlSeconds,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Broker returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();

    if (!data.url || typeof data.url !== 'string') {
      throw new Error('Broker response missing "url" field');
    }

    return {
      url: data.url,
      expiresAt: data.expires_at || new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      ttlSeconds: data.ttl_seconds ?? ttlSeconds,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Broker request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Test broker connectivity. Sends a health-check request and measures latency.
 */
export async function testBrokerConnection(
  config: BrokerConfig,
  healthCheckUrl?: string,
): Promise<BrokerTestResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROKER_TIMEOUT_MS);

  try {
    // Prefer dedicated health check URL if provided
    const url = healthCheckUrl || config.url;
    const method = healthCheckUrl ? 'GET' : 'POST';
    const headers: Record<string, string> = {
      'Authorization': config.authHeader,
    };

    const fetchOpts: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    // For POST (no health check URL), send a test payload
    if (!healthCheckUrl) {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify({
        artifact_pointer: { provider: 's3', bucket: 'test', key: 'lamdis-connection-test', region: 'us-east-1' },
        ttl_seconds: 30,
        _test: true,
      });
    }

    const res = await fetch(url, fetchOpts);
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}`, latencyMs };
    }

    return { success: true, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    if (err?.name === 'AbortError') {
      return { success: false, error: 'Connection timed out', latencyMs };
    }
    return { success: false, error: err?.message || 'Unknown error', latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
