/**
 * Common interface for all authentication strategies.
 * Each strategy knows how to verify a bearer token and return
 * a normalised AuthenticatedUser object.
 */
export interface AuthenticatedUser {
  /** Unique user identifier (OIDC `sub` claim, Auth0 `sub`, or admin token id) */
  sub: string;
  email?: string;
  name?: string;
  /** IdP group memberships (from OIDC group claim or Auth0 roles) */
  groups?: string[];
  /** Auth0 organization ID claim (cloud only) */
  org_id?: string;
  /** Full decoded token payload for downstream consumers */
  raw: Record<string, any>;
}

export interface AuthStrategy {
  /** Human-readable strategy name for logging */
  readonly name: string;
  /** One-time async setup (e.g. JWKS discovery) */
  initialize(): Promise<void>;
  /** Verify a bearer token and return the authenticated user. Throws on failure. */
  verify(token: string): Promise<AuthenticatedUser>;
}
