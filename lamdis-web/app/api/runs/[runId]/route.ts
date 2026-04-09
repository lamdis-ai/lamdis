import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const token = await getBearerSafe();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const resp = await fetch(`${api}/runs/${encodeURIComponent(runId)}`, { headers: { Authorization: token }, cache: 'no-store' });
    const txt = await resp.text();
    let data: any;
    try { data = JSON.parse(txt); } catch { return NextResponse.json({ error: txt }, { status: resp.status }); }

    // Enrich with test friendly names when possible
    try {
      const suiteId = String(data?.suiteId || '') || '';
      if (suiteId) {
        const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
        const orgId = me?.orgs?.[0]?.orgId || '';
        if (orgId) {
          const tests = await fetch(`${api}/orgs/${orgId}/suites/${encodeURIComponent(suiteId)}/tests`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
          if (Array.isArray(tests)) {
            const nameMap = tests.reduce<Record<string,string>>((acc, t:any)=>{ const id = String(t?._id || t?.id || ''); if (id) acc[id] = String(t?.name || t?.title || ''); return acc; }, {});
            if (Array.isArray(data?.items)) {
              data.items = data.items.map((it:any)=> ({ ...it, testName: nameMap[String(it?.testId || '')] }))
            }
          }
        }
      }
    } catch {}

    return NextResponse.json(data, { status: resp.status });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
