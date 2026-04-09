/**
 * SSRF protection: blocks requests to private/internal IP ranges and cloud metadata endpoints.
 */

const PRIVATE_PATTERNS = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC 1918
  /^192\.168\./,                     // RFC 1918
  /^169\.254\./,                     // link-local / AWS metadata
  /^0\./,                            // current network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 unique local
  /^fe80:/i,                         // IPv6 link-local
  /^fd/i,                            // IPv6 unique local
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.google',
];

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (BLOCKED_HOSTNAMES.includes(h)) return true;
  if (h.endsWith('.internal')) return true;
  return PRIVATE_PATTERNS.some(p => p.test(h));
}
