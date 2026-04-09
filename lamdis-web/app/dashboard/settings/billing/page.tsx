import { getBearerSafe } from '@/lib/auth';
import React from 'react';
import BillingClient from './BillingClient';

export const dynamic = 'force-dynamic';

async function fetchMe(bearer: string) {
	const api = process.env.NEXT_PUBLIC_API_URL as string;
	if (!bearer) return null;
	const headers: HeadersInit = { Authorization: bearer };
	let meResp = await fetch(`${api}/me`, { headers, cache: 'no-store' });
	let meData: any = await meResp.json();
	if (!meResp.ok) return null;
	if (!meData?.orgs?.length) {
		await fetch(`${api}/me/bootstrap`, { method: 'POST', headers, cache: 'no-store' });
		meResp = await fetch(`${api}/me`, { headers, cache: 'no-store' });
		meData = await meResp.json();
	}
	return meData;
}

export default async function Page() {
	const bearer = await getBearerSafe();
	const meData = await fetchMe(bearer);
	const orgs: any[] = meData?.orgs || [];
	const activeOrg = orgs.find(o => o?.org?.stripeCustomerId) || orgs.find(o => !!o?.org?.currentPlan) || orgs[0];
const plan: string = activeOrg?.org?.currentPlan || 'starter';
const status: string | undefined = activeOrg?.org?.subscriptionStatus || (activeOrg ? 'free' : undefined);
			const orgId: string | undefined = activeOrg?.orgId || activeOrg?.org?._id;

	return (
		<div className="px-6 py-8 max-w-5xl mx-auto w-full">
			<div className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight text-slate-100">Billing</h1>
				<p className="mt-1 text-sm text-slate-400">View your current plan and manage subscription.</p>
			</div>
			{!bearer && (
				<div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-slate-300">
					<p>You must sign in to view billing information.</p>
					<a href="/api/auth/login" className="mt-4 inline-flex rounded-md bg-gradient-to-r from-fuchsia-500 via-fuchsia-400 to-sky-500 px-4 py-2 text-sm font-medium text-slate-900 shadow hover:brightness-110">Sign In</a>
				</div>
			)}
		      {bearer && (
			      <BillingClient plan={plan} status={status} orgId={orgId} />
			)}
		</div>
	);
}
