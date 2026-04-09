import 'dotenv/config';
import { z } from 'zod';

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  // PostgreSQL connection string
  DATABASE_URL: z.string().optional(),

  // ── Deployment mode ──────────────────────────────────────────────
  LAMDIS_DEPLOYMENT_MODE: z.enum(['cloud', 'self_hosted']).default('cloud'),
  LAMDIS_AUTH_MODE: z.enum(['auth0', 'oidc', 'saml', 'disabled']).default('auth0'),
  LAMDIS_ENTITLEMENTS_MODE: z.enum(['stripe', 'license_file', 'open']).default('stripe'),

  // ── Auth0 JWT verification (required when LAMDIS_AUTH_MODE=auth0) ──
  AUTH0_ISSUER: z.string().optional(),
  AUTH0_AUDIENCE: z.string().optional(),
  // Auth0 Management API (for Organizations)
  AUTH0_DOMAIN: z.string().optional(),
  AUTH0_MGMT_CLIENT_ID: z.string().optional(),
  AUTH0_MGMT_CLIENT_SECRET: z.string().optional(),
  AUTH0_DEFAULT_CONNECTION_ID: z.string().optional(),
  AUTH0_APP_CLIENT_ID: z.string().optional(),

  // ── OIDC configuration (required when LAMDIS_AUTH_MODE=oidc) ──
  OIDC_ISSUER: z.string().optional(),
  OIDC_AUDIENCE: z.string().optional(),
  OIDC_JWKS_URI: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_GROUP_CLAIM: z.string().default('groups'),
  OIDC_ROLE_MAP: z.string().optional(), // JSON string, e.g. '{"admins":"admin","qa":"member"}'

  // ── Self-hosted bootstrap ──
  LAMDIS_ADMIN_TOKEN: z.string().optional(),
  LAMDIS_BOOTSTRAP_FORCE: z.string().optional(),

  // ── License (required when LAMDIS_ENTITLEMENTS_MODE=license_file) ──
  LAMDIS_LICENSE_PATH: z.string().optional(),

  // ── Stripe (required when LAMDIS_ENTITLEMENTS_MODE=stripe) ──
  STRIPE_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  STRIPE_PRICE_INSIGHTS: z.string().optional(),
  STRIPE_PRICE_SUCCESS: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_SCALE: z.string().optional(),

  ENC_SECRET: z.string().optional(),
  INGEST_SECRET: z.string().optional(),
  WORKFLOW_URL: z.string().optional(),
  LAMDIS_SDK_API_KEY: z.string().optional(),
  LAMDIS_INGEST_URL: z.string().optional(),

  // ── Storage (file/media storage) ──
  STORAGE_MODE: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('./data/storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(), // for Minio compatibility

  // ── Workspaces ──
  WORKSPACE_ROOT: z.string().default('./data/workspaces'),
});

