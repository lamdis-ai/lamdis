"use client";
import { useState } from 'react';
import Link from 'next/link';
import Card from '@/components/base/Card';

export const dynamic = 'force-dynamic';

const EXAMPLES = [
  {
    label: 'Calculate risk score',
    code: `// Calculate a risk score from input data
const { amount, customerAge, previousClaims } = input;

const baseScore = amount > 10000 ? 0.7 : amount > 5000 ? 0.5 : 0.3;
const ageModifier = customerAge < 25 ? 0.2 : customerAge > 65 ? 0.15 : 0;
const claimsModifier = (previousClaims || 0) * 0.1;

const riskScore = Math.min(1, baseScore + ageModifier + claimsModifier);
const riskLevel = riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low';

return { kind: 'data', value: { riskScore, riskLevel, factors: { baseScore, ageModifier, claimsModifier } } };`,
    input: '{ "amount": 8500, "customerAge": 23, "previousClaims": 2 }',
  },
  {
    label: 'Transform data',
    code: `// Transform an array of records
const records = input.records || [];

const summary = {
  total: records.length,
  byStatus: {},
  totalAmount: 0,
};

for (const r of records) {
  summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
  summary.totalAmount += r.amount || 0;
}

return { kind: 'data', value: summary };`,
    input: '{ "records": [{ "status": "open", "amount": 100 }, { "status": "closed", "amount": 250 }, { "status": "open", "amount": 75 }] }',
  },
  {
    label: 'Fetch external API',
    code: `// Fetch data from an API (requires netAllow permission)
const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
const data = await res.json();

return { kind: 'data', value: { fetched: data, timestamp: new Date().toISOString() } };`,
    input: '{}',
  },
];

export default function CodePage() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [inputText, setInputText] = useState(EXAMPLES[0].input);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/orgs/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          input: JSON.parse(inputText || '{}'),
          netAllow: ['jsonplaceholder.typicode.com'],
          timeoutMs: 10000,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ success: false, error: err?.message || 'Failed to execute' });
    }
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Link href="/dashboard" className="hover:text-slate-200">Dashboard</Link>
          <span>/</span>
          <span className="text-slate-300">Code Sandbox</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Code Sandbox</h1>
        <p className="text-sm text-slate-400 mt-1">
          Write and test JavaScript code in a secure sandbox. Use this for data transformations, calculations, or API calls that objectives can execute as actions.
        </p>
      </div>

      {/* Examples */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map(ex => (
          <button
            key={ex.label}
            onClick={() => { setCode(ex.code); setInputText(ex.input); setResult(null); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Code editor */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400">Code (JavaScript)</label>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            rows={16}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 resize-y"
            placeholder="// Your JavaScript code here..."
          />
          <label className="text-xs font-medium text-slate-400">Input (JSON)</label>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 resize-y"
            placeholder='{ "key": "value" }'
          />
          <button
            onClick={run}
            disabled={running || !code.trim()}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {running ? 'Running...' : 'Run Code'}
          </button>
        </div>

        {/* Result */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400">Result</label>
          {result ? (
            <Card>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${result.success ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30' : 'bg-rose-900/30 text-rose-400 border border-rose-700/30'}`}>
                    {result.success ? 'Success' : 'Error'}
                  </span>
                </div>
                {result.output !== undefined && (
                  <div>
                    <label className="text-[11px] text-slate-500 uppercase tracking-wider">Output</label>
                    <pre className="mt-1 text-xs text-slate-300 bg-slate-900/50 rounded p-3 overflow-x-auto max-h-64">{JSON.stringify(result.output, null, 2)}</pre>
                  </div>
                )}
                {result.error && (
                  <div>
                    <label className="text-[11px] text-slate-500 uppercase tracking-wider">Error</label>
                    <pre className="mt-1 text-xs text-rose-300 bg-rose-950/20 rounded p-3">{result.error}</pre>
                  </div>
                )}
                {result.logs?.length > 0 && (
                  <div>
                    <label className="text-[11px] text-slate-500 uppercase tracking-wider">Console Output</label>
                    <pre className="mt-1 text-xs text-slate-400 bg-slate-900/50 rounded p-3 overflow-x-auto">{result.logs.join('\n')}</pre>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="p-8 text-center text-sm text-slate-500">
                Run code to see results here
              </div>
            </Card>
          )}

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-3 mt-4">
            <p className="text-xs text-slate-400">
              <span className="font-medium text-slate-300">Sandbox environment:</span> Your code runs in an isolated VM with no filesystem access.
              Available: <code className="text-fuchsia-300">input</code> (your JSON input), <code className="text-fuchsia-300">fetch</code> (for allowed domains),
              <code className="text-fuchsia-300">console</code>, <code className="text-fuchsia-300">JSON</code>, <code className="text-fuchsia-300">Math</code>, <code className="text-fuchsia-300">Date</code>.
              Timeout: 10 seconds max.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
