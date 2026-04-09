import { getBearerSafe } from '@/lib/auth';
import { NextRequest } from 'next/server';

/**
 * POST /api/orgs/extract/test
 * Test an extraction with provided sample text and description.
 * This is used in the test builder to quickly test extraction steps.
 */
export async function POST(req: NextRequest) {
  const token = await getBearerSafe();
  if (!token) return new Response('Unauthorized', { status: 401 });
  
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const me = await fetch(`${api}/me`, { headers: { Authorization: token } }).then(r => r.json());
  const orgId = me?.orgs?.[0]?.orgId;
  if (!orgId) return new Response('No org', { status: 400 });
  
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  
  const { variableName, description, scope, sampleText } = body;
  
  if (!description) {
    return Response.json({ success: false, error: 'description is required' }, { status: 400 });
  }
  
  if (!sampleText) {
    return Response.json({ success: false, error: 'sampleText is required' }, { status: 400 });
  }
  
  // Call the API to test extraction
  const res = await fetch(`${api}/orgs/${orgId}/extract/test`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ variableName, description, scope, sampleText }),
  });
  
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  
  return Response.json(data, { status: res.ok ? 200 : res.status });
}
