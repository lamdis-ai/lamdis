"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useOrg } from '@/lib/orgContext';
import { FiPlus, FiTrash2, FiKey, FiCopy, FiCheck, FiX, FiEye, FiEyeOff, FiInfo, FiClock, FiActivity, FiShield, FiGitBranch, FiGitPullRequest, FiSettings, FiPlay, FiMessageSquare, FiLink, FiAlertCircle, FiExternalLink, FiServer } from 'react-icons/fi';
import { Input } from '@/components/base/Input';
import { authFetch } from '@/lib/authFetch';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  disabled: boolean;
}

interface NewKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  secret: string;
  createdAt: string;
}

const SCOPE_CATEGORIES = [
  {
    name: 'Workflows',
    description: 'Read workflow definitions and instances',
    icon: 'activity',
    scopes: [
      { value: 'workflows:*', label: 'All Workflows', description: 'Full access to workflow definitions and instances' },
      { value: 'workflows:read', label: 'Read Only', description: 'Read workflow definitions, checks, and instances' },
    ],
  },
  {
    name: 'SDK / Ingest',
    description: 'Send evidence events from your services',
    icon: 'server',
    scopes: [
      { value: 'ingest:*', label: 'All Ingest', description: 'Full access to event ingestion APIs' },
      { value: 'ingest:events', label: 'Send Events', description: 'Emit evidence events via the SDK' },
    ],
  },
  {
    name: 'Workflows',
    description: 'Read and manage workflow instances and reviews',
    icon: 'shield',
    scopes: [
      { value: 'workflows:*', label: 'All Workflows', description: 'Full access to workflow APIs' },
      { value: 'workflows:read', label: 'Read Only', description: 'Read workflows, instances, and stats' },
      { value: 'workflows:write', label: 'Write', description: 'Update review status and comments' },
    ],
  },
  {
    name: 'CI/CD Test Runner',
    description: 'Trigger test runs from CI/CD pipelines (GitHub Actions, GitLab CI, etc.)',
    icon: 'git',
    scopes: [
      { value: 'cicd:*', label: 'All CI/CD', description: 'Full access to CI/CD test runner APIs' },
      { value: 'cicd:runs:trigger', label: 'Trigger Runs', description: 'Start test suite runs from pipelines' },
      { value: 'cicd:runs:read', label: 'Read Runs', description: 'Read run status and results' },
      { value: 'cicd:runs:cancel', label: 'Cancel Runs', description: 'Cancel in-progress test runs' },
      { value: 'cicd:callback', label: 'Callback/Webhook', description: 'Receive webhook callbacks and post PR comments' },
    ],
  },
];

const AVAILABLE_SCOPES = SCOPE_CATEGORIES.flatMap((cat) => cat.scopes);

// CI/CD Callback Provider types
type CallbackProvider = 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'custom';

interface CICDConfig {
  enabled: boolean;
  provider: CallbackProvider;
  // GitHub/GitLab/Bitbucket
  repoUrl?: string;
  accessToken?: string;
  // Custom webhook
  webhookUrl?: string;
  webhookSecret?: string;
  // Comment settings
  commentOnPR: boolean;
  failOnThreshold: boolean;
  passThreshold: number;
  includeDetails: boolean;
}

