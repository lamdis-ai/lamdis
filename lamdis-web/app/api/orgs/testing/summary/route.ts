import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Suite = { _id: string; id?: string; name?: string };
type Run = { _id: string; id?: string; suiteId?: string; status?: string; createdAt?: string; finishedAt?: string; totals?: any; judge?: any; connectionKey?: string };

export async function GET() {
  const token = await getBearerSafe();
  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const me = await fetch(`${api}/me`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json());
    const orgId = me?.orgs?.[0]?.orgId;
    if (!orgId) return NextResponse.json({ suites: [], runsRecent: [], totals: {}, byAssistant: [] }, { status: 200 });

    const suites: Suite[] = await fetch(`${api}/orgs/${orgId}/suites`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]);
    const suiteList = Array.isArray(suites) ? suites : [];

    // Fetch recent runs and test counts per suite
    const perSuite = await Promise.all(suiteList.map(async (s: any) => {
      const sid = String(s._id || s.id);
      try {
        const [runsRes, testsRes] = await Promise.all([
          fetch(`${api}/orgs/${orgId}/suites/${sid}/runs?limit=50`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]),
          fetch(`${api}/orgs/${orgId}/suites/${sid}/tests`, { headers: { Authorization: token }, cache: 'no-store' }).then(r=>r.json()).catch(()=>[]),
        ]);
        const runs: Run[] = Array.isArray(runsRes) ? runsRes : [];
        const tests: any[] = Array.isArray(testsRes) ? testsRes : [];
        return { suite: { id: sid, name: s.name || 'Suite' }, runs, testsCount: tests.length };
      } catch {
        return { suite: { id: sid, name: s.name || 'Suite' }, runs: [], testsCount: 0 };
      }
    }));

    // Combine and sort runs
    const allRuns: any[] = perSuite.flatMap(x => x.runs.map(r => ({ ...r, suiteId: r.suiteId || x.suite.id })));
    allRuns.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const runsRecent = allRuns.slice(0, 25);

    // Stats
    let passed = 0, failed = 0, partial = 0, running = 0, queued = 0;
    const dayAgo = Date.now() - 24*60*60*1000;
    let last24h = 0;
    for (const r of allRuns) {
      const st = String(r.status || '').toLowerCase();
      if (st === 'passed') passed++; else if (st === 'failed') failed++; else if (st === 'partial') partial++; else if (st === 'running') running++; else if (st === 'queued') queued++;
      const ct = new Date(r.createdAt || 0).getTime();
      if (ct >= dayAgo) last24h++;
    }
    const passRate = (passed / Math.max(1, passed + failed + partial));

    // Group stats by assistant (connectionKey)
    const byAssistantMap: Record<string, { passed: number; failed: number; partial: number; total: number; lastRun?: string }> = {};
    for (const r of allRuns) {
      const key = r.connectionKey || 'unknown';
      if (!byAssistantMap[key]) byAssistantMap[key] = { passed: 0, failed: 0, partial: 0, total: 0 };
      byAssistantMap[key].total++;
      const st = String(r.status || '').toLowerCase();
      if (st === 'passed') byAssistantMap[key].passed++;
      else if (st === 'failed') byAssistantMap[key].failed++;
      else if (st === 'partial') byAssistantMap[key].partial++;
      if (!byAssistantMap[key].lastRun || new Date(r.createdAt || 0) > new Date(byAssistantMap[key].lastRun || 0)) {
        byAssistantMap[key].lastRun = r.createdAt;
      }
    }
    const byAssistant = Object.entries(byAssistantMap)
      .filter(([k]) => k !== 'unknown')
      .map(([key, stats]) => ({
        assistantKey: key,
        ...stats,
        passRate: stats.passed / Math.max(1, stats.passed + stats.failed + stats.partial),
      }))
      .sort((a, b) => b.total - a.total);

    const suiteSummaries = perSuite.map(x => {
      const runs = x.runs as any[];
      const total = runs.length;
      const fail = runs.filter(r => String(r.status).toLowerCase()==='failed').length;
      const pass = runs.filter(r => String(r.status).toLowerCase()==='passed').length;
      const rate = pass / Math.max(1, pass+fail);
      const lastRunAt = runs[0]?.createdAt || null;
      return { id: x.suite.id, name: x.suite.name, testsCount: x.testsCount, totalRuns: total, pass, fail, passRate: rate, lastRunAt };
    });

    return NextResponse.json({ suites: suiteSummaries, runsRecent, totals: { passed, failed, partial, running, queued, last24h, passRate }, byAssistant }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
