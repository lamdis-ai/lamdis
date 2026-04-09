#!/usr/bin/env node

/**
 * Lamdis License Generator
 *
 * Generates a signed JWT license file for self-hosted customers.
 *
 * Usage:
 *   node scripts/generate-license.mjs \
 *     --customer "Acme Corp" \
 *     --tier enterprise \
 *     --max-users 100 \
 *     --max-runs 50000 \
 *     --max-conversations 100000 \
 *     --expires "2027-03-01" \
 *     --out license.jwt
 *
 * Required: LAMDIS_LICENSE_PRIVATE_KEY env var (RS256 PEM) or --key-file path
 */

import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Argument Parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (args.help) {
  console.log(`
Lamdis License Generator

Usage:
  node generate-license.mjs [options]

Options:
  --customer <name>           Customer name (required)
  --customer-id <id>          Customer ID (default: auto-generated)
  --tier <tier>               License tier (required)
                              Options: community, nonprofit, design_partner,
                                       demo, team, business, enterprise
  --max-users <n>             Max users (-1 = unlimited, default: tier default)
  --max-runs <n>              Max runs/month (-1 = unlimited)
  --max-conversations <n>     Max conversations/month (-1 = unlimited)
  --max-organizations <n>     Max organizations (default: 1)
  --expires <date>            Expiration date (ISO 8601, required)
  --duration <days>           Alternative: expires in N days from now
  --features <json>           JSON object of feature overrides
  --key-file <path>           Path to RS256 private key PEM file
  --out <path>                Output file path (default: license.jwt)
  --help                      Show this help
`);
  process.exit(0);
}

// ── Tier Defaults ────────────────────────────────────────────────────────────

const TIER_DEFAULTS = {
  community: {
    limits: { max_users: 5, max_runs_per_month: 200, max_conversations_per_month: 500, max_organizations: 1 },
    features: { sso: false, scim: false, advanced_rbac: false, custom_retention: false, audit_export: false, evidence_vault: false },
  },
  nonprofit: {
    limits: { max_users: 25, max_runs_per_month: 2000, max_conversations_per_month: 5000, max_organizations: 3 },
    features: { sso: true, scim: false, advanced_rbac: false, custom_retention: false, audit_export: true, evidence_vault: false },
  },
  design_partner: {
    limits: { max_users: 50, max_runs_per_month: 10000, max_conversations_per_month: 25000, max_organizations: 5 },
    features: { sso: true, scim: true, advanced_rbac: true, custom_retention: true, audit_export: true, evidence_vault: true },
  },
  demo: {
    limits: { max_users: 10, max_runs_per_month: 500, max_conversations_per_month: 1000, max_organizations: 1 },
    features: { sso: true, scim: false, advanced_rbac: true, custom_retention: false, audit_export: true, evidence_vault: true },
  },
  team: {
    limits: { max_users: 20, max_runs_per_month: 5000, max_conversations_per_month: 10000, max_organizations: 2 },
    features: { sso: false, scim: false, advanced_rbac: false, custom_retention: false, audit_export: false, evidence_vault: false },
  },
  business: {
    limits: { max_users: 100, max_runs_per_month: 25000, max_conversations_per_month: 50000, max_organizations: 5 },
    features: { sso: true, scim: false, advanced_rbac: true, custom_retention: false, audit_export: true, evidence_vault: false },
  },
  enterprise: {
    limits: { max_users: -1, max_runs_per_month: -1, max_conversations_per_month: -1, max_organizations: -1 },
    features: { sso: true, scim: true, advanced_rbac: true, custom_retention: true, audit_export: true, evidence_vault: true },
  },
};

// ── Validation ───────────────────────────────────────────────────────────────

const customer = args.customer;
const tier = args.tier;

if (!customer) {
  console.error('Error: --customer is required');
  process.exit(1);
}

if (!tier || !TIER_DEFAULTS[tier]) {
  console.error(`Error: --tier must be one of: ${Object.keys(TIER_DEFAULTS).join(', ')}`);
  process.exit(1);
}

