"use client";

const isSelfHosted = process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE === 'self_hosted';

export default function CommunityBanner({ tier }: { tier?: string }) {
  if (!isSelfHosted || tier !== 'community') return null;

  return (
    <div className="w-full bg-gradient-to-r from-fuchsia-900/40 to-sky-900/40 border-b border-fuchsia-500/20 px-4 py-2 text-center text-sm text-slate-300">
      Powered by Lamdis Community Edition{' '}
      <span className="text-slate-500 mx-1">&mdash;</span>{' '}
      <a
        href="https://lamdis.ai/pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="text-fuchsia-300 hover:text-fuchsia-200 underline underline-offset-2"
      >
        Upgrade for SSO, unlimited users, and priority support
      </a>
    </div>
  );
}
