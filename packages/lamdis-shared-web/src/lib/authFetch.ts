/**
 * Auth-aware fetch utility that handles 401 errors gracefully.
 * Instead of immediately redirecting (which can cause loops), 
 * this throws an AuthError that can be caught and shown to the user.
 * 
 * For components within the dashboard, use the useAuthFetch() hook instead,
 * which automatically triggers the global auth overlay on 401.
 */

export class AuthError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

// Track if we've already tried to redirect to prevent loops
let redirectAttempted = false;

// Global callback for when auth errors occur (set by AuthProvider)
let globalAuthErrorCallback: (() => void) | null = null;

/**
 * Register a global callback for auth errors.
 * This is called by the AuthProvider to connect the authFetch to the context.
 */
export function setGlobalAuthErrorCallback(callback: (() => void) | null) {
  globalAuthErrorCallback = callback;
}

export type AuthFetchOptions = RequestInit & {
  /** If true, does NOT redirect on 401. Default is true (no auto-redirect). */
  throwOnAuthError?: boolean;
};

/**
 * Performs a fetch request and handles 401 errors.
 * By default, throws an AuthError on 401 so the UI can handle it gracefully.
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options plus auth-specific options
 * @returns The fetch response
 * @throws AuthError if a 401 is received
 */
export async function authFetch(
  url: string,
  options?: AuthFetchOptions
): Promise<Response> {
  const { throwOnAuthError = true, ...fetchOptions } = options || {};
  
  // Always include credentials to send cookies with the request
  const response = await fetch(url, {
    ...fetchOptions,
    credentials: 'include',
  });
  
  if (response.status === 401) {
    const data = await response.clone().json().catch(() => ({}));
    
    // Trigger global auth overlay if callback is registered
    if (globalAuthErrorCallback) {
      globalAuthErrorCallback();
    }
    
    // Always throw by default - let UI handle it gracefully
    if (throwOnAuthError) {
      throw new AuthError(data.error || 'unauthorized', 401);
    }
    
    // Only redirect if we haven't already tried (prevents loops)
    if (!redirectAttempted && typeof window !== 'undefined') {
      redirectAttempted = true;
      const currentPath = window.location.pathname + window.location.search;
      const returnTo = encodeURIComponent(currentPath);
      window.location.href = `/auth/login?returnTo=${returnTo}`;
      
      // Return a never-resolving promise since we're redirecting
      return new Promise(() => {});
    }
  }
  
  return response;
}

/**
 * Helper to check if an error is an auth error
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Reset the redirect flag - call this after successful auth
 */
export function resetAuthRedirect() {
  redirectAttempted = false;
}

/**
 * Check if we should show login prompt (unauthorized state)
 */
export function shouldShowLoginPrompt(error: unknown): boolean {
  return isAuthError(error) && error.status === 401;
}

/**
 * Get the login URL with return path
 */
export function getLoginUrl(returnTo?: string): string {
  const path = returnTo || (typeof window !== 'undefined' 
    ? window.location.pathname + window.location.search 
    : '/dashboard');
  return `/auth/login?returnTo=${encodeURIComponent(path)}`;
}

/**
 * Helper to handle response errors consistently
 */
export async function handleApiResponse<T>(
  response: Response,
  options?: {
    onUnauthorized?: () => void;
    onNoOrg?: () => void;
    onError?: (error: string) => void;
  }
): Promise<T | null> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Unknown error' }));
    
    if (response.status === 401) {
      options?.onUnauthorized?.();
      return null;
    }
    
    if (data.error === 'no_org_selected') {
      options?.onNoOrg?.();
      return null;
    }
    
    options?.onError?.(data.error || 'An error occurred');
    return null;
  }
  
  return response.json();
}