// Expiration
let exp;
if (args.expires) {
  exp = Math.floor(new Date(args.expires).getTime() / 1000);
  if (isNaN(exp)) {
    console.error('Error: --expires must be a valid ISO 8601 date');
    process.exit(1);
  }
} else if (args.duration) {
  const days = parseInt(args.duration, 10);
  if (isNaN(days) || days <= 0) {
    console.error('Error: --duration must be a positive number of days');
    process.exit(1);
  }
  exp = Math.floor(Date.now() / 1000) + days * 86400;
} else {
  console.error('Error: --expires or --duration is required');
  process.exit(1);
}

// Private key
let privateKey;
if (args['key-file']) {
  try {
    privateKey = readFileSync(resolve(args['key-file']), 'utf-8');
  } catch (e) {
    console.error(`Error: Cannot read key file: ${e.message}`);
    process.exit(1);
  }
} else if (process.env.LAMDIS_LICENSE_PRIVATE_KEY) {
  privateKey = process.env.LAMDIS_LICENSE_PRIVATE_KEY;
} else {
  console.error('Error: Provide --key-file or set LAMDIS_LICENSE_PRIVATE_KEY env var');
  process.exit(1);
}

// ── Build Payload ────────────────────────────────────────────────────────────

const defaults = TIER_DEFAULTS[tier];
const customerId = args['customer-id'] || `cust_${Date.now().toString(36)}`;

const limits = {
  max_users: args['max-users'] !== undefined ? parseInt(args['max-users'], 10) : defaults.limits.max_users,
  max_runs_per_month: args['max-runs'] !== undefined ? parseInt(args['max-runs'], 10) : defaults.limits.max_runs_per_month,
  max_conversations_per_month: args['max-conversations'] !== undefined ? parseInt(args['max-conversations'], 10) : defaults.limits.max_conversations_per_month,
  max_organizations: args['max-organizations'] !== undefined ? parseInt(args['max-organizations'], 10) : defaults.limits.max_organizations,
};

let features = { ...defaults.features };
if (args.features) {
  try {
    const overrides = JSON.parse(args.features);
    features = { ...features, ...overrides };
  } catch {
    console.error('Error: --features must be valid JSON');
    process.exit(1);
  }
}

const now = Math.floor(Date.now() / 1000);

const payload = {
  iss: 'lamdis.ai',
  sub: customerId,
  iat: now,
  exp,
  customer,
  tier,
  limits,
  features,
};

// ── Sign JWT ─────────────────────────────────────────────────────────────────

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const header = { alg: 'RS256', typ: 'JWT' };
const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
const signingInput = `${headerB64}.${payloadB64}`;

const signer = createSign('RSA-SHA256');
signer.update(signingInput);
signer.end();

let signature;
try {
  signature = base64url(signer.sign(privateKey));
} catch (e) {
  console.error(`Error: Failed to sign JWT — ${e.message}`);
  console.error('Make sure the private key is a valid RS256 PEM key.');
  process.exit(1);
}

const jwt = `${signingInput}.${signature}`;

// ── Output ───────────────────────────────────────────────────────────────────

const outPath = args.out || 'license.jwt';
writeFileSync(resolve(outPath), jwt, 'utf-8');

const expiresDate = new Date(exp * 1000).toISOString().split('T')[0];
const daysUntilExpiry = Math.floor((exp - now) / 86400);

console.log('License generated successfully!');
console.log('');
console.log(`  Customer:    ${customer}`);
console.log(`  Customer ID: ${customerId}`);
console.log(`  Tier:        ${tier}`);
console.log(`  Expires:     ${expiresDate} (${daysUntilExpiry} days)`);
console.log(`  Max Users:   ${limits.max_users === -1 ? 'Unlimited' : limits.max_users}`);
console.log(`  Max Runs:    ${limits.max_runs_per_month === -1 ? 'Unlimited' : limits.max_runs_per_month + '/month'}`);
console.log(`  Features:    ${Object.entries(features).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
console.log(`  Output:      ${resolve(outPath)}`);
