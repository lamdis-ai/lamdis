import { getBearerSafe } from '@/lib/auth';

const API_URL = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Get the current user's orgId via /me endpoint.
 */
export async function getOrgId(token: string): Promise<string | null> {
  let me = await fetch(`${API_URL()}/me`, { headers: { Authorization: token } });
  let meJson: any = await me.json().catch(() => ({}));
  let orgId = meJson?.orgs?.[0]?.orgId;
  if (!orgId) {
    await fetch(`${API_URL()}/me/bootstrap`, { method: 'POST', headers: { Authorization: token } });
    me = await fetch(`${API_URL()}/me`, { headers: { Authorization: token } });
    meJson = await me.json().catch(() => ({}));
    orgId = meJson?.orgs?.[0]?.orgId;
  }
  return orgId || null;
}

/**
 * Proxy a GET request to lamdis-api for the current org.
 */
export async function proxyGet(path: string, fallback: any = null): Promise<Response> {
  try {
    const token = await getBearerSafe();
    if (!token) return jsonResponse(fallback || {}, 200);
    const orgId = await getOrgId(token);
    if (!orgId) return jsonResponse(fallback || {}, 200);
    const res = await fetch(`${API_URL()}/orgs/${orgId}${path}`, { headers: { Authorization: token } });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'failed' }, 500);
  }
}

/**
 * Proxy a POST request to lamdis-api for the current org.
 */
export async function proxyPost(path: string, req: Request): Promise<Response> {
  try {
    const token = await getBearerSafe();
    if (!token) return new Response('Unauthorized', { status: 401 });
    const orgId = await getOrgId(token);
    if (!orgId) return new Response('No org', { status: 400 });
    const body = await req.text();
    const res = await fetch(`${API_URL()}/orgs/${orgId}${path}`, {
      method: 'POST',
      headers: { Authorization: token, 'content-type': 'application/json' },
      body,
    });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'failed' }, 500);
  }
}

/**
 * Proxy a DELETE request to lamdis-api for the current org.
 */
export async function proxyDelete(path: string): Promise<Response> {
  try {
    const token = await getBearerSafe();
    if (!token) return new Response('Unauthorized', { status: 401 });
    const orgId = await getOrgId(token);
    if (!orgId) return new Response('No org', { status: 400 });
    const res = await fetch(`${API_URL()}/orgs/${orgId}${path}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'failed' }, 500);
  }
}

/**
 * Proxy a PUT request to lamdis-api for the current org.
 */
export async function proxyPut(path: string, req: Request): Promise<Response> {
  try {
    const token = await getBearerSafe();
    if (!token) return new Response('Unauthorized', { status: 401 });
    const orgId = await getOrgId(token);
    if (!orgId) return new Response('No org', { status: 400 });
    const body = await req.text();
    const res = await fetch(`${API_URL()}/orgs/${orgId}${path}`, {
      method: 'PUT',
      headers: { Authorization: token, 'content-type': 'application/json' },
      body,
    });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'failed' }, 500);
  }
}

/**
 * Proxy a PATCH request to lamdis-api for the current org.
 */
export async function proxyPatch(path: string, req: Request): Promise<Response> {
  try {
    const token = await getBearerSafe();
    if (!token) return new Response('Unauthorized', { status: 401 });
    const orgId = await getOrgId(token);
    if (!orgId) return new Response('No org', { status: 400 });
    const body = await req.text();
    const res = await fetch(`${API_URL()}/orgs/${orgId}${path}`, {
      method: 'PATCH',
      headers: { Authorization: token, 'content-type': 'application/json' },
      body,
    });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'failed' }, 500);
  }
}

function jsonResponse(data: any, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
