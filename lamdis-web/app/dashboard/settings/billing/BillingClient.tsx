"use client";
import React, { useEffect, useState } from 'react';
import { RUNS_PRICING_PLANS, getPlanLabel, isV3Plan, CLOUD_V3_USAGE_PRICING, CLOUD_V3_RETENTION_ADDONS, V3_PLAN_LABELS } from '@/lib/pricing';
import ProgressBar from '@/components/base/ProgressBar';

const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';

interface Props {
  plan: string;
  status?: string;
  orgId?: string;
}

interface LicenseInfo {
  tier: string;
  limits: Record<string, number>;
  usage: Record<string, number>;
  features: Record<string, boolean>;
  expiresAt?: string;
  daysUntilExpiry?: number;
  warning?: string;
}

interface UsageData {
  usedRuns: number;
  limit: number;
  planLimit: number;
  runsOverride: number | null;
  period?: { start: string; end: string };
  runs?: {
    plan: string;
    used: number;
    limit: number;
    planLimit: number;
    override: number | null;
  };
}

const planLabels: Record<string, string> = {
  starter: 'Starter (Free)',
  pro: 'Pro',
  enterprise: 'Enterprise',
  free_trial: 'Free Trial',
  team: 'Team',
  business: 'Business',
  build: 'Build',
  insights: 'Insights',
  growth: 'Growth',
  scale: 'Scale',
  success: 'Scale',
  ...V3_PLAN_LABELS,
};

