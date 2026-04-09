import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  try {
    const token = await getBearerSafe();
    if (!token) return new Response(JSON.stringify({ workflows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
    let me = await fetch(`${api}/me`, { headers: { Authorization: token } });
    let meJson: any = await me.json().catch(()=>({}));
    let orgId = meJson?.orgs?.[0]?.orgId;
    if (!orgId) {
      // Attempt to bootstrap org for first-time users
      await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: token } });
      me = await fetch(`${api}/me`, { headers: { Authorization: token } });
      meJson = await me.json().catch(()=>({}));
      orgId = meJson?.orgs?.[0]?.orgId;
    }
    if (!orgId) return new Response(JSON.stringify({ workflows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    const res = await fetch(`${api}/orgs/${orgId}/workflows`, { headers: { Authorization: token } });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ workflows: [], error: e?.message || 'failed' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
}

export async function POST(req: Request) {
  const token = await getBearerSafe();
  if (!token) return new Response('Unauthorized', { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const me = await fetch(`${api}/me`, { headers: { Authorization: token } }).then(r=>r.json());
  const orgId = me?.orgs?.[0]?.orgId;
  if (!orgId) return new Response('No org', { status: 400 });
  const contentType = req.headers.get('content-type') || '';
  let payload: any = {};
  if (contentType.includes('application/json')) {
    payload = await req.json();
  } else {
    const form = await req.formData();
    const wf: any = {};
    for (const [k, v] of form.entries()) {
      if (!k.startsWith('workflow.')) continue;
      const key = k.replace(/^workflow\./, '');
      if (key === 'definition') {
        try { wf.definition = JSON.parse(String(v || '{}')); } catch { wf.definition = {}; }
      } else {
        (wf as any)[key] = String(v);
      }
    }
    payload = { workflow: wf };
  }
  const res = await fetch(`${api}/orgs/${orgId}/workflows`, { method: 'POST', headers: { Authorization: token, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  // Forward backend response (status/body) to client instead of forcing a redirect
  const txt = await res.text();
  const content = res.headers.get('content-type') || 'application/json';
  return new Response(txt, { status: res.status, headers: { 'content-type': content } });
}
