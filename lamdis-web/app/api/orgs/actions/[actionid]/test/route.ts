import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getOrgId(api: string, token: string) {
  const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r => r.json());
  return me?.orgs?.[0]?.orgId;
}

// POST /api/orgs/actions/[actionid]/test - Test an action with given inputs
export async function POST(req: NextRequest, props: { params: Promise<{ actionid: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

  try {
    const orgId = await getOrgId(api, token);
    if (!orgId) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    }
    
    const body = await req.json().catch(() => ({}));
    const { input, setupId, environmentId } = body;
    
    // Delegate to the API's action test endpoint
    const resp = await fetch(`${api}/orgs/${orgId}/actions/${params.actionid}/test`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: input || {},
        setupId,
        environmentId,
      }),
    });
    
    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'test_failed' }, { status: 500 });
  }
}
