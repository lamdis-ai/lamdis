"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const channelTypeColors: Record<string, { variant: 'info' | 'success' | 'neutral'; label: string }> = {
  customer: { variant: 'info', label: 'Customer-facing' },
  employee: { variant: 'success', label: 'Employee-facing' },
  system: { variant: 'neutral', label: 'System / API' },
};

const authLabels: Record<string, string> = {
  email_verification: 'Email Verification',
  phone_otp: 'Phone OTP',
  anonymous_rate_limited: 'Anonymous',
  custom_jwt: 'Custom JWT',
  sso_oidc: 'SSO / OIDC',
  org_membership: 'Org Membership',
  api_key: 'API Key',
  webhook_signature: 'Webhook Signature',
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/orgs/channels', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setChannels(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deleteChannel = async (id: string) => {
    if (!confirm('Delete this channel?')) return;
    await fetch(`/api/orgs/channels/${id}`, { method: 'DELETE' });
    setChannels(prev => prev.filter(ch => ch.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Channels</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure chat endpoints for customers, employees, or automated systems. Each channel connects to objectives and controls what users can see and do.
          </p>
        </div>
        <Link
          href="/dashboard/library/channels/new"
          className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors"
        >
          + New Channel
        </Link>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading channels...</div>
      ) : channels.length === 0 ? (
        <Card>
          <div className="p-8 text-center space-y-4">
            <h3 className="text-lg font-medium text-slate-200">No channels configured</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Channels are deployable chat endpoints. Create one to let customers, employees, or systems interact with your objectives.
            </p>
            <Link
              href="/dashboard/library/channels/new"
              className="inline-flex px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors"
            >
              Create Your First Channel
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {channels.map((ch: any) => {
            const typeInfo = channelTypeColors[ch.channelType] || channelTypeColors.system;
            const multimodal = ch.multimodal || {};
            const mediaTypes = [
              multimodal.images && 'Images',
              multimodal.audio && 'Audio',
              multimodal.video && 'Video',
              multimodal.files && 'Files',
            ].filter(Boolean);
            const linkedCount = Array.isArray(ch.linkedObjectiveIds) ? ch.linkedObjectiveIds.length : 0;

            return (
              <Card key={ch.id} className="hover:border-fuchsia-500/30 transition-colors">
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200">{ch.name}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                      <Badge variant={ch.enabled ? 'success' : 'neutral'}>{ch.enabled ? 'Active' : 'Disabled'}</Badge>
                    </div>
                  </div>
                  {ch.description && (
                    <p className="text-xs text-slate-400">{ch.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>Auth: {authLabels[ch.authMethod] || ch.authMethod}</span>
                    <span>{linkedCount} objective{linkedCount !== 1 ? 's' : ''} linked</span>
                    <span>{mediaTypes.length > 0 ? mediaTypes.join(', ') : 'Text only'}</span>
                  </div>
                  {ch.deploymentKey && (
                    <div className="text-xs font-mono text-slate-500 bg-slate-900/50 rounded px-2 py-1">
                      {ch.deploymentKey}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Link href={`/dashboard/library/channels/${ch.id}`} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
                      Configure
                    </Link>
                    <button
                      onClick={() => {
                        const code = `<script src="https://app.lamdis.ai/widget.js" data-channel-key="${ch.deploymentKey}" data-theme="dark"></script>`;
                        navigator.clipboard.writeText(code);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
                    >
                      Copy Embed Code
                    </button>
                    <button
                      onClick={() => deleteChannel(ch.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-rose-700/30 text-rose-400 hover:bg-rose-950/20 transition-colors ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