export default function BillingClient({ plan, status, orgId }: Props) {
  const [loading, setLoading] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [banner, setBanner] = useState<{ kind: 'success' | 'warning' | 'info'; text: string } | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  const v3 = isV3Plan(plan);

  // Fetch license info for self-hosted deployments
  useEffect(() => {
    if (!isSelfHosted || !orgId) return;
    (async () => {
      try {
        const r = await fetch(`/api/license/status?orgId=${encodeURIComponent(orgId)}`, { cache: 'no-store' });
        if (r.ok) {
          setLicenseInfo(await r.json());
        }
      } catch {}
    })();
  }, [orgId]);

  // Self-hosted: render license management UI instead of Stripe billing
  if (isSelfHosted) {
    return <SelfHostedLicenseView licenseInfo={licenseInfo} orgId={orgId} />;
  }

  // After a successful checkout redirect, reconcile immediately so UI reflects new plan
  useEffect(() => {
    const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (sp.get('checkout') === 'success' && orgId) {
      (async () => {
        try {
          setLoading('reconcile');
          const r = await fetch('/api/billing/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }) });
        } catch {}
        finally {
          setLoading('');
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('checkout');
            window.history.replaceState({}, '', url.toString());
          } catch {}
          window.location.reload();
        }
      })();
    }
    if (sp.get('checkout') === 'cancel' || sp.get('cancel') === '1') {
      setBanner({ kind: 'warning', text: 'Checkout canceled. No changes were made to your subscription.' });
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        url.searchParams.delete('cancel');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }, [orgId]);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      try {
        const r = await fetch(`/api/billing/usage?orgId=${encodeURIComponent(orgId)}`, { cache: 'no-store' });
        const data = await r.json();
        if (r.ok) {
          setUsage({
            usedRuns: Number(data?.usedRuns || 0),
            limit: Number(data?.limit || 0),
            planLimit: Number(data?.planLimit || 0),
            runsOverride: data?.runsOverride || null,
            period: data?.period,
            runs: data?.runs,
          });
        }
      } catch {}
    })();
  }, [orgId]);

  async function createCheckout(planKey: string) {
    setError('');
    setLoading(planKey);
    try {
      const endpoint = planKey === 'cloud_v3' ? '/api/billing/v3/checkout' : '/api/billing/checkout';
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planKey }) });
      const data = await r.json();
      if (!r.ok || !data?.url) throw new Error(data?.error || 'Failed to start checkout');
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || 'Checkout failed');
    } finally {
      setLoading('');
    }
  }

  async function openPortal() {
    setError('');
    setLoading('portal');
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await r.json();
      if (!r.ok || !data?.url) throw new Error(data?.error || 'Failed to open portal');
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || 'Portal failed');
    } finally {
      setLoading('');
    }
  }

  const readablePlan = planLabels[plan] || plan;

  // Unified runs for V3
  const usedRuns = usage?.usedRuns || 0;
  const limit = usage?.limit || 0;
  const remaining = Math.max(0, limit - usedRuns);
  const pct = limit > 0 ? Math.round((usedRuns / limit) * 100) : 0;
  const variant = pct < 80 ? 'success' : pct <= 100 ? 'warning' : 'danger';

  // V3 bill estimate
  const estimatedRunsCost = v3 && plan === 'cloud_v3' ? usedRuns * CLOUD_V3_USAGE_PRICING.perRun : 0;
  const estimatedTotal = v3 && plan === 'cloud_v3' ? CLOUD_V3_USAGE_PRICING.platformFeeMonthly + estimatedRunsCost : 0;

  if (v3) {
    return (
      <div className="space-y-8">
        {/* V3 Unified Usage */}
        {orgId && (
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/20">
                <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-100">Runs Usage</h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Unified
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Test runs this billing period
                  {usage?.period?.start ? ` (${new Date(usage.period.start).toLocaleDateString()}–${new Date(usage.period.end).toLocaleDateString()})` : ''}
                </p>
              </div>
            </div>

            {plan === 'cloud_community' && limit > 0 ? (
              <>
                <div className="mt-4">
                  <ProgressBar value={usedRuns} max={limit} variant={variant} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <div className="text-slate-300">
                    <span className="text-slate-400">Used:</span>{' '}
                    <span className="font-semibold text-slate-100">{usedRuns.toLocaleString()}</span>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Remaining:</span>{' '}
                    <span className={`font-semibold ${remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {remaining.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Limit:</span>{' '}
                    <span className="font-semibold text-slate-100">{limit.toLocaleString()}/mo</span>
                  </div>
                </div>
                {pct >= 80 && pct < 100 && (
                  <p className="mt-3 text-xs text-amber-400">
                    You&apos;ve used {pct}% of your monthly runs. Upgrade to Cloud for unlimited metered usage.
                  </p>
                )}
                {pct >= 100 && (
                  <p className="mt-3 text-xs text-rose-400">
                    You&apos;ve reached your monthly run limit. Upgrade to Cloud to continue.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="mt-3 text-sm text-slate-300">
                  Total this period: <span className="font-semibold text-slate-100">{usedRuns.toLocaleString()} runs</span>
                </div>
                {plan === 'cloud_v3' && (
                  <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                    <h3 className="text-sm font-medium text-slate-200 mb-2">Estimated Bill</h3>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <div className="text-slate-300">
                        <span className="text-slate-400">Platform fee:</span>{' '}
                        <span className="font-semibold text-slate-100">${CLOUD_V3_USAGE_PRICING.platformFeeMonthly}</span>
                      </div>
                      <div className="text-slate-300">
                        <span className="text-slate-400">Usage ({usedRuns.toLocaleString()} runs x $0.075):</span>{' '}
                        <span className="font-semibold text-slate-100">${estimatedRunsCost.toFixed(2)}</span>
                      </div>
                      <div className="text-slate-300">
                        <span className="text-slate-400">Estimated total:</span>{' '}
                        <span className="font-semibold text-emerald-400">${estimatedTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {banner && (
          <div className={`rounded-lg border p-4 ${banner.kind === 'success' ? 'border-emerald-700/50 bg-emerald-900/30 text-emerald-200' : banner.kind === 'warning' ? 'border-amber-700/50 bg-amber-900/30 text-amber-200' : 'border-sky-700/50 bg-sky-900/30 text-sky-200'}`}>
            {banner.text}
          </div>
        )}

        {/* Current Plan */}
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Current Plan</h2>
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-800/80 px-4 py-1.5 text-sm font-medium text-slate-200">
              {readablePlan}
            </span>
            {status && (
              <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-800/80 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {status}
              </span>
            )}
            {error && <span className="text-sm text-rose-300">{error}</span>}
          </div>
          <div className="mt-6 flex gap-3 flex-wrap">
            {plan !== 'cloud_community' && (
              <button
                onClick={openPortal}
                disabled={loading === 'portal'}
                className="inline-flex items-center rounded-md border border-slate-700/70 bg-slate-800/60 px-5 py-2 text-sm font-medium text-slate-200 hover:border-emerald-500/40 hover:text-slate-100 disabled:opacity-60"
              >
                {loading === 'portal' ? 'Opening...' : 'Billing Portal'}
              </button>
            )}
          </div>
        </div>

        {/* V3 Plan Options */}
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Plans</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <PlanCard
              name="Community"
              price="Free"
              description="500 runs/month, all features, 7-day retention"
              features={['All features included', 'Unlimited seats', 'CI + SSO/SAML', 'Community support']}
              current={plan === 'cloud_community'}
              actionLabel={plan === 'cloud_community' ? 'Current Plan' : 'Downgrade'}
              onSelect={plan === 'cloud_community' ? undefined : () => activateCommunity()}
              loading={loading === 'cloud_community'}
            />
            <PlanCard
              name="Cloud"
              price="$500/mo + usage"
              description="$75 per 1,000 runs, 90-day retention"
              features={['Pay per run ($0.075/run)', 'All features included', 'Unlimited seats + SSO/SAML', '90-day retention (extendable)']}
              highlight
              current={plan === 'cloud_v3'}
              actionLabel={plan === 'cloud_v3' ? 'Current Plan' : 'Upgrade'}
              onSelect={plan === 'cloud_v3' ? undefined : () => createCheckout('cloud_v3')}
              loading={loading === 'cloud_v3'}
            />
            <PlanCard
              name="Enterprise"
              price="Custom"
              description="Committed volume, discounted rates"
              features={['Dedicated CSM + SLA', 'Legal hold + signed bundles', 'Air-gapped / data residency', 'Custom retention']}
              current={plan === 'cloud_enterprise'}
              actionLabel="Contact Sales"
              onSelect={() => { window.location.href = 'mailto:sales@lamdis.ai?subject=Enterprise%20Plan%20Inquiry'; }}
            />
          </div>
        </div>

        {/* Retention Add-ons */}
        {plan === 'cloud_v3' && (
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-2">Retention Add-ons</h2>
            <p className="text-sm text-slate-400 mb-4">Extend data retention via the Billing Portal.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.values(CLOUD_V3_RETENTION_ADDONS).map((addon) => (
                <div key={addon.days} className={`p-3 rounded-lg text-center ${addon.monthlyPrice === 0 ? 'bg-emerald-900/10 border border-emerald-700/30' : 'bg-slate-800/50 border border-slate-700/30'}`}>
                  <div className="text-sm font-medium text-slate-200">{addon.label}</div>
                  {addon.monthlyPrice === 0 ? (
                    <div className="text-xs text-emerald-400 mt-1">Included</div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-1">+${addon.monthlyPrice}/mo</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── V2 Legacy Billing UI ─────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Usage overview */}
      {orgId && (
        <div className="space-y-6">
          {/* Runs Usage */}
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-sky-500/20">
                <svg className="h-4 w-4 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-100">Runs Usage</h2>
                  {usage?.runs?.plan && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                      {getPlanLabel(usage.runs.plan)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  AI testing runs this billing period
                  {usage?.period?.start ? ` (${new Date(usage.period.start).toLocaleDateString()}–${new Date(usage.period.end).toLocaleDateString()})` : ''}
                </p>
              </div>
            </div>
            {limit > 0 ? (
              <>
                <div className="mt-4">
                  <ProgressBar value={usedRuns} max={limit} variant={variant} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <div className="text-slate-300">
                    <span className="text-slate-400">Used:</span>{' '}
                    <span className="font-semibold text-slate-100">{usedRuns.toLocaleString()}</span>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Remaining:</span>{' '}
                    <span className={`font-semibold ${remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {remaining.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Limit:</span>{' '}
                    <span className="font-semibold text-slate-100">{limit.toLocaleString()}</span>
                    {usage?.runsOverride && (
                      <span className="ml-1.5 text-xs text-sky-400">(custom)</span>
                    )}
                  </div>
                </div>
                {pct >= 80 && pct < 100 && (
                  <p className="mt-3 text-xs text-amber-400">
                    ⚠ You&apos;ve used {pct}% of your monthly runs. Consider upgrading soon.
                  </p>
                )}
                {pct >= 100 && (
                  <p className="mt-3 text-xs text-rose-400">
                    ⚠ You&apos;ve reached your monthly run limit. Upgrade your plan to continue testing.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-3 text-sm text-slate-300">
                Total this period: <span className="font-semibold text-slate-100">{usedRuns.toLocaleString()} runs</span>
              </div>
            )}
          </div>

        </div>
      )}

      {banner && (
        <div className={`rounded-lg border p-4 ${banner.kind === 'success' ? 'border-emerald-700/50 bg-emerald-900/30 text-emerald-200' : banner.kind === 'warning' ? 'border-amber-700/50 bg-amber-900/30 text-amber-200' : 'border-sky-700/50 bg-sky-900/30 text-sky-200'}`}>
          {banner.text}
        </div>
      )}
      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100">Current Plan</h2>
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-800/80 px-4 py-1.5 text-sm font-medium text-slate-200">
            {readablePlan}
          </span>
          {status && (
            <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-800/80 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              {status}
            </span>
          )}
          {error && <span className="text-sm text-fuchsia-300">{error}</span>}
        </div>
        <div className="mt-6 flex gap-3 flex-wrap">
          <button
            onClick={openPortal}
            disabled={loading === 'portal'}
            className="inline-flex items-center rounded-md border border-slate-700/70 bg-slate-800/60 px-5 py-2 text-sm font-medium text-slate-200 hover:border-fuchsia-500/40 hover:text-slate-100 disabled:opacity-60"
          >
            {loading === 'portal' ? 'Opening...' : 'Billing Portal'}
          </button>
        </div>
      </div>

      {/* V2 Upgrade Banner — suggest migrating to V3 */}
      <div className="rounded-xl border border-emerald-800/50 bg-gradient-to-br from-emerald-900/20 to-slate-900/60 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Simplified Pricing Available</h2>
            <p className="mt-1 text-sm text-slate-400">
              Switch to our new unified plan: $500/mo + $75 per 1,000 runs. All features included, no seat limits.
            </p>
          </div>
          <button
            onClick={() => createCheckout('cloud_v3')}
            disabled={loading === 'cloud_v3'}
            className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:brightness-110 transition whitespace-nowrap disabled:opacity-60"
          >
            {loading === 'cloud_v3' ? 'Loading...' : 'Switch to V3'}
          </button>
        </div>
      </div>

      {/* Lamdis Runs Plans */}
      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-sky-500/20">
            <svg className="h-4 w-4 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Lamdis Runs</h2>
            <p className="text-xs text-slate-400">AI testing & conversation runs</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {RUNS_PRICING_PLANS.filter(p => p.key !== 'enterprise').map(p => {
            const currentPlan = plan === p.key;
            return (
              <PlanCard
                key={p.key}
                name={p.name}
                price={p.price}
                description={p.key === 'starter' ? '50 runs/month included' : p.key === 'pro' ? '2,000 runs/month included' : 'Custom volume'}
                features={[...p.features]}
                highlight={p.highlighted}
                current={currentPlan}
                actionLabel={currentPlan ? 'Current Plan' : p.price === 'Free' ? 'Start Free' : 'Upgrade'}
                onSelect={currentPlan ? undefined : () => createCheckout(p.key)}
                loading={loading === p.key}
              />
            );
          })}
        </div>
      </div>

      {/* Enterprise Contact */}
      <div className="rounded-xl border border-slate-800/70 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Enterprise</h2>
            <p className="mt-1 text-sm text-slate-400">
              Custom plans for large teams with dedicated support, SLAs, and unlimited usage.
            </p>
          </div>
          <a
            href="mailto:sales@lamdis.ai?subject=Enterprise%20Plan%20Inquiry"
            className="inline-flex items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/60 px-6 py-2.5 text-sm font-medium text-slate-200 hover:border-fuchsia-500/40 hover:text-slate-100 transition whitespace-nowrap"
          >
            Contact Sales
          </a>
        </div>
      </div>

      {/* Free Trial CTA for users without a paid plan */}
      {(plan === 'starter' || plan === 'free_trial' || !plan) && (
        <div className="rounded-xl border border-sky-800/50 bg-gradient-to-br from-sky-900/30 to-slate-900/60 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Start Your Free Trial</h2>
              <p className="mt-1 text-sm text-slate-400">
                Try Lamdis Pro free for 14 days. No credit card required.
              </p>
            </div>
            <button
              onClick={() => startFreeTrial()}
              disabled={loading === 'free_trial' || plan === 'free_trial'}
              className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-sky-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:brightness-110 transition whitespace-nowrap disabled:opacity-60"
            >
              {loading === 'free_trial' ? 'Starting...' : plan === 'free_trial' ? 'Trial Active' : 'Start Free Trial'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  async function startFreeTrial() {
    setError('');
    setLoading('free_trial');
    try {
      const r = await fetch('/api/billing/free-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey: 'free_trial' })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to start free trial');
      setBanner({ kind: 'success', text: 'Free trial activated! You now have Pro access for 14 days.' });
      window.location.reload();
    } catch (e: any) {
      setError(e.message || 'Failed to start free trial');
    } finally {
      setLoading('');
    }
  }

  async function activateCommunity() {
    setError('');
    setLoading('cloud_community');
    try {
      const r = await fetch('/api/billing/v3/activate-community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to activate Community plan');
      setBanner({ kind: 'success', text: 'Community plan activated!' });
      window.location.reload();
    } catch (e: any) {
      setError(e.message || 'Failed to activate Community plan');
    } finally {
      setLoading('');
    }
  }
}

function SelfHostedLicenseView({ licenseInfo, orgId }: { licenseInfo: LicenseInfo | null; orgId?: string }) {
  if (!licenseInfo) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100">License</h2>
          <p className="mt-2 text-sm text-slate-400">Loading license information...</p>
        </div>
      </div>
    );
  }

  const { tier, limits, usage, features, daysUntilExpiry, warning } = licenseInfo;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1).replace('_', ' ');

  const expiryColor = !daysUntilExpiry ? 'text-slate-400'
    : daysUntilExpiry < 0 ? 'text-red-400'
    : daysUntilExpiry < 30 ? 'text-amber-400'
    : 'text-emerald-400';

  const usageItems = [
    { label: 'Users', used: usage.active_users ?? 0, limit: limits.max_users ?? 0 },
    { label: 'Runs / Month', used: usage.runs_this_month ?? 0, limit: limits.max_runs_per_month ?? 0 },
    { label: 'Conversations / Month', used: usage.conversations_this_month ?? 0, limit: limits.max_conversations_per_month ?? 0 },
  ];

  const featureList = [
    { key: 'sso', label: 'SSO / OIDC' },
    { key: 'scim', label: 'SCIM Provisioning' },
    { key: 'advanced_rbac', label: 'Advanced RBAC' },
    { key: 'custom_retention', label: 'Custom Retention' },
    { key: 'audit_export', label: 'Audit Export' },
    { key: 'evidence_vault', label: 'Evidence Vault' },
  ];

  return (
    <div className="space-y-6">
      {warning && (
        <div className={`rounded-lg border p-4 ${
          daysUntilExpiry !== undefined && daysUntilExpiry < 0
            ? 'border-red-700/50 bg-red-900/30 text-red-200'
            : 'border-amber-700/50 bg-amber-900/30 text-amber-200'
        }`}>
          {warning}
        </div>
      )}

      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">License</h2>
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-1.5 text-sm font-medium text-fuchsia-300">
                {tierLabel}
              </span>
              {daysUntilExpiry !== undefined && (
                <span className={`text-sm ${expiryColor}`}>
                  {daysUntilExpiry < 0
                    ? `Expired ${Math.abs(daysUntilExpiry)} days ago`
                    : `${daysUntilExpiry} days remaining`}
                </span>
              )}
            </div>
          </div>
          <a
            href="mailto:sales@lamdis.ai?subject=License%20Upgrade"
            className="inline-flex items-center rounded-md border border-slate-700/70 bg-slate-800/60 px-5 py-2 text-sm font-medium text-slate-200 hover:border-fuchsia-500/40 hover:text-slate-100 transition"
          >
            Contact Sales
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Usage</h2>
        <div className="space-y-5">
          {usageItems.map(({ label, used, limit }) => {
            const isUnlimited = limit === -1;
            const pct = isUnlimited ? 0 : limit > 0 ? Math.round((used / limit) * 100) : 0;
            const variant = pct < 80 ? 'success' : pct <= 100 ? 'warning' : 'danger';
            return (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-sm text-slate-400">
                    {used.toLocaleString()} / {isUnlimited ? 'Unlimited' : limit.toLocaleString()}
                  </span>
                </div>
                {!isUnlimited && limit > 0 && (
                  <ProgressBar value={used} max={limit} variant={variant} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Features</h2>
        <div className="grid grid-cols-2 gap-3">
          {featureList.map(({ key, label }) => {
            const enabled = features[key] ?? false;
            return (
              <div key={key} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${enabled ? 'bg-emerald-900/20 text-emerald-300' : 'bg-slate-800/40 text-slate-500'}`}>
                <span className="text-sm">{enabled ? '\u2713' : '\u2717'}</span>
                <span className="text-sm">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {tier === 'community' && (
        <div className="rounded-xl border border-fuchsia-800/50 bg-gradient-to-br from-fuchsia-900/20 to-slate-900/60 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Upgrade Your License</h2>
              <p className="mt-1 text-sm text-slate-400">
                Get more users, higher run limits, SSO, and priority support.
              </p>
            </div>
            <a
              href="https://lamdis.ai/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-fuchsia-500 to-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:brightness-110 transition whitespace-nowrap"
            >
              View Plans
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({ name, price, description, features, current, actionLabel, onSelect, highlight, loading }: { name: string; price: string; description: string; features: string[]; current?: boolean; actionLabel: string; onSelect?: () => void; highlight?: boolean; loading?: boolean }) {
  return (
    <div className={`relative flex flex-col rounded-xl border ${
      highlight
        ? 'border-fuchsia-500/40 shadow-[0_0_0_1px_rgba(236,72,153,0.3),0_0_30px_-10px_rgba(236,72,153,0.5)]'
        : 'border-slate-800/70'
    } bg-gradient-to-br from-slate-900/70 to-slate-800/40 p-5`}>
      <div className="flex-1">
        <h3 className="text-slate-100 font-semibold tracking-wide">{name}</h3>
        <div className="mt-1 text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-fuchsia-200 to-sky-300">{price}</div>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
        <ul className="mt-4 space-y-2 text-xs text-slate-300">
          {features.map(f => (
            <li key={f} className="pl-3 relative">
              <span className="absolute left-0 top-1 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-fuchsia-400 to-sky-400" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5">
        <button
          disabled={current || !onSelect || loading}
          onClick={onSelect}
          className={`w-full inline-flex justify-center rounded-md px-4 py-2.5 text-xs font-medium tracking-wide transition focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:ring-offset-0 ${
            price.toLowerCase() === 'custom'
              ? 'border border-slate-700/70 text-slate-200 hover:border-fuchsia-500/40 hover:text-slate-100'
              : 'bg-gradient-to-r from-fuchsia-500 via-fuchsia-400 to-sky-500 text-slate-900 font-semibold shadow hover:brightness-110'
          } ${current ? 'opacity-60 cursor-default' : ''}`}
        >
          {loading ? 'Loading...' : actionLabel}
        </button>
      </div>
    </div>
  );
}
