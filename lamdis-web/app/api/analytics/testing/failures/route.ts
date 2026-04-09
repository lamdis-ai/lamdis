import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

function startDateForRange(range: string): Date {
  const now = new Date();
  if (range.endsWith('d')) {
    const days = parseInt(range.slice(0, -1), 10) || 7;
    const d = new Date(now);
    d.setDate(now.getDate() - (days - 1));
    d.setHours(0,0,0,0);
    return d;
  }
  const d = new Date(now);
  d.setDate(now.getDate() - 6);
  d.setHours(0,0,0,0);
  return d;
}

export async function GET(req: NextRequest) {
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let orgId = req.nextUrl.searchParams.get('orgId') || '';
  const range = req.nextUrl.searchParams.get('range') || '7d';
  try {
    if (!orgId) {
      const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json());
      orgId = me?.orgs?.[0]?.orgId || '';
      if (!orgId) return NextResponse.json({ rows: [], total: 0 }, { status: 200 });
    }

    const suiteId = req.nextUrl.searchParams.get('suiteId') || '';
    let suites = [] as any[];
    if (suiteId) {
      const one = await fetch(`${api}/orgs/${orgId}/suites/${encodeURIComponent(suiteId)}`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
      suites = one ? [one] : [];
      // Attach id if missing
      if (suites[0] && !suites[0]._id && !suites[0].id) suites[0]._id = suiteId;
    } else {
      suites = await fetch(`${api}/orgs/${orgId}/suites`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
    }
    const since = startDateForRange(range).getTime();

  type Row = { date: string; runId: string; suiteId: string; suiteName?: string; assistantKey?: string; testId: string; testName?: string; status?: string; judgeScore?: number; avgMs?: number; recovered?: boolean };
    const rows: Row[] = [];

    for (const s of (Array.isArray(suites)?suites:[])) {
      const sid = String(s?._id || s?.id || ''); if (!sid) continue;
      // map tests for friendly names
      let testNameMap: Record<string, string> = {};
      try {
        const tests = await fetch(`${api}/orgs/${orgId}/suites/${encodeURIComponent(sid)}/tests`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
        if (Array.isArray(tests)) {
          testNameMap = tests.reduce<Record<string,string>>((acc, t:any)=>{ const id = String(t?._id || t?.id || ''); if (id) acc[id] = String(t?.name || t?.title || ''); return acc; }, {});
        }
      } catch {}

      let runs: any[] = await fetch(`${api}/orgs/${orgId}/suites/${encodeURIComponent(sid)}/runs?limit=100`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
      runs = Array.isArray(runs) ? runs : [];
      // Sort by createdAt desc so we can mark recovered when a later pass exists
      runs.sort((a:any,b:any)=> new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
      const passSeen = new Set<string>(); // passes from STRICTLY later runs
      for (const r of runs) {
        const ct = new Date(r.createdAt || 0).getTime();
        if (ct < since) continue;
        const runId = String(r._id || r.id || ''); if (!runId) continue;
        const detail = await fetch(`${api}/runs/${encodeURIComponent(runId)}`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(res=>res.json()).catch(()=>null);
        if (!detail || !Array.isArray(detail.items)) continue;
        const assistantKey = detail?.connectionKey ? `conn:${String(detail.connectionKey)}` : undefined;
        const day = String((r.createdAt || '').slice(0,10));
        // Collect passes within THIS run separately so we don't mark same-run failures as recovered
        const passesThisRun = new Set<string>();
        for (const it of detail.items as any[]) {
          const status = String(it?.status || '').toLowerCase();
          const testId = String(it?.testId || ''); if (!testId) continue;
          const key = `${sid}|${assistantKey||''}|${testId}`;
          if (status === 'passed') { passesThisRun.add(key); continue; }
          let judgeScore: number | undefined = undefined;
          if (Array.isArray(it?.assertions)) {
            const sem = it.assertions.filter((a:any)=> a?.type==='semantic' && typeof a?.details?.score==='number').map((a:any)=> Number(a.details.score));
            if (sem.length){ judgeScore = sem.reduce((x:number,y:number)=>x+y,0)/sem.length; }
          }
          const t = it?.timings || {};
          const avgMs = typeof t.avgMs==='number' && isFinite(t.avgMs) ? t.avgMs : undefined;
          const recovered = passSeen.has(key);
          rows.push({ date: day, runId, suiteId: sid, suiteName: s?.name || s?.title, assistantKey, testId, testName: testNameMap[testId], status, judgeScore, avgMs, recovered });
        }
        // After processing failures for this run, merge passes from this run
        for (const k of passesThisRun) passSeen.add(k);
      }
    }

    rows.sort((a,b)=> a.date < b.date ? 1 : (a.date > b.date ? -1 : 0));
    return NextResponse.json({ rows, total: rows.length }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed', rows: [], total: 0 }, { status: 500 });
  }
}
