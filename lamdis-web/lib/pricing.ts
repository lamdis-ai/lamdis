/**
 * Pricing Configuration for Lamdis - V2 Pricing (February 2026)
 *
 * RUNS (AI Testing / Shift-Left Testing):
 *    - Free: 200 runs/mo, 1 Builder, 1 env
 *    - Pro ($399/mo): 5k runs, 5 Builders, unlimited envs, CI
 *    - Team ($1,250/mo): 25k runs, 10 Builders, versioned suites
 *    - Business ($3,000/mo): 150k runs, 25 Builders, policy packs
 *    - Enterprise ($7,500/mo): 500k runs, SSO, dedicated support
 *
 * Overage Pricing (per 1k units):
 * - Runs Pro: $30, Team: $18, Business: $12, Enterprise: custom
 *
 * Retention Add-ons:
 * - 2-year: +20%, 5-year: +45%, 7-year: +65%
 */

// ============================================================================
// PLAN LIMITS
// ============================================================================

export interface RunsPlanLimits {
  runsPerMonth: number;
  environments: number;
  retention: number; // days
  builders: number;
  // Feature flags
  ciIntegration: boolean;
  versionedSuites: boolean;
  policyPacks: boolean;
  ssoSaml: boolean;
  dedicatedSupport: boolean;
  privateRunners: boolean;
}

// RUNS Plan Limits
export const RUNS_PLAN_LIMITS: Record<string, RunsPlanLimits> = {
  // New V2 Plans
  'runs_free': {
    runsPerMonth: 200,
    environments: 1,
    retention: 7,
    builders: 1,
    ciIntegration: false,
    versionedSuites: false,
    policyPacks: false,
    ssoSaml: false,
    dedicatedSupport: false,
    privateRunners: false,
  },
  'runs_pro': {
    runsPerMonth: 5000,
    environments: Infinity,
    retention: 30,
    builders: 5,
    ciIntegration: true,
    versionedSuites: false,
    policyPacks: false,
    ssoSaml: false,
    dedicatedSupport: false,
    privateRunners: false,
  },
  'runs_team': {
    runsPerMonth: 25000,
    environments: Infinity,
    retention: 90,
    builders: 10,
    ciIntegration: true,
    versionedSuites: true,
    policyPacks: false,
    ssoSaml: false,
    dedicatedSupport: false,
    privateRunners: false,
  },
  'runs_business': {
    runsPerMonth: 150000,
    environments: Infinity,
    retention: 365,
    builders: 25,
    ciIntegration: true,
    versionedSuites: true,
    policyPacks: true,
    ssoSaml: false,
    dedicatedSupport: false,
    privateRunners: false,
  },
  'runs_enterprise': {
    runsPerMonth: 500000,
    environments: Infinity,
    retention: Infinity,
    builders: Infinity,
    ciIntegration: true,
    versionedSuites: true,
    policyPacks: true,
    ssoSaml: true,
    dedicatedSupport: true,
    privateRunners: true,
  },
  // Legacy mappings
  'starter': {
    runsPerMonth: 100,
    environments: 1,
    retention: 7,
    builders: 1,
    ciIntegration: false,
    versionedSuites: false,
    policyPacks: false,
    ssoSaml: false,
    dedicatedSupport: false,
    privateRunners: false,
  },
  'pro': {
    runsPerMonth: 2000,
    environments: Infinity,
    retention: 30,
    builders: 10,
    ciIntegration: true,
    versionedSuites: false,
    policyPacks: false,
    ssoSaml: false,
    dedicatedSupport: false,
    privateRunners: false,
  },
  'enterprise': {
    runsPerMonth: Infinity,
    environments: Infinity,
    retention: Infinity,
    builders: Infinity,
    ciIntegration: true,
    versionedSuites: true,
    policyPacks: true,
    ssoSaml: true,
    dedicatedSupport: true,
    privateRunners: true,
  },
  'free_trial': {
    runsPerMonth: 200,
    environments: 1,
    retention: 7,
    builders: 5,
    ciIntegration: true,
    versionedSuites: false,
    policyPacks: false,
    ssoSaml: false,
    dedicatedSupport: false,
    privateRunners: false,
  },
};