// CI/CD Integration Section Component
function CICDIntegrationSection({ orgId }: { orgId?: string }) {
  const [config, setConfig] = useState<CICDConfig>({
    enabled: false,
    provider: 'github',
    commentOnPR: true,
    failOnThreshold: true,
    passThreshold: 80,
    includeDetails: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/orgs/cicd-config', {
          headers: { 'x-org-id': orgId },
        });
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setConfig((prev) => ({ ...prev, ...data }));
          }
        }
      } catch (e) {
        // Auth errors are handled globally by the layout
        console.error('Failed to load CI/CD config:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await authFetch('/api/orgs/cicd-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': orgId,
        },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      // Auth errors are handled globally by the layout
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const providerOptions: { value: CallbackProvider; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'github', label: 'GitHub', icon: <FiGitBranch />, description: 'Post comments on GitHub PRs' },
    { value: 'gitlab', label: 'GitLab', icon: <FiGitBranch />, description: 'Post comments on GitLab MRs' },
    { value: 'bitbucket', label: 'Bitbucket', icon: <FiGitBranch />, description: 'Post comments on Bitbucket PRs' },
    { value: 'azure', label: 'Azure DevOps', icon: <FiServer />, description: 'Post comments on Azure DevOps PRs' },
    { value: 'custom', label: 'Custom Webhook', icon: <FiLink />, description: 'POST results to any URL' },
  ];

  const currentProvider = providerOptions.find((p) => p.value === config.provider);

  if (loading) {
    return (
      <div className="mt-8 p-6 rounded-xl bg-slate-900 border border-slate-800">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800" />
          <div className="flex-1">
            <div className="h-4 w-48 bg-slate-800 rounded mb-2" />
            <div className="h-3 w-64 bg-slate-800 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-4 rounded-xl bg-gradient-to-r from-cyan-900/30 to-fuchsia-900/30 border border-cyan-500/30 cursor-pointer hover:border-cyan-500/50 transition"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-800">
              <FiGitPullRequest className="text-cyan-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                CI/CD Integration
                {config.enabled && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">
                    Active
                  </span>
                )}
              </h3>
              <p className="text-sm text-slate-400">
                Configure PR comments and deployment gates for test results
              </p>
            </div>
          </div>
          <FiSettings className={`text-slate-400 transition ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="mt-4 p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50">
            <div>
              <h4 className="font-medium">Enable CI/CD Integration</h4>
              <p className="text-sm text-slate-400">Post test results as PR comments and use as deployment gates</p>
            </div>
            <button
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className={`relative w-12 h-6 rounded-full transition ${config.enabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
            >
              <div
                className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition ${
                  config.enabled ? 'left-6' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {config.enabled && (
            <>
              {/* Provider Selection */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Provider</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {providerOptions.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setConfig((c) => ({ ...c, provider: p.value }))}
                      className={`p-3 rounded-lg border text-left transition ${
                        config.provider === p.value
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {p.icon}
                        <span className="font-medium text-sm">{p.label}</span>
                      </div>
                      <p className="text-xs text-slate-500">{p.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider-specific Configuration */}
              {config.provider !== 'custom' ? (
                <div className="space-y-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    {currentProvider?.icon}
                    {currentProvider?.label} Configuration
                  </h4>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Repository URL (optional)</label>
                    <Input
                      type="text"
                      value={config.repoUrl || ''}
                      onChange={(e) => setConfig((c) => ({ ...c, repoUrl: e.target.value }))}
                      placeholder={`https://${config.provider}.com/owner/repo`}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      If empty, Lamdis will use repository info from the CI environment
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Access Token</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Input
                          type={showToken ? 'text' : 'password'}
                          value={config.accessToken || ''}
                          onChange={(e) => setConfig((c) => ({ ...c, accessToken: e.target.value }))}
                          placeholder={config.provider === 'github' ? 'ghp_...' : 'glpat-...'}
                        />
                      </div>
                      <button
                        onClick={() => setShowToken(!showToken)}
                        className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition"
                      >
                        {showToken ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Token with repo/PR comment permissions.{' '}
                      <a
                        href={
                          config.provider === 'github'
                            ? 'https://github.com/settings/tokens/new?scopes=repo'
                            : config.provider === 'gitlab'
                            ? 'https://gitlab.com/-/user_settings/personal_access_tokens'
                            : '#'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                      >
                        Create token <FiExternalLink size={10} />
                      </a>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <FiLink />
                    Custom Webhook Configuration
                  </h4>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Webhook URL</label>
                    <Input
                      type="url"
                      value={config.webhookUrl || ''}
                      onChange={(e) => setConfig((c) => ({ ...c, webhookUrl: e.target.value }))}
                      placeholder="https://your-server.com/lamdis-webhook"
                    />
                    <p className="text-xs text-slate-500 mt-1">Lamdis will POST test results to this URL</p>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Webhook Secret (optional)</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Input
                          type={showWebhookSecret ? 'text' : 'password'}
                          value={config.webhookSecret || ''}
                          onChange={(e) => setConfig((c) => ({ ...c, webhookSecret: e.target.value }))}
                          placeholder="Optional HMAC signing secret"
                        />
                      </div>
                      <button
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition"
                      >
                        {showWebhookSecret ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      If set, payloads are signed with HMAC-SHA256 in the X-Lamdis-Signature header
                    </p>
                  </div>
                </div>
              )}

              {/* PR Comment Settings */}
              <div className="space-y-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <FiMessageSquare />
                  PR Comment Settings
                </h4>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-sm">Post comment on PR/MR</span>
                    <p className="text-xs text-slate-500">Add a summary comment to pull requests</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.commentOnPR}
                    onChange={(e) => setConfig((c) => ({ ...c, commentOnPR: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-sm">Include detailed results</span>
                    <p className="text-xs text-slate-500">Show individual test case results in comment</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.includeDetails}
                    onChange={(e) => setConfig((c) => ({ ...c, includeDetails: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                </label>
              </div>

              {/* Deployment Gate Settings */}
              <div className="space-y-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <FiAlertCircle />
                  Deployment Gate
                </h4>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-sm">Fail pipeline on threshold</span>
                    <p className="text-xs text-slate-500">Return exit code 1 if pass rate is below threshold</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.failOnThreshold}
                    onChange={(e) => setConfig((c) => ({ ...c, failOnThreshold: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                </label>

                {config.failOnThreshold && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Pass Rate Threshold: <span className="text-cyan-400 font-mono">{config.passThreshold}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={config.passThreshold}
                      onChange={(e) => setConfig((c) => ({ ...c, passThreshold: parseInt(e.target.value) }))}
                      className="w-full h-2 rounded-lg appearance-none bg-slate-700 accent-cyan-500"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Usage Example */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-700">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FiPlay size={14} />
                  GitHub Actions Example
                </h4>
                <pre className="text-xs overflow-x-auto text-slate-400">
{`name: Lamdis AI Tests
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Lamdis Tests
        env:
          LAMDIS_API_KEY: \${{ secrets.LAMDIS_API_KEY }}
        run: |
          curl -X POST https://api.lamdis.ai/orgs/{orgId}/cicd/runs \\
            -H "Authorization: Bearer \$LAMDIS_API_KEY" \\
            -H "Content-Type: application/json" \\
            -d '{
              "suiteId": "your-suite-id",
              "prNumber": "\${{ github.event.pull_request.number }}",
              "commitSha": "\${{ github.sha }}",
              "branch": "\${{ github.head_ref }}"
            }'`}
                </pre>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
                  <FiX />
                  {error}
                </div>
              )}

              {/* Save Button */}
              <div className="flex items-center justify-end gap-3">
                {saved && (
                  <span className="text-sm text-green-400 flex items-center gap-1">
                    <FiCheck />
                    Saved
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 transition flex items-center gap-2"
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiKeysPage() {
  const { currentOrg } = useOrg();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState<NewKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formScopes, setFormScopes] = useState<Set<string>>(new Set(['workflows:*']));
  const [formExpiration, setFormExpiration] = useState<string>('never');
  const [creating, setCreating] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    if (!currentOrg?.orgId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await authFetch('/api/orgs/api-keys', {
        headers: { 'x-org-id': currentOrg.orgId },
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch API keys');
      }
      
      const data = await res.json();
      setApiKeys(Array.isArray(data) ? data : []);
    } catch (e: any) {
      // Auth errors are handled globally by the layout
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.orgId]);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const openCreateModal = () => {
    setFormName('');
    setFormScopes(new Set(['workflows:*']));
    setFormExpiration('never');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
  };

  const closeSecretModal = () => {
    setShowSecretModal(false);
    setNewKeySecret(null);
    setCopied(false);
    setShowSecret(false);
  };

  const toggleScope = (scope: string) => {
    const newScopes = new Set(formScopes);
    if (newScopes.has(scope)) {
      newScopes.delete(scope);
    } else {
      newScopes.add(scope);
    }
    setFormScopes(newScopes);
  };

  const getExpirationDate = (): string | undefined => {
    if (formExpiration === 'never') return undefined;
    const now = new Date();
    switch (formExpiration) {
      case '7d':
        now.setDate(now.getDate() + 7);
        break;
      case '30d':
        now.setDate(now.getDate() + 30);
        break;
      case '90d':
        now.setDate(now.getDate() + 90);
        break;
      case '365d':
        now.setDate(now.getDate() + 365);
        break;
    }
    return now.toISOString();
  };

  const handleCreateKey = async () => {
    if (!currentOrg?.orgId || !formName || formScopes.size === 0) return;
    
    setCreating(true);
    setError(null);
    
    try {
      const res = await authFetch('/api/orgs/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': currentOrg.orgId,
        },
        body: JSON.stringify({
          name: formName,
          scopes: Array.from(formScopes),
          expiresAt: getExpirationDate(),
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create API key');
      }
      
      const data = await res.json();
      setNewKeySecret(data);
      setShowCreateModal(false);
      setShowSecretModal(true);
      await fetchApiKeys();
    } catch (e: any) {
      // Auth errors are handled globally by the layout
      setError(e.message);
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKey = async (key: ApiKey) => {
    if (!currentOrg?.orgId) return;
    
    if (!confirm(`Are you sure you want to revoke the API key "${key.name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await authFetch(`/api/orgs/api-keys/${key.id}`, {
        method: 'DELETE',
        headers: { 'x-org-id': currentOrg.orgId },
      });
      
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke API key');
      }
      
      await fetchApiKeys();
    } catch (e: any) {
      // Auth errors are handled globally by the layout
      setError(e.message);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return formatDate(date);
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">API Keys</h1>
            <p className="text-slate-400 mt-1">Manage API keys for programmatic access to Lamdis services</p>
          </div>
          
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 transition"
          >
            <FiPlus />
            Create API Key
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><FiX /></button>
          </div>
        )}

        {/* Info Box */}
        <div className="mb-6 p-4 rounded-xl bg-blue-900/20 border border-blue-500/30 text-blue-300 flex items-start gap-3">
          <FiInfo className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">About API Keys</p>
            <p className="text-blue-200/70">
              API keys allow programmatic access to Lamdis APIs. Use them to send evidence events via the SDK,
              manage workflow instances, or trigger test runs from CI/CD pipelines. Each key is scoped to this organization and can only access data within it.
            </p>
          </div>
        </div>

        {/* Usage Examples */}
        <div className="mb-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <FiShield size={14} className="text-fuchsia-400" />
              SDK: Send evidence events
            </h3>
            <pre className="text-xs bg-slate-950 p-3 rounded-lg overflow-x-auto text-slate-400">
{`import { Lamdis } from '@lamdis/sdk';
const lamdis = new Lamdis({ apiKey: 'lam_sk_...' });
const instance = lamdis.startWorkflow('my-workflow');
await instance.emit('event.type', { payload: '...' });
await instance.complete();`}
            </pre>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <FiGitBranch size={14} className="text-cyan-400" />
              CI/CD API: Trigger a test run from your pipeline
            </h3>
            <pre className="text-xs bg-slate-950 p-3 rounded-lg overflow-x-auto text-slate-400">
{`curl -X POST https://api.lamdis.ai/orgs/{orgId}/cicd/runs \\
  -H "Authorization: Bearer lam_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "suiteId": "your-suite-id",
    "prNumber": "123",
    "commitSha": "abc123...",
    "branch": "feature/my-feature"
  }'`}
            </pre>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading API keys...</div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FiKey className="mx-auto mb-4 text-4xl opacity-50" />
            <p>No API keys created yet</p>
            <p className="text-sm mt-1">Create your first API key to get started</p>
          </div>
        ) : (
          /* API Keys List */
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={`rounded-xl bg-slate-900 border p-4 transition ${
                  key.disabled || (key.expiresAt && isExpired(key.expiresAt))
                    ? 'border-slate-700 opacity-60'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-800">
                      <FiKey className="text-fuchsia-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{key.name}</h3>
                        {key.disabled && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
                            Disabled
                          </span>
                        )}
                        {key.expiresAt && isExpired(key.expiresAt) && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300">
                            Expired
                          </span>
                        )}
                      </div>
                      <code className="text-sm text-slate-500">{key.keyPrefix}...****</code>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDeleteKey(key)}
                    className="p-2 rounded-lg hover:bg-slate-800 text-red-400 transition"
                    title="Revoke API key"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
                
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <FiShield size={12} />
                    {key.scopes.join(', ')}
                  </span>
                  <span className="flex items-center gap-1">
                    <FiClock size={12} />
                    Created {formatRelativeTime(key.createdAt)}
                  </span>
                  {key.lastUsedAt && (
                    <span className="flex items-center gap-1">
                      <FiActivity size={12} />
                      Last used {formatRelativeTime(key.lastUsedAt)}
                    </span>
                  )}
                  {key.expiresAt && !isExpired(key.expiresAt) && (
                    <span className="flex items-center gap-1 text-yellow-400">
                      <FiClock size={12} />
                      Expires {formatDate(key.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CI/CD Integration Section */}
        <CICDIntegrationSection orgId={currentOrg?.orgId} />

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Create API Key</h2>
                <button onClick={closeCreateModal} className="p-2 hover:bg-slate-800 rounded-lg">
                  <FiX />
                </button>
              </div>
              
              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <Input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Production Workflows"
                  />
                  <p className="text-xs text-slate-500 mt-1">A descriptive name to identify this key</p>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Scopes</label>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {SCOPE_CATEGORIES.map((category) => (
                      <div key={category.name} className="rounded-lg border border-slate-700 overflow-hidden">
                        <div className="px-3 py-2 bg-slate-800/70 flex items-center gap-2">
                          {category.icon === 'shield' ? <FiShield size={14} className="text-fuchsia-400" /> : category.icon === 'activity' ? <FiActivity size={14} className="text-violet-400" /> : category.icon === 'server' ? <FiServer size={14} className="text-emerald-400" /> : <FiGitBranch size={14} className="text-cyan-400" />}
                          <span className="text-sm font-medium">{category.name}</span>
                          <span className="text-xs text-slate-500 ml-auto">{category.description}</span>
                        </div>
                        <div className="divide-y divide-slate-700/50">
                          {category.scopes.map((scope) => (
                            <label
                              key={scope.value}
                              className="flex items-start gap-3 p-3 hover:bg-slate-800/50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formScopes.has(scope.value)}
                                onChange={() => toggleScope(scope.value)}
                                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-700 text-fuchsia-500 focus:ring-fuchsia-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono text-slate-200">{scope.value}</span>
                                  {scope.value.endsWith(':*') && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300">Full Access</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500">{scope.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Expiration</label>
                  <select
                    value={formExpiration}
                    onChange={(e) => setFormExpiration(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                  >
                    <option value="never">Never expires</option>
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                    <option value="90d">90 days</option>
                    <option value="365d">1 year</option>
                  </select>
                </div>
              </div>
              
              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-end gap-3">
                <button
                  onClick={closeCreateModal}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateKey}
                  disabled={!formName || formScopes.size === 0 || creating}
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {creating ? 'Creating...' : 'Create API Key'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Secret Modal */}
        {showSecretModal && newKeySecret && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FiCheck className="text-green-400" />
                  API Key Created
                </h2>
              </div>
              
              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-xl bg-yellow-900/20 border border-yellow-500/30 text-yellow-300 flex items-start gap-3">
                  <FiInfo className="mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Save your API key now!</p>
                    <p className="text-yellow-200/70 mt-1">
                      This is the only time you'll see this key. Make sure to copy it and store it securely.
                    </p>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-1">API Key</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 font-mono text-sm break-all">
                      {showSecret ? newKeySecret.secret : '••••••••••••••••••••••••••••••••••••••••'}
                    </div>
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                      title={showSecret ? 'Hide' : 'Show'}
                    >
                      {showSecret ? <FiEyeOff /> : <FiEye />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(newKeySecret.secret)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                      title="Copy to clipboard"
                    >
                      {copied ? <FiCheck className="text-green-400" /> : <FiCopy />}
                    </button>
                  </div>
                </div>
                
                <div className="text-sm text-slate-400">
                  <p><strong>Name:</strong> {newKeySecret.name}</p>
                  <p><strong>Scopes:</strong> {newKeySecret.scopes.join(', ')}</p>
                </div>
              </div>
              
              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-end">
                <button
                  onClick={closeSecretModal}
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}