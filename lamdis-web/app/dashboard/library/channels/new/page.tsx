"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const STEPS = [
  { num: 1, label: 'Basics' },
  { num: 2, label: 'Authentication' },
  { num: 3, label: 'Objectives' },
  { num: 4, label: 'Permissions' },
  { num: 5, label: 'Multimodal' },
  { num: 6, label: 'Deploy' },
];

const AUTH_METHODS: Record<string, Array<{ value: string; label: string; description: string }>> = {
  customer: [
    { value: 'email_verification', label: 'Email Verification', description: 'User verifies their email before chatting. Secure and traceable.' },
    { value: 'phone_otp', label: 'Phone OTP', description: 'One-time passcode sent via SMS. Good for mobile-first audiences.' },
    { value: 'anonymous_rate_limited', label: 'Anonymous (Rate Limited)', description: 'No auth required. Rate-limited by IP. Lowest friction but least secure.' },
    { value: 'custom_jwt', label: 'Custom JWT', description: 'Your app authenticates users and passes a signed JWT. Most flexible.' },
  ],
  employee: [
    { value: 'sso_oidc', label: 'SSO / OIDC', description: 'Sign in via your organization\'s identity provider (Okta, Azure AD, etc.).' },
    { value: 'org_membership', label: 'Org Membership', description: 'Must be a member of this Lamdis organization to access.' },
  ],
  system: [
    { value: 'api_key', label: 'API Key', description: 'Authenticate with an API key in the request header.' },
    { value: 'webhook_signature', label: 'Webhook Signature', description: 'Verify requests using HMAC signature validation.' },
  ],
};

