"use client";
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/base/Card';

export const dynamic = 'force-dynamic';

type Mode = 'pick' | 'interview' | 'wizard' | 'sop';

export default function NewPlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: outcomeTypeId } = use(params);
  const [mode, setMode] = useState<Mode>('pick');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Create a playbook</h1>
      <p className="text-sm text-gray-500 max-w-2xl">
        Pick how you want to teach Lamdis your process. All three paths produce the same playbook —
        you&apos;ll get a draft to confirm before activation.
      </p>

      {mode === 'pick' && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <button
              onClick={() => setMode('interview')}
              className="w-full p-6 text-left hover:bg-gray-50"
            >
              <div className="font-medium">Interview the agent</div>
              <div className="mt-1 text-sm text-gray-500">
                Chat with Lamdis. It asks structured questions and drafts the playbook as you talk.
              </div>
            </button>
          </Card>
          <Card>
            <button
              onClick={() => setMode('wizard')}
              className="w-full p-6 text-left hover:bg-gray-50"
            >
              <div className="font-medium">Fill the wizard</div>
              <div className="mt-1 text-sm text-gray-500">
                Step through a form: systems, approvers, documents, procedure.
              </div>
            </button>
          </Card>
          <Card>
            <button
              onClick={() => setMode('sop')}
              className="w-full p-6 text-left hover:bg-gray-50"
            >
              <div className="font-medium">Upload an SOP</div>
              <div className="mt-1 text-sm text-gray-500">
                Upload any file — PDF, DOCX, MD, image. Lamdis extracts the procedure for you.
              </div>
            </button>
          </Card>
        </div>
      )}

      {mode === 'interview' && <InterviewPanel outcomeTypeId={outcomeTypeId} onCancel={() => setMode('pick')} />}
      {mode === 'wizard' && <WizardPanel outcomeTypeId={outcomeTypeId} onCancel={() => setMode('pick')} />}
      {mode === 'sop' && <SopPanel outcomeTypeId={outcomeTypeId} onCancel={() => setMode('pick')} />}
    </div>
  );
}

function InterviewPanel({ outcomeTypeId, onCancel }: { outcomeTypeId: string; onCancel: () => void }) {
  const router = useRouter();
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!input.trim() || busy) return;
    const userMsg = { role: 'user' as const, content: input };
    const next = [...history, userMsg];
    setHistory(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/orgs/playbooks/draft/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outcomeTypeId,
          outcomeTypeName: 'Outcome',
          history: next,
          userMessage: input,
        }),
      });
      const data = await res.json();
      setHistory((h) => [...h, { role: 'assistant', content: data.reply ?? '' }]);
      if (data.draft?.playbookId) {
        router.push(`/dashboard/library/objectives/${outcomeTypeId}/playbook/${data.draft.playbookId}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {history.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <span className="inline-block max-w-prose rounded bg-gray-100 px-3 py-2 text-sm">{m.content}</span>
            </div>
          ))}
          {history.length === 0 && (
            <div className="text-sm text-gray-500">Tell the agent what process you&apos;re configuring. It will ask follow-up questions.</div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type your message…"
            className="flex-1 rounded border px-3 py-2 text-sm"
            disabled={busy}
          />
          <button onClick={send} disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Send
          </button>
          <button onClick={onCancel} className="rounded border px-3 py-2 text-sm">Cancel</button>
        </div>
      </div>
    </Card>
  );
}

function WizardPanel({ outcomeTypeId, onCancel }: { outcomeTypeId: string; onCancel: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [steps, setSteps] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const stepLines = steps.split('\n').map((s) => s.trim()).filter(Boolean);
      const payload = {
        outcomeTypeId,
        name,
        steps: stepLines.map((title, i) => ({ sequence: i + 1, title })),
        systems: [],
        approvers: [],
        documents: [],
      };
      const res = await fetch('/api/orgs/playbooks/draft/wizard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      router.push(`/dashboard/library/objectives/${outcomeTypeId}/playbook/${data.playbookId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div>
          <label className="block text-sm font-medium">Playbook name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium">Procedure steps (one per line)</label>
          <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={8} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-gray-500">
            This minimal wizard captures the procedure outline. Add systems/approvers/documents on the playbook detail page after creation.
          </p>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex gap-2">
          <button onClick={submit} disabled={busy || !name || !steps} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Create draft
          </button>
          <button onClick={onCancel} className="rounded border px-3 py-2 text-sm">Cancel</button>
        </div>
      </div>
    </Card>
  );
}

function SopPanel({ outcomeTypeId, onCancel }: { outcomeTypeId: string; onCancel: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // Best-effort text extraction in the browser. Binary files (PDF, DOCX,
      // images) come through as raw text + a base64 attachment so the server
      // can hand them to a Bedrock vision/extraction pass.
      const text = await file.text().catch(() => '');
      const buf = await file.arrayBuffer();
      const rawBase64 = Buffer.from(buf).toString('base64');
      const res = await fetch('/api/orgs/playbooks/draft/sop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outcomeTypeId,
          outcomeTypeName: 'Outcome',
          fileName: file.name,
          extractedText: text || `[binary file ${file.name} — ${file.size} bytes]`,
          rawBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      router.push(`/dashboard/library/objectives/${outcomeTypeId}/playbook/${data.playbookId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="space-y-3 p-4">
        <div>
          <label className="block text-sm font-medium">SOP file (any format)</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex gap-2">
          <button onClick={submit} disabled={busy || !file} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Upload &amp; extract
          </button>
          <button onClick={onCancel} className="rounded border px-3 py-2 text-sm">Cancel</button>
        </div>
      </div>
    </Card>
  );
}
