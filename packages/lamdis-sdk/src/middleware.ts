/**
 * Middleware for propagating the Lamdis interaction instance ID
 * via the X-Lamdis-Instance-Id header.
 *
 * Works with Express, Fastify, and compatible HTTP frameworks.
 */

const HEADER_NAME = 'x-lamdis-instance-id';

/**
 * Extract the Lamdis instance ID from an incoming request's headers.
 */
export function extractInstanceId(headers: Record<string, string | string[] | undefined>): string | undefined {
  const value = headers[HEADER_NAME];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * Create headers object with the instance ID for outgoing requests.
 */
export function propagationHeaders(instanceId: string): Record<string, string> {
  return { [HEADER_NAME]: instanceId };
}

/**
 * Express-compatible middleware that extracts X-Lamdis-Instance-Id
 * from incoming requests and attaches it to req.lamdisInstanceId.
 */
export function expressMiddleware() {
  return (req: any, _res: any, next: any) => {
    const instanceId = extractInstanceId(req.headers);
    if (instanceId) {
      req.lamdisInstanceId = instanceId;
    }
    next();
  };
}

/**
 * Fastify plugin that extracts X-Lamdis-Instance-Id from incoming
 * requests and decorates the request object.
 */
export function fastifyPlugin(fastify: any, _opts: any, done: any) {
  fastify.decorateRequest('lamdisInstanceId', null);

  fastify.addHook('onRequest', (req: any, _reply: any, hookDone: any) => {
    const instanceId = extractInstanceId(req.headers);
    if (instanceId) {
      req.lamdisInstanceId = instanceId;
    }
    hookDone();
  });

  done();
}
