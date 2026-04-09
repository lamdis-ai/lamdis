import { auth0 } from "./auth0";

// Returns a Bearer token string or empty string if none; never throws.
export async function getBearerSafe(): Promise<string> {
  try {
    const token = await auth0.getAccessToken();
    return token ? `Bearer ${token.token}` : "";
  } catch {
    return "";
  }
}

// Re-export auth0 helpers for convenience
export { auth0 };