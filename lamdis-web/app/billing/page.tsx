import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Deprecated: Stripe now returns directly to /dashboard/settings/billing
export default function BillingRemoved() {
  notFound();
}