const EnvSchema = RawEnvSchema
  .refine(
    (v) => Boolean(v.DATABASE_URL),
    { message: 'Set DATABASE_URL in environment (PostgreSQL connection string)' }
  )
  .refine(
    (v) => v.LAMDIS_AUTH_MODE !== 'auth0' || (v.AUTH0_ISSUER && v.AUTH0_AUDIENCE),
    { message: 'AUTH0_ISSUER and AUTH0_AUDIENCE are required when LAMDIS_AUTH_MODE=auth0' }
  )
  .refine(
    (v) => v.LAMDIS_AUTH_MODE !== 'oidc' || v.OIDC_ISSUER,
    { message: 'OIDC_ISSUER is required when LAMDIS_AUTH_MODE=oidc' }
  )
  .refine(
    (v) => v.LAMDIS_ENTITLEMENTS_MODE !== 'stripe' || v.STRIPE_SECRET,
    { message: 'STRIPE_SECRET is required when LAMDIS_ENTITLEMENTS_MODE=stripe' }
  )
  .refine(
    (v) => v.LAMDIS_ENTITLEMENTS_MODE !== 'license_file' || v.LAMDIS_LICENSE_PATH,
    { message: 'LAMDIS_LICENSE_PATH is required when LAMDIS_ENTITLEMENTS_MODE=license_file' }
  )
  .transform((v) => ({
    NODE_ENV: v.NODE_ENV,
    PORT: v.PORT,
    HOST: v.HOST,
    DATABASE_URL: v.DATABASE_URL as string,
    // Deployment mode
    LAMDIS_DEPLOYMENT_MODE: v.LAMDIS_DEPLOYMENT_MODE,
    LAMDIS_AUTH_MODE: v.LAMDIS_AUTH_MODE,
    LAMDIS_ENTITLEMENTS_MODE: v.LAMDIS_ENTITLEMENTS_MODE,
    // Auth0 JWT verification
    AUTH0_ISSUER: v.AUTH0_ISSUER,
    AUTH0_AUDIENCE: v.AUTH0_AUDIENCE,
    // Auth0 Management API (for Organizations)
    AUTH0_DOMAIN: v.AUTH0_DOMAIN,
    AUTH0_MGMT_CLIENT_ID: v.AUTH0_MGMT_CLIENT_ID,
    AUTH0_MGMT_CLIENT_SECRET: v.AUTH0_MGMT_CLIENT_SECRET,
    AUTH0_DEFAULT_CONNECTION_ID: v.AUTH0_DEFAULT_CONNECTION_ID,
    AUTH0_APP_CLIENT_ID: v.AUTH0_APP_CLIENT_ID,
    // OIDC
    OIDC_ISSUER: v.OIDC_ISSUER,
    OIDC_AUDIENCE: v.OIDC_AUDIENCE,
    OIDC_JWKS_URI: v.OIDC_JWKS_URI,
    OIDC_CLIENT_ID: v.OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET: v.OIDC_CLIENT_SECRET,
    OIDC_GROUP_CLAIM: v.OIDC_GROUP_CLAIM,
    OIDC_ROLE_MAP: v.OIDC_ROLE_MAP,
    // Self-hosted bootstrap
    LAMDIS_ADMIN_TOKEN: v.LAMDIS_ADMIN_TOKEN,
    LAMDIS_BOOTSTRAP_FORCE: v.LAMDIS_BOOTSTRAP_FORCE,
    // License
    LAMDIS_LICENSE_PATH: v.LAMDIS_LICENSE_PATH,
    // Stripe
    STRIPE_SECRET: v.STRIPE_SECRET,
    STRIPE_WEBHOOK_SECRET: v.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_STARTER: v.STRIPE_PRICE_STARTER,
    STRIPE_PRICE_PRO: v.STRIPE_PRICE_PRO,
    STRIPE_PRICE_ENTERPRISE: v.STRIPE_PRICE_ENTERPRISE,
    STRIPE_PRICE_INSIGHTS: v.STRIPE_PRICE_INSIGHTS,
    STRIPE_PRICE_SUCCESS: v.STRIPE_PRICE_SUCCESS,
    STRIPE_PRICE_GROWTH: v.STRIPE_PRICE_GROWTH,
    STRIPE_PRICE_SCALE: v.STRIPE_PRICE_SCALE,
    ENC_SECRET: v.ENC_SECRET,
    INGEST_SECRET: v.INGEST_SECRET,
    WORKFLOW_URL: v.WORKFLOW_URL,
    LAMDIS_SDK_API_KEY: v.LAMDIS_SDK_API_KEY,
    LAMDIS_INGEST_URL: v.LAMDIS_INGEST_URL,
    // Storage
    STORAGE_MODE: v.STORAGE_MODE,
    LOCAL_STORAGE_PATH: v.LOCAL_STORAGE_PATH,
    S3_BUCKET: v.S3_BUCKET,
    S3_REGION: v.S3_REGION,
    S3_ENDPOINT: v.S3_ENDPOINT,
    // Workspaces
    WORKSPACE_ROOT: v.WORKSPACE_ROOT,
  }));

type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
