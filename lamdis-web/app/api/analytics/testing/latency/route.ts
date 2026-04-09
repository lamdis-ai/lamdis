import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

type Suite = { _id: string; id?: string };
type Run = { _id: string; id?: string; createdAt?: string };

function startDateForRange(range: string): Date {
  const now = new Date();
  if (range.endsWith('d')) {
    const days = parseInt(range.slice(0, -1), 10) || 7;
    const d = new Date(now);
    d.setDate(now.getDate() - (days - 1));
    d.setHours(0,0,0,0);
    return d;
  }
  // default 7d
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
  const suiteId = req.nextUrl.searchParams.get('suiteId') || '';
  const assistantRaw = req.nextUrl.searchParams.get('assistant') || '';
  const assistantKey = assistantRaw.startsWith('conn:') ? assistantRaw.slice(5) : assistantRaw;
  const groupBy = (req.nextUrl.searchParams.get('groupBy') || 'none').toLowerCase();
  try {
    if (!orgId) {
      const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json());
      orgId = me?.orgs?.[0]?.orgId || '';
      if (!orgId) return NextResponse.json({ series: [], count: 0 }, { status: 200 });
    }

    // Fetch suites (or single suite if suiteId provided)
    let suites: Suite[] = [];
    if (suiteId) {
      suites = [{ _id: suiteId }];
    } else {
      suites = await fetch(`${api}/orgs/${orgId}/suites`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
    }
    const since = startDateForRange(range).getTime();

    // Gather runs across suites (limit per suite to 100)
    const allRuns: (Run & { suiteId?: string; connectionKey?: string })[] = [];
    for (const s of (Array.isArray(suites)?suites:[])) {
      const sid = encodeURIComponent(String(s._id || s.id));
      const runs: any[] = await fetch(`${api}/orgs/${orgId}/suites/${sid}/runs?limit=100`, { headers: { Authorization: bearer }, cache: 'no-store' })
        .then(r=>r.json()).catch(()=>[]);
      for (const r of (Array.isArray(runs)?runs:[])) {
        const ct = new Date(r.createdAt || 0).getTime();
        if (ct < since) continue;
        if (assistantKey && r?.connectionKey && String(r.connectionKey) !== assistantKey) continue;
        allRuns.push({ _id: r._id || r.id, createdAt: r.createdAt, suiteId: String(s._id || (s as any).id), connectionKey: r?.connectionKey ? String(r.connectionKey) : undefined });
      }
    }

    // Sort by createdAt desc and cap to 200 runs to bound cost
    allRuns.sort((a,b)=> new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
    const runsToFetch = allRuns.slice(0, 200);

    // Fetch run details and aggregate latency metrics
    const dayMap: Record<string, { avg: number[]; p50: number[]; p95: number[]; max: number[]; count: number } > = {};
    // For grouping
    const grouped: Record<string, Record<string, { avg: number[]; p50: number[]; p95: number[]; max: number[]; count: number }>> = {};
    for (const r of runsToFetch) {
      const rd = await fetch(`${api}/runs/${encodeURIComponent(String(r._id || r.id))}`, { headers: { Authorization: bearer }, cache: 'no-store' })
        .then(resp => resp.json()).catch(()=>null);
      if (!rd) continue;
      // Fallback assistantKey filter if not available in listing
      if (assistantKey && rd?.connectionKey && String(rd.connectionKey) !== assistantKey) continue;
      const day = (r.createdAt || '').slice(0,10);
      if (!day) continue;
      // Determine group key if grouping and only when not filtered on that dimension
      let gkey: string | null = null;
      if (groupBy === 'assistant' && !assistantKey) {
        const ck = String(rd?.connectionKey || r.connectionKey || '');
        if (ck) gkey = `conn:${ck}`;
      } else if (groupBy === 'suite' && !suiteId) {
        gkey = String(r.suiteId || '');
      }
      const items: any[] = Array.isArray(rd.items) ? rd.items : [];
      for (const it of items) {
        const t = it?.timings || {};
        if (!dayMap[day]) dayMap[day] = { avg: [], p50: [], p95: [], max: [], count: 0 };
        if (typeof t.avgMs === 'number' && isFinite(t.avgMs)) dayMap[day].avg.push(t.avgMs);
        if (typeof t.p50Ms === 'number' && isFinite(t.p50Ms)) dayMap[day].p50.push(t.p50Ms);
        if (typeof t.p95Ms === 'number' && isFinite(t.p95Ms)) dayMap[day].p95.push(t.p95Ms);
        if (typeof t.maxMs === 'number' && isFinite(t.maxMs)) dayMap[day].max.push(t.maxMs);
        dayMap[day].count += Array.isArray(t?.perTurnMs) ? t.perTurnMs.length : 0;
        if (gkey) {
          if (!grouped[gkey]) grouped[gkey] = {};
          if (!grouped[gkey][day]) grouped[gkey][day] = { avg: [], p50: [], p95: [], max: [], count: 0 };
          if (typeof t.avgMs === 'number' && isFinite(t.avgMs)) grouped[gkey][day].avg.push(t.avgMs);
          if (typeof t.p50Ms === 'number' && isFinite(t.p50Ms)) grouped[gkey][day].p50.push(t.p50Ms);
          if (typeof t.p95Ms === 'number' && isFinite(t.p95Ms)) grouped[gkey][day].p95.push(t.p95Ms);
          if (typeof t.maxMs === 'number' && isFinite(t.maxMs)) grouped[gkey][day].max.push(t.maxMs);
          grouped[gkey][day].count += Array.isArray(t?.perTurnMs) ? t.perTurnMs.length : 0;
        }
      }
    }

    // Build last N days series
    const days: string[] = (()=>{
      const out: string[] = [];
      const base = new Date(startDateForRange(range));
      const n = range.endsWith('d') ? (parseInt(range,10)||7) : 7;
      for (let i=0;i<n;i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        out.push(d.toISOString().slice(0,10));
      }
      return out;
    })();

    const series = days.map(d => {
      const m = dayMap[d] || { avg: [], p50: [], p95: [], max: [], count: 0 };
      const avgMs = m.avg.length ? (m.avg.reduce((a,b)=>a+b,0) / m.avg.length) : 0;
      const p50Ms = m.p50.length ? (m.p50.reduce((a,b)=>a+b,0) / m.p50.length) : 0;
      const p95Ms = m.p95.length ? (m.p95.reduce((a,b)=>a+b,0) / m.p95.length) : 0;
      const maxMs = m.max.length ? Math.max(...m.max) : 0;
      return { date: d, avgMs, p50Ms, p95Ms, maxMs };
    });

    const totalCount = Object.values(dayMap).reduce((acc, m)=> acc + m.count, 0);
    // If grouped, build groups series
    if ((groupBy === 'assistant' && !assistantKey) || (groupBy === 'suite' && !suiteId)) {
      const groups: Record<string, { label?: string; series: { date:string; avgMs:number; p50Ms:number; p95Ms:number; maxMs:number }[] }> = {};
      for (const [key, dm] of Object.entries(grouped)) {
        groups[key] = { series: days.map(d => {
          const m = dm[d] || { avg: [], p50: [], p95: [], max: [], count: 0 };
          const avgMs = m.avg.length ? (m.avg.reduce((a,b)=>a+b,0) / m.avg.length) : 0;
          const p50Ms = m.p50.length ? (m.p50.reduce((a,b)=>a+b,0) / m.p50.length) : 0;
          const p95Ms = m.p95.length ? (m.p95.reduce((a,b)=>a+b,0) / m.p95.length) : 0;
          const maxMs = m.max.length ? Math.max(...m.max) : 0;
          return { date: d, avgMs, p50Ms, p95Ms, maxMs };
        }) };
      }
      return NextResponse.json({ days, groups, series, count: totalCount }, { status: 200 });
    }
    return NextResponse.json({ series, count: totalCount }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed', series: [], count: 0 }, { status: 500 });
  }
}
