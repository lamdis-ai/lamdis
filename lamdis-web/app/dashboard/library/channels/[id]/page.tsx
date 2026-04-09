"use client";
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/base/Card';
import Badge from '@/components/base/Badge';

export const dynamic = 'force-dynamic';

const channelTypeLabels: Record<string, string> = {
  customer: 'Customer-facing',
  employee: 'Employee-facing',
  system: 'System / API',
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

interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
  facts?: any[];
}

export default function ChannelDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [channel, setChannel] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Test chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orgs/channels/${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setChannel(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const startChat = async () => {
    setChatOpen(true);
    setMessages([{ role: 'system', content: `Connected to "${channel.name}". You can now send messages as a ${channel.channelType} user.` }]);
    try {
      const res = await fetch('/api/orgs/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel: 'chat',
          participantType: channel.channelType === 'employee' ? 'agent' : 'customer',
          participantId: 'test-user',
          context: { channelId: channel.id, channelName: channel.name, testMode: true },
        }),
      });
      const data = await res.json();
      if (data?.id) {
        setSessionId(data.id);
        setMessages(prev => [...prev, { role: 'system', content: `Session started (${data.id.slice(0, 8)}...)` }]);
      } else {
        setMessages(prev => [...prev, { role: 'system', content: `Failed to start session: ${data?.error || 'unknown error'}` }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${err?.message}` }]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);
    setMessages(prev => [...prev, { role: 'user', content: msg }]);

    try {
      const res = await fetch(`/api/orgs/conversations/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: msg }),
      });
      const data = await res.json();
      if (data?.suggestedReply) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.suggestedReply,
          facts: data.extractedFacts,
        }]);
      } else if (data?.error) {
        setMessages(prev => [...prev, { role: 'system', content: `Error: ${data.error}` }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${err?.message}` }]);
    }
    setSending(false);
  };

  if (loading) return <div className="text-center text-slate-500 py-12">Loading...</div>;
  if (!channel) return <div className="text-center text-slate-500 py-12">Channel not found</div>;

  const multimodal = channel.multimodal || {};
  const mediaTypes = [multimodal.images && 'Images', multimodal.audio && 'Audio', multimodal.video && 'Video', multimodal.files && 'Files'].filter(Boolean);
  const perms = Array.isArray(channel.permissions) ? channel.permissions : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Link href="/dashboard/library/channels" className="hover:text-slate-200">Channels</Link>
            <span>/</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{channel.name}</h1>
          {channel.description && <p className="text-sm text-slate-400 mt-1">{channel.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={channel.channelType === 'customer' ? 'info' : channel.channelType === 'employee' ? 'success' : 'neutral'}>
            {channelTypeLabels[channel.channelType] || channel.channelType}
          </Badge>
          <Badge variant={channel.enabled ? 'success' : 'neutral'}>{channel.enabled ? 'Active' : 'Disabled'}</Badge>
        </div>
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Authentication</div>
            <div className="text-sm text-slate-200">{authLabels[channel.authMethod] || channel.authMethod}</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Media</div>
            <div className="text-sm text-slate-200">{mediaTypes.length > 0 ? mediaTypes.join(', ') : 'Text only'}</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Permissions</div>
            <div className="text-sm text-slate-200">{perms.length} granted</div>
          </div>
        </Card>
      </div>

      {/* Deployment key */}
      <Card>
        <div className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Deployment Key</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono text-fuchsia-300 bg-slate-900/50 rounded px-3 py-2">{channel.deploymentKey}</code>
            <button onClick={() => navigator.clipboard.writeText(channel.deploymentKey)} className="text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">Copy</button>
          </div>
        </div>
      </Card>

      {/* Permissions list */}
      <Card>
        <div className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Permissions</div>
          <div className="flex flex-wrap gap-2">
            {perms.map((p: string) => (
              <span key={p} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">{p.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>
      </Card>

      {/* Test Chat */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-100">Test Chat</h2>
          {!chatOpen && (
            <button onClick={startChat} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors">
              Start Test Conversation
            </button>
          )}
        </div>

        {chatOpen && (
          <Card>
            <div className="flex flex-col" style={{ height: '400px' }}>
              {/* Messages */}
              <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, idx) => {
                  if (msg.role === 'system') {
                    return (
                      <div key={idx} className="text-center">
                        <span className="text-[11px] text-slate-500 bg-slate-800/50 rounded-full px-3 py-1">{msg.content}</span>
                      </div>
                    );
                  }
                  if (msg.role === 'user') {
                    return (
                      <div key={idx} className="flex justify-end">
                        <div className="max-w-[75%] rounded-lg bg-fuchsia-950/30 border border-fuchsia-500/20 px-3 py-2">
                          <p className="text-sm text-slate-200">{msg.content}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="flex justify-start">
                      <div className="max-w-[75%] rounded-lg bg-slate-800/50 border border-slate-700 px-3 py-2">
                        <p className="text-sm text-slate-300">{msg.content}</p>
                        {msg.facts && msg.facts.length > 0 && (
                          <details className="mt-2 border-t border-slate-700/50 pt-1.5">
                            <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400">Debug: {msg.facts.length} fact(s) extracted</summary>
                            <div className="mt-1 space-y-0.5">
                              {msg.facts.map((f: any, fi: number) => (
                                <div key={fi} className="text-[10px] text-slate-500 font-mono">{f.eventType}: {JSON.stringify(f.payload)}</div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
                {sending && (
                  <div className="flex items-center gap-2 px-3 py-1 text-sm text-slate-500">
                    <div className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
                    Processing...
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-3 border-t border-slate-800">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder={sessionId ? 'Type a message...' : 'Starting session...'}
                    disabled={!sessionId || sending}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!sessionId || sending || !input.trim()}
                    className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
