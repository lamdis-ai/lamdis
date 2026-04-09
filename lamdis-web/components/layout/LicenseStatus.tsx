"use client";

import { useEffect, useState } from 'react';
import { useOrg } from '@/lib/orgContext';

const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';

interface LicenseState {
  tier: string;
  daysUntilExpiry?: number;
  usagePct?: number;
}

type StatusColor = 'green' | 'yellow' | 'red' | 'gray';

function getStatusColor(state: LicenseState | null): StatusColor {
  if (!state) return 'gray';
  if (state.daysUntilExpiry !== undefined && state.daysUntilExpiry < 0) return 'red';
  if (state.daysUntilExpiry !== undefined && state.daysUntilExpiry < 30) return 'yellow';
  if (state.usagePct !== undefined && state.usagePct >= 100) return 'red';
  if (state.usagePct !== undefined && state.usagePct >= 80) return 'yellow';
  return 'green';
}

const colorClasses: Record<StatusColor, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-500',
};

const labelMap: Record<StatusColor, string> = {
  green: 'License valid',
  yellow: 'Attention needed',
  red: 'License issue',
  gray: 'Unlicensed',
};

export default function LicenseStatus() {
  const { currentOrg } = useOrg();
  const [state, setState] = useState<LicenseState | null>(null);

  useEffect(() => {
    if (!isSelfHosted || !currentOrg?.orgId) return;
    (async () => {
      try {
        const r = await fetch(`/api/license/status?orgId=${encodeURIComponent(currentOrg.orgId)}`, { cache: 'no-store' });
        if (r.ok) {
          const data = await r.json();
          const maxUsagePct = Math.max(
            data.limits?.max_users > 0 ? ((data.usage?.active_users ?? 0) / data.limits.max_users) * 100 : 0,
            data.limits?.max_runs_per_month > 0 ? ((data.usage?.runs_this_month ?? 0) / data.limits.max_runs_per_month) * 100 : 0,
          );
          setState({
            tier: data.tier,
            daysUntilExpiry: data.daysUntilExpiry,
            usagePct: Math.round(maxUsagePct),
          });
        }
      } catch {}
    })();
  }, [currentOrg?.orgId]);

  if (!isSelfHosted) return null;

  const color = getStatusColor(state);
  const label = state
    ? `${state.tier.charAt(0).toUpperCase() + state.tier.slice(1)} — ${labelMap[color]}`
    : labelMap[color];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400">
      <span className={`inline-block h-2 w-2 rounded-full ${colorClasses[color]}`} />
      <span className="truncate">{label}</span>
    </div>
  );
}
