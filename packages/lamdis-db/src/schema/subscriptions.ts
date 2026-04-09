import { pgTable, text, uuid, timestamp, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubId: text('stripe_sub_id'),
  status: text('status').default('trialing'), // 'active','trialing','past_due','canceled'
  currentPlan: text('current_plan'), // 'starter','insights','success','pro','enterprise'
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  seats: integer('seats').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('subscriptions_org_id_unique').on(t.orgId),
  index('subscriptions_stripe_customer_id_idx').on(t.stripeCustomerId),
  index('subscriptions_stripe_sub_id_idx').on(t.stripeSubId),
]);