const PERMISSIONS_MAP: Record<string, Array<{ value: string; label: string; description: string; defaultOn: boolean }>> = {
  customer: [
    { value: 'provide_evidence', label: 'Submit Evidence', description: 'Send text, images, files as evidence for objectives', defaultOn: true },
    { value: 'view_own_status', label: 'View Own Status', description: 'See the status of their own objective instances', defaultOn: true },
    { value: 'request_action', label: 'Request Actions', description: 'Ask the system to perform actions on their behalf', defaultOn: false },
    { value: 'view_decisions', label: 'View Decisions', description: 'See why automated decisions were made about their case', defaultOn: false },
  ],
  employee: [
    { value: 'provide_evidence', label: 'Submit Evidence', description: 'Add evidence to any objective instance', defaultOn: true },
    { value: 'view_own_status', label: 'View All Status', description: 'See all objective instances and their status', defaultOn: true },
    { value: 'request_action', label: 'Request Actions', description: 'Trigger actions and workflows', defaultOn: true },
    { value: 'view_decisions', label: 'View Decisions', description: 'See full decision reasoning and proof chains', defaultOn: true },
    { value: 'approve_actions', label: 'Approve Actions', description: 'Approve or reject proposed automated actions', defaultOn: true },
    { value: 'override_decisions', label: 'Override Decisions', description: 'Override automated decisions with manual judgment', defaultOn: false },
  ],
  system: [
    { value: 'provide_evidence', label: 'Submit Evidence', description: 'Ingest events and evidence data', defaultOn: true },
    { value: 'request_action', label: 'Trigger Actions', description: 'Execute actions via API', defaultOn: true },
  ],
};

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default function NewChannelPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    description: '',
    channelType: 'customer' as 'customer' | 'employee' | 'system',
  });
  const [authMethod, setAuthMethod] = useState('email_verification');
  const [permissions, setPermissions] = useState<string[]>(['provide_evidence', 'view_own_status']);
  const [multimodal, setMultimodal] = useState({ images: true, audio: false, video: false, files: true });
  const [saving, setSaving] = useState(false);
  const [createdChannel, setCreatedChannel] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/orgs/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          channelType: form.channelType,
          authMethod,
          permissions,
          multimodal,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to create channel');
      }
      const created = await res.json();
      setCreatedChannel(created);
      setStep(6);
    } catch (err: any) {
      setError(err?.message || 'Failed to create channel');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (perm: string) => {
    setPermissions(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  // Reset auth/permissions when channel type changes
  const setChannelType = (type: 'customer' | 'employee' | 'system') => {
    setForm(f => ({ ...f, channelType: type }));
    setAuthMethod(AUTH_METHODS[type][0].value);
    const defaults = PERMISSIONS_MAP[type].filter(p => p.defaultOn).map(p => p.value);
    setPermissions(defaults);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Link href="/dashboard/library/channels" className="hover:text-slate-200">Channels</Link>
          <span>/</span>
          <span className="text-slate-300">New</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">New Channel</h1>
        <p className="text-sm text-slate-400 mt-1">Configure a chat endpoint for customers, employees, or automated systems.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map(s => (
          <button
            key={s.num}
            onClick={() => s.num <= step && setStep(s.num)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              s.num === step ? 'bg-fuchsia-600 text-white' :
              s.num < step ? 'bg-fuchsia-600/20 border border-fuchsia-500/30 text-fuchsia-300' :
              'bg-slate-800/50 text-slate-500 border border-slate-700'
            }`}
          >
            {s.num}. {s.label}
          </button>
        ))}
      </div>

      {/* Step 1: Basics */}
      {step === 1 && (
        <Card>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Channel Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Customer Support Chat" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
              <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What this channel is used for" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-3">Channel Type</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'customer', label: 'Customer-facing', desc: 'External users (customers, claimants, applicants). Strict identity boundaries — they can only see and act on their own data.' },
                  { value: 'employee', label: 'Employee-facing', desc: 'Internal team members. Can approve actions, view all data, and override decisions. Authenticated via SSO.' },
                  { value: 'system', label: 'System / API', desc: 'Automated ingestion from other systems. API key or webhook authentication. No user interaction.' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setChannelType(opt.value as any)}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      form.channelType === opt.value
                        ? 'border-fuchsia-500/50 bg-fuchsia-950/20'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-200">{opt.label}</div>
                    <p className="text-[11px] text-slate-500 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Authentication */}
      {step === 2 && (
        <Card>
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Authentication Method</h3>
              <p className="text-xs text-slate-500 mb-4">How users will identify themselves when using this channel</p>
            </div>
            <div className="space-y-2">
              {AUTH_METHODS[form.channelType].map(method => (
                <button
                  key={method.value}
                  onClick={() => setAuthMethod(method.value)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    authMethod === method.value
                      ? 'border-fuchsia-500/50 bg-fuchsia-950/20'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-200">{method.label}</div>
                  <p className="text-xs text-slate-500 mt-0.5">{method.description}</p>
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-amber-700/30 bg-amber-950/10 p-3 mt-4">
              <p className="text-xs text-amber-300">
                Security: Each conversation session is cryptographically bound to one identity.
                {form.channelType === 'customer' && ' Customer-submitted evidence cannot trigger autonomous actions on high-risk objectives without employee review.'}
                {form.channelType === 'employee' && ' Employee actions are fully audited with identity attribution.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Linked Objectives */}
      {step === 3 && (
        <Card>
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Linked Objectives</h3>
              <p className="text-xs text-slate-500 mb-4">
                Which objectives should this channel serve? The AI will analyze incoming messages and route them to the appropriate objective based on content.
              </p>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-4 space-y-3">
              <p className="text-xs text-slate-400">
                Objective linking will be available after saving. The system uses AI to automatically route incoming conversations to the correct objective based on:
              </p>
              <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
                <li>Message content analysis (text, keywords, intent)</li>
                <li>Image/document analysis (if multimodal is enabled)</li>
                <li>Customer identification (face matching, account lookup)</li>
                <li>Historical conversation context</li>
                <li>Active objective instance matching</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Step 4: Permissions */}
      {step === 4 && (
        <Card>
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Permissions</h3>
              <p className="text-xs text-slate-500 mb-4">What can users on this channel do?</p>
            </div>
            <div className="space-y-2">
              {PERMISSIONS_MAP[form.channelType].map(perm => (
                <label
                  key={perm.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    permissions.includes(perm.value)
                      ? 'border-fuchsia-500/40 bg-fuchsia-950/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm.value)}
                    onChange={() => togglePermission(perm.value)}
                    className="mt-0.5 rounded border-slate-600 bg-slate-800 text-fuchsia-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-200">{perm.label}</div>
                    <p className="text-xs text-slate-500 mt-0.5">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Step 5: Multimodal */}
      {step === 5 && (
        <Card>
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Multimodal Input</h3>
              <p className="text-xs text-slate-500 mb-4">What types of media can users send through this channel?</p>
            </div>
            <div className="space-y-2">
              {[
                { key: 'images' as const, label: 'Images', desc: 'Photos, screenshots, documents. Analyzed by AI for evidence extraction, face matching, and content understanding.' },
                { key: 'audio' as const, label: 'Audio', desc: 'Voice recordings, phone calls. Transcribed and analyzed for evidence. Supports speaker identification.' },
                { key: 'video' as const, label: 'Video', desc: 'Video recordings, screen captures. Frame extraction + audio transcription for comprehensive analysis.' },
                { key: 'files' as const, label: 'Files', desc: 'PDFs, CSVs, documents. Parsed for structured data extraction and evidence gathering.' },
              ].map(opt => (
                <label
                  key={opt.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    multimodal[opt.key]
                      ? 'border-fuchsia-500/40 bg-fuchsia-950/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={multimodal[opt.key]}
                    onChange={() => setMultimodal(m => ({ ...m, [opt.key]: !m[opt.key] }))}
                    className="mt-0.5 rounded border-slate-600 bg-slate-800 text-fuchsia-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-200">{opt.label}</div>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Step 6: Deploy */}
      {step === 6 && (
        <Card>
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Deployment</h3>
              <p className="text-xs text-slate-500 mb-4">Your channel is ready to deploy. Here&#39;s how to integrate it.</p>
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">{form.name || 'Untitled Channel'}</span>
                <Badge variant={form.channelType === 'customer' ? 'info' : form.channelType === 'employee' ? 'success' : 'neutral'}>
                  {form.channelType}
                </Badge>
              </div>
              <div className="text-xs text-slate-500">
                Auth: {AUTH_METHODS[form.channelType].find(m => m.value === authMethod)?.label || authMethod}
                {' | '}Permissions: {permissions.length}
                {' | '}Media: {[multimodal.images && 'Images', multimodal.audio && 'Audio', multimodal.video && 'Video', multimodal.files && 'Files'].filter(Boolean).join(', ') || 'Text only'}
              </div>
            </div>

            {/* Deployment key */}
            {createdChannel?.deploymentKey && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Deployment Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono text-fuchsia-300 bg-slate-900/50 rounded px-3 py-2">{createdChannel.deploymentKey}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(createdChannel.deploymentKey)}
                    className="text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {/* Embed code */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Chat Widget (embed in your website)</label>
              <pre className="text-xs text-slate-300 bg-slate-900/50 rounded p-3 overflow-x-auto">{`<script src="https://app.lamdis.ai/widget.js"
  data-channel-key="${createdChannel?.deploymentKey || 'ch_...'}"
  data-theme="dark">
</script>`}</pre>
            </div>

            {/* API endpoint */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">API Endpoint</label>
              <pre className="text-xs text-slate-300 bg-slate-900/50 rounded p-3 overflow-x-auto">{`POST https://app.lamdis.ai/api/channels/${createdChannel?.deploymentKey || 'ch_...'}/messages
Content-Type: application/json
Authorization: Bearer <session_token>

{
  "message": "I need to file a claim",
  "attachments": []
}`}</pre>
            </div>

            <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/10 p-3">
              <p className="text-xs text-emerald-300">
                Channel created successfully. Use the deployment key or embed code to integrate this channel into your application.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => step > 1 ? setStep(step - 1) : history.back()}
          className="px-5 py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <button
          onClick={() => {
            if (step === 5 && !createdChannel) { handleCreate(); return; }
            if (step < 6) setStep(step + 1);
            if (step === 6) router.push('/dashboard/library/channels');
          }}
          disabled={(step === 1 && !form.name.trim()) || saving}
          className="px-5 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {saving ? 'Creating...' : step === 5 ? 'Create Channel' : step === 6 ? 'Done' : 'Next'}
        </button>
      </div>
    </div>
  );
}
