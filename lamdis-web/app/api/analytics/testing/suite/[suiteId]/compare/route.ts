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

function extractEnvKey(run: any): string {
  // Normalize a run target into a comparable key used by UI selections
  // Connections use `conn:KEY`; suite environments use the environment _id
  const t = run?.target || run?.env || run?.environment || {};
  const connKey = run?.connectionKey || run?.connection?.key || t?.connectionKey || t?.key;
  const envId = run?.envId || run?.environmentId || t?.envId || t?._id || t?.id;
  if (connKey) return `conn:${String(connKey)}`;
  if (envId) return String(envId);
  return 'unknown';
}

export async function GET(req: NextRequest, props: { params: Promise<{ suiteId: string }> }) {
  const params = await props.params;
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const bearer = await getBearerSafe();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let orgId = req.nextUrl.searchParams.get('orgId') || '';
  const range = req.nextUrl.searchParams.get('range') || '7d';
  const envsParam = (req.nextUrl.searchParams.get('envs') || '').trim();
  const filterEnvKeys = envsParam ? envsParam.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const mode = req.nextUrl.searchParams.get('mode') || '';
  try {
    if (!orgId) {
      const me = await fetch(`${api}/me`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json());
      orgId = me?.orgs?.[0]?.orgId || '';
      if (!orgId) return NextResponse.json({ series: {}, days: [], totals: {} }, { status: 200 });
    }

    // Fetch recent runs for this suite
    const since = startDateForRange(range).getTime();
    const runsResp = await fetch(`${api}/orgs/${orgId}/suites/${encodeURIComponent(params.suiteId)}/runs?limit=200`, { headers: { Authorization: bearer }, cache: 'no-store' });
    const runsList: any[] = await runsResp.json().catch(()=>[]);
    const runs = (Array.isArray(runsList)?runsList:[]).filter(r => new Date(r.createdAt||0).getTime() >= since);

    // Sort desc by createdAt and cap to 200
    runs.sort((a,b)=> new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
    const limited = runs.slice(0, 200);

  // Prepare day buckets per envKey
    const base = startDateForRange(range);
    const n = range.endsWith('d') ? (parseInt(range,10)||7) : 7;
    const days: string[] = []; // ISO yyyy-mm-dd
    for (let i=0;i<n;i++) { const d = new Date(base); d.setDate(base.getDate()+i); days.push(d.toISOString().slice(0,10)); }

    type DayAgg = { count: number; pass: number; judge: number[]; latAvg: number[]; latP95: number[] };
    const perEnv: Record<string, Record<string, DayAgg>> = {};

    for (const r of limited) {
      const day = String((r.createdAt||'').slice(0,10));
      if (!day) continue;
      const key = extractEnvKey(r);
      if (filterEnvKeys.length>0 && !filterEnvKeys.includes(key)) continue;
      if (!perEnv[key]) perEnv[key] = {};
      if (!perEnv[key][day]) perEnv[key][day] = { count: 0, pass: 0, judge: [], latAvg: [], latP95: [] };
      const bucket = perEnv[key][day];
      bucket.count += 1;
      const status = String(r.status || '').toLowerCase();
      if (status === 'passed') bucket.pass += 1;
      const jAvg = r?.judge?.avgScore;
      if (typeof jAvg === 'number' && isFinite(jAvg)) bucket.judge.push(jAvg);

      // Fetch run details to aggregate latency per run
      const rd = await fetch(`${api}/runs/${encodeURIComponent(String(r._id || r.id))}`, { headers: { Authorization: bearer }, cache: 'no-store' })
        .then(resp=>resp.json()).catch(()=>null);
      if (rd && Array.isArray(rd.items)) {
        const items = rd.items as any[];
        const itemAvg: number[] = [];
        const itemP95: number[] = [];
        for (const it of items) {
          const t = it?.timings || {};
          if (typeof t.avgMs === 'number' && isFinite(t.avgMs)) itemAvg.push(t.avgMs);
          if (typeof t.p95Ms === 'number' && isFinite(t.p95Ms)) itemP95.push(t.p95Ms);
        }
        const avg = itemAvg.length ? (itemAvg.reduce((a,b)=>a+b,0)/itemAvg.length) : undefined;
        const p95 = itemP95.length ? (itemP95.reduce((a,b)=>a+b,0)/itemP95.length) : undefined;
        if (avg != null) bucket.latAvg.push(avg);
        if (p95 != null) bucket.latP95.push(p95);
      }
    }

    // Build aligned series for each envKey
    const series: Record<string, { date: string; passRate: number; judgeAvg: number; latAvgMs: number; latP95Ms: number; count: number }[]> = {};
    for (const [envKey, dayMap] of Object.entries(perEnv)) {
      series[envKey] = days.map(d => {
        const m = dayMap[d] || { count:0, pass:0, judge:[], latAvg:[], latP95:[] };
        const passRate = m.count>0 ? m.pass / m.count : 0;
        const judgeAvg = m.judge.length ? (m.judge.reduce((a,b)=>a+b,0)/m.judge.length) : 0;
        const latAvgMs = m.latAvg.length ? (m.latAvg.reduce((a,b)=>a+b,0)/m.latAvg.length) : 0;
        const latP95Ms = m.latP95.length ? (m.latP95.reduce((a,b)=>a+b,0)/m.latP95.length) : 0;
        return { date: d, passRate, judgeAvg, latAvgMs, latP95Ms, count: m.count };
      });
    }

    // Optionally build a latest-run side-by-side comparison for two envs
    let latestComparison: any = null;
    if ((mode === 'latest' || !mode) && filterEnvKeys.length >= 2) {
      // pick the most recent completed run per env key
      const byEnv: Record<string, any[]> = {};
      for (const r of limited) {
        const k = extractEnvKey(r);
        if (!filterEnvKeys.includes(k)) continue;
        const s = String(r.status||'');
        if (s === 'queued' || s === 'running') continue;
        if (!byEnv[k]) byEnv[k] = [];
        byEnv[k].push(r);
      }
      const chosen = filterEnvKeys.slice(0,2).map(k => (byEnv[k]||[])[0]).filter(Boolean) as any[];
      if (chosen.length === 2) {
        const [a,b] = chosen;
        const [ad, bd] = await Promise.all([
          fetch(`${api}/runs/${encodeURIComponent(String(a._id || a.id))}`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json()).catch(()=>null),
          fetch(`${api}/runs/${encodeURIComponent(String(b._id || b.id))}`, { headers: { Authorization: bearer }, cache: 'no-store' }).then(r=>r.json()).catch(()=>null),
        ]);
        function kpis(rd:any){
          const totals = rd?.totals||{}; const p=Number(totals.passed||0), f=Number(totals.failed||0), s=Number(totals.skipped||0);
          const all = p+f+s; const passRate = all? p/all: 0;
          const judgeAvg = typeof rd?.judge?.avgScore==='number'? rd.judge.avgScore: undefined;
          let latAvgMs=0, latP95Ms=0, cnt=0;
          if (Array.isArray(rd?.items)) {
            for (const it of rd.items){ const t = it?.timings||{}; if (typeof t.avgMs==='number'){latAvgMs+=t.avgMs; cnt++;} if (typeof t.p95Ms==='number'){latP95Ms+=t.p95Ms;} }
            if (cnt){ latAvgMs = latAvgMs/cnt; latP95Ms = latP95Ms/cnt; }
          }
          return { runId: String(rd?._id||''), status: rd?.status, createdAt: rd?.createdAt, totals: { passed:p, failed:f, skipped:s }, passRate, judgeAvg, latAvgMs: isFinite(latAvgMs)? latAvgMs: undefined, latP95Ms: isFinite(latP95Ms)? latP95Ms: undefined };
        }
        function perTest(rd:any){
          const map: Record<string, any> = {};
          if (Array.isArray(rd?.items)) {
            for (const it of rd.items){
              const testId = String(it?.testId||''); if (!testId) continue;
              const t = it?.timings||{};
              // Try to find a semantic judge score on this item
              let judgeScore: number | undefined = undefined;
              if (Array.isArray(it?.assertions)){
                const sem = it.assertions.filter((a:any)=> a?.type==='semantic' && typeof a?.details?.score==='number').map((a:any)=> Number(a.details.score));
                if (sem.length){ judgeScore = sem.reduce((x:number,y:number)=>x+y,0)/sem.length; }
              }
              map[testId] = { status: it?.status, avgMs: typeof t.avgMs==='number'? t.avgMs: undefined, p95Ms: typeof t.p95Ms==='number'? t.p95Ms: undefined, judgeScore };
            }
          }
          return map;
        }
        const aKey = extractEnvKey(a); const bKey = extractEnvKey(b);
        const aKpis = kpis(ad); const bKpis = kpis(bd);
        const aTests = perTest(ad); const bTests = perTest(bd);
        const testIds = Array.from(new Set([...Object.keys(aTests), ...Object.keys(bTests)]));

        // Enrich with friendly test names
        let nameMap: Record<string, string> = {};
        try {
          const testsResp = await fetch(`${api}/orgs/${orgId}/suites/${encodeURIComponent(params.suiteId)}/tests`, { headers: { Authorization: bearer }, cache: 'no-store' });
          const testsArr: any[] = await testsResp.json().catch(()=>[]);
          if (Array.isArray(testsArr)) {
            nameMap = testsArr.reduce<Record<string,string>>((acc, t:any)=>{
              const id = String(t?._id || t?.id || '');
              if (id) acc[id] = String(t?.name || t?.title || '');
              return acc;
            }, {});
          }
        } catch {}

        const tests = testIds.map(tid => ({ testId: tid, testName: nameMap[tid] || undefined, [aKey]: aTests[tid]||null, [bKey]: bTests[tid]||null }));
        latestComparison = { envKeys: [aKey, bKey], runs: { [aKey]: aKpis, [bKey]: bKpis }, tests };
      }
    }

    return NextResponse.json({ series, days, latestComparison }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed', series: {}, days: [], latestComparison: null }, { status: 500 });
  }
}
