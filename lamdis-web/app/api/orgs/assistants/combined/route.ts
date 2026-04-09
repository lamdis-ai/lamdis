import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json([], { status: 200 });
    const [aRes, mRes] = await Promise.all([
      fetch(`${api}/orgs/${orgId}/assistants`, { headers: { Authorization: token }, cache: 'no-store' }),
      fetch(`${api}/orgs/${orgId}/mock-assistants`, { headers: { Authorization: token }, cache: 'no-store' })
    ]);
    const a = await aRes.json().catch(()=>({ assistants: [] }));
    const m = await mRes.json().catch(()=>([]));
    const assistants = Array.isArray(a?.assistants) ? a.assistants : [];
    const mocks = Array.isArray(m) ? m : [];
    const combined = [
      ...assistants.map((x:any)=>({ _id: x._id, kind: 'assistant' as const, key: x.key, name: x.name, connectionKey: x.connectionKey, requestId: x.requestId, version: x.version })),
      ...mocks.map((x:any)=>({ _id: x._id, kind: 'mock' as const, name: x.name, persona: x.persona, key: `mock-${String(x._id).slice(-4)}`, connectionKey: `mock_${x._id}` }))
    ];
    return NextResponse.json(combined, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