// Legacy PLAN_LIMITS for backward compatibility
export const PLAN_LIMITS = {
  // Runs plans (legacy format)
  'starter': { runsPerMonth: 100, environments: 1, retention: 7, seats: 1 },
  'pro': { runsPerMonth: 2000, environments: Infinity, retention: 30, seats: 10 },
  'enterprise': { runsPerMonth: Infinity, environments: Infinity, retention: Infinity, seats: Infinity },
  // New Runs V2 plans
  'runs_free': { runsPerMonth: 200, environments: 1, retention: 7, seats: 1 },
  'runs_pro': { runsPerMonth: 5000, environments: Infinity, retention: 30, seats: 5 },
  'runs_team': { runsPerMonth: 25000, environments: Infinity, retention: 90, seats: 10 },
  'runs_business': { runsPerMonth: 150000, environments: Infinity, retention: 365, seats: 25 },
  'runs_enterprise': { runsPerMonth: 500000, environments: Infinity, retention: Infinity, seats: Infinity },
  // Legacy mappings
  'build': { runsPerMonth: 100, environments: 1, retention: 7, seats: 1 },
  'insights': { runsPerMonth: 500, environments: 3, retention: 30, seats: 3 },
  'growth': { runsPerMonth: 2000, environments: 10, retention: 30, seats: 5 },
  'scale': { runsPerMonth: 10000, environments: Infinity, retention: 90, seats: 10 },
  'team': { runsPerMonth: 5000, environments: Infinity, retention: 90, seats: 10 },
  'business': { runsPerMonth: 20000, environments: Infinity, retention: 365, seats: 20 },
  'free_trial': { runsPerMonth: 200, environments: 1, retention: 7, trialDays: 14, seats: 5 },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export function getPlanLimit(plan: string | null | undefined): typeof PLAN_LIMITS[PlanKey] {
  if (!plan) return PLAN_LIMITS.starter;
  const normalized = plan.toLowerCase().replace(/[-\s]/g, '_');
  return (PLAN_LIMITS as any)[normalized] || PLAN_LIMITS.starter;
}

export function getRunsPlanLimits(plan: string | null | undefined): RunsPlanLimits {
  if (!plan) return RUNS_PLAN_LIMITS.runs_free;
  const normalized = plan.toLowerCase().replace(/[-\s]/g, '_');
  return RUNS_PLAN_LIMITS[normalized] || RUNS_PLAN_LIMITS.runs_free;
}

/**
 * Calculate total seats for an org based on their Runs plan
 */
export function getTotalSeats(runsPlan: string | null | undefined): number {
  const runsLimits = getPlanLimit(runsPlan);
  const runsSeats = (runsLimits as any).seats ?? 1;
  return runsSeats;
}

/**
 * Get builder seat limits for a given runs plan
 */
export function getRunsBuilderLimit(plan: string | null | undefined): number {
  const limits = getRunsPlanLimits(plan);
  return limits.builders;
}

// ============================================================================
// OVERAGE PRICING
// ============================================================================

export interface OveragePricing {
  per1kUnits: number; // Cost per 1,000 additional units
  perUnit: number; // Cost per single unit (calculated)
}

export const RUNS_OVERAGE_PRICING: Record<string, OveragePricing> = {
  'runs_pro': { per1kUnits: 30, perUnit: 0.03 },
  'runs_team': { per1kUnits: 18, perUnit: 0.018 },
  'runs_business': { per1kUnits: 12, perUnit: 0.012 },
  'runs_enterprise': { per1kUnits: 0, perUnit: 0 }, // Custom/committed
};

// ============================================================================
// RETENTION ADD-ONS
// ============================================================================

export const RETENTION_ADDONS = {
  '2year': { years: 2, percentageIncrease: 20 },
  '5year': { years: 5, percentageIncrease: 45 },
  '7year': { years: 7, percentageIncrease: 65 },
} as const;

// ============================================================================
// STRIPE PRICE IDS
// ============================================================================

// These will be populated after running setup-new-pricing.mjs
export const STRIPE_PRICE_IDS = {
  // Runs Plans
  runs_pro: 'price_runs_pro_placeholder',
  runs_team: 'price_runs_team_placeholder',
  runs_business: 'price_runs_business_placeholder',
  runs_enterprise: 'price_runs_enterprise_placeholder',
  runs_enterprise_annual: 'price_runs_enterprise_annual_placeholder',
  
  // Legacy (still active)
  pro: 'price_1SwZrfLe8gsAwSLBL5CbqdWD',
} as const;

// Plan to Stripe price ID mapping
export const STRIPE_PRICE_MAP: Record<string, string | undefined> = {
  // New V2 Plans
  'runs_pro': STRIPE_PRICE_IDS.runs_pro,
  'runs_team': STRIPE_PRICE_IDS.runs_team,
  'runs_business': STRIPE_PRICE_IDS.runs_business,
  'runs_enterprise': STRIPE_PRICE_IDS.runs_enterprise,
  // Legacy mappings
  'pro': STRIPE_PRICE_IDS.pro,
  // Free plans don't have Stripe prices
  'runs_free': undefined,
  'starter': undefined,
  'enterprise': undefined, // Custom pricing
};

// ============================================================================
// PRICING UI CONFIGURATIONS
// ============================================================================

export interface RunsPricingPlan {
  key: string;
  name: string;
  price: string;
  period: string;
  description: string;
  runs: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted: boolean;
  stripePriceId?: string;
  isFree?: boolean;
  isHidden?: boolean;
  annualCommit?: boolean;
}

// Runs pricing plans for public display
// Show: Free, Pro, Business, Enterprise (Contact)
// Hidden: Team
export const RUNS_PRICING_PLANS: RunsPricingPlan[] = [
  {
    key: 'runs_free',
    name: 'Free',
    price: 'Free',
    period: '',
    description: 'Get started with AI testing',
    runs: '200 runs/month',
    features: [
      '1 Builder seat',
      'Suite/test editor (YAML + UI)',
      'Personas and scenarios',
      '1 environment',
      'Basic assertions',
      '7 day retention',
      'Community support',
    ],
    cta: 'Get Started',
    ctaHref: '/dashboard',
    highlighted: false,
    isFree: true,
  },
  {
    key: 'runs_pro',
    name: 'Pro',
    price: '$399',
    period: '/month',
    description: 'For development teams',
    runs: '5,000 runs/month',
    features: [
      '5 Builder seats',
      'Everything in Free',
      'Unlimited environments',
      'CI integrations',
      'Judge rubrics + thresholds',
      '30 day retention',
      'Email support',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/dashboard',
    highlighted: true,
    stripePriceId: STRIPE_PRICE_IDS.runs_pro,
  },
  {
    key: 'runs_team',
    name: 'Team',
    price: '$1,250',
    period: '/month',
    description: 'For scaling teams',
    runs: '25,000 runs/month',
    features: [
      '10 Builder seats',
      'Everything in Pro',
      'Versioned test suites + approvals',
      '90 day retention',
      'Onboarding session',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/dashboard',
    highlighted: false,
    stripePriceId: STRIPE_PRICE_IDS.runs_team,
    isHidden: true,
  },
  {
    key: 'runs_business',
    name: 'Business',
    price: '$3,000',
    period: '/month',
    description: 'For enterprise governance',
    runs: '150,000 runs/month',
    features: [
      '25 Builder seats',
      'Everything in Pro',
      'Policy packs + org templates',
      'Advanced analytics & gating',
      '1 year retention',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/dashboard',
    highlighted: false,
    stripePriceId: STRIPE_PRICE_IDS.runs_business,
  },
  {
    key: 'runs_enterprise',
    name: 'Enterprise',
    price: 'Starts at $7,500',
    period: '/month',
    description: 'For large organizations',
    runs: '500,000+ runs/month',
    features: [
      'Unlimited Builder seats',
      'Everything in Business',
      'SSO/SAML + SCIM',
      'Audit logs + workspace controls',
      'Private runners / VPC options',
      'Dedicated support + SLA',
    ],
    cta: 'Contact Sales',
    ctaHref: '#contact',
    highlighted: false,
    annualCommit: true,
  },
];

// ============================================================================
// PLAN LABELS
// ============================================================================

export const PLAN_LABELS: Record<string, string> = {
  // Runs V2
  'runs_free': 'Free',
  'runs_pro': 'Pro',
  'runs_team': 'Team',
  'runs_business': 'Business',
  'runs_enterprise': 'Enterprise',
  // Legacy
  'starter': 'Starter (Free)',
  'free_trial': 'Free Trial',
  'pro': 'Pro',
  'enterprise': 'Enterprise',
  'build': 'Build',
  'insights': 'Insights',
  'growth': 'Growth',
  'scale': 'Scale',
  'team': 'Team',
  'business': 'Business',
  'success': 'Scale',
  // V3 Unified
  'cloud_community': 'Community (Free)',
  'cloud_v3': 'Cloud',
  'cloud_enterprise': 'Enterprise',
  'selfhosted_community': 'Self-Hosted Community',
  'selfhosted_standard': 'Self-Hosted Standard',
  'selfhosted_professional': 'Self-Hosted Professional',
  'selfhosted_enterprise': 'Self-Hosted Enterprise',
};

export function getPlanLabel(plan: string | null | undefined): string {
  if (!plan) return 'Free';
  return PLAN_LABELS[plan.toLowerCase()] || plan;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Check if a plan is a free tier
export function isFreePlan(plan: string | null | undefined): boolean {
  if (!plan) return true;
  const normalized = plan.toLowerCase();
  return (
    normalized === 'starter' ||
    normalized === 'runs_free' ||
    normalized === 'cloud_community' ||
    normalized === 'selfhosted_community' ||
    normalized === 'free_trial' ||
    normalized === 'build'
  );
}

// Check if plan requires payment
export function isPaidPlan(plan: string | null | undefined): boolean {
  return !isFreePlan(plan);
}

// Check if plan is an enterprise tier
export function isEnterprisePlan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  const normalized = plan.toLowerCase();
  return (
    normalized.includes('enterprise') ||
    normalized === 'scale' ||
    normalized === 'success'
  );
}

// Get visible pricing plans (excluding hidden ones)
export function getVisibleRunsPlans(): RunsPricingPlan[] {
  return RUNS_PRICING_PLANS.filter(plan => !plan.isHidden);
}

// Get all pricing plans (including hidden)
export function getAllRunsPlans(): RunsPricingPlan[] {
  return RUNS_PRICING_PLANS;
}

export function getRunsPlanByVolume(runsPerMonth: number): RunsPricingPlan | undefined {
  if (runsPerMonth <= 200) return RUNS_PRICING_PLANS.find(p => p.key === 'runs_free');
  if (runsPerMonth <= 5000) return RUNS_PRICING_PLANS.find(p => p.key === 'runs_pro');
  if (runsPerMonth <= 25000) return RUNS_PRICING_PLANS.find(p => p.key === 'runs_team');
  if (runsPerMonth <= 150000) return RUNS_PRICING_PLANS.find(p => p.key === 'runs_business');
  return RUNS_PRICING_PLANS.find(p => p.key === 'runs_enterprise');
}

// Volume tiers for slider component
export const RUNS_VOLUME_TIERS = [
  { label: '200', value: 200, plan: 'runs_free' },
  { label: '5k', value: 5000, plan: 'runs_pro' },
  { label: '25k', value: 25000, plan: 'runs_team' },
  { label: '150k', value: 150000, plan: 'runs_business' },
  { label: '500k', value: 500000, plan: 'runs_enterprise' },
];

// ============================================================================
// V3 UNIFIED PRICING (March 2026)
// ============================================================================

export function isV3Plan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  return plan.startsWith('cloud_') || plan.startsWith('selfhosted_');
}

export const CLOUD_V3_USAGE_PRICING = {
  perRun: 0.075,
  per1kRuns: 75,
  platformFeeMonthly: 500,
  platformFeeAnnual: 5400,
} as const;

export const CLOUD_V3_RETENTION_ADDONS = {
  '90day': { days: 90, monthlyPrice: 0, label: '90 days (included)' },
  '1year': { days: 365, monthlyPrice: 200, label: '1 year (+$200/mo)' },
  '2year': { days: 730, monthlyPrice: 400, label: '2 years (+$400/mo)' },
  '5year': { days: 1825, monthlyPrice: 750, label: '5 years (+$750/mo)' },
} as const;

export const V3_PLAN_LABELS: Record<string, string> = {
  'cloud_community': 'Community (Free)',
  'cloud_v3': 'Cloud',
  'cloud_enterprise': 'Enterprise',
  'selfhosted_community': 'Self-Hosted Community',
  'selfhosted_standard': 'Self-Hosted Standard',
  'selfhosted_professional': 'Self-Hosted Professional',
  'selfhosted_enterprise': 'Self-Hosted Enterprise',
};

