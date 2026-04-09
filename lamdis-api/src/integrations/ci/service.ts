/*
 CI/CD run orchestration service for lamdis-api.
 - Triggers runs via lamdis-runs over HTTP (configurable by env LAMDIS_RUNS_URL)
 - Exposes minimal types shared by route adapters
 - Does not register routes; see routes.* files for Express/Fastify helpers
*/

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash, randomBytes, randomUUID } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface TriggerRunRequestBody {
  suiteSelector?: { slugs?: string[] };
  target?: { type?: string; baseUrl?: string; auth?: Record<string, any> };
  source?: {
    provider?: string;
    repository?: string;
    commit?: string;
    pullRequest?: number;
    branch?: string;
  };
  callback?: { url?: string; secret?: string };
  wait?: boolean;
  labels?: Record<string, string>;
}

export interface TriggerRunResponseBody {
  runId: string;
  status: RunStatus;
  dashboardUrl?: string;
}

export interface RunSummary {
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
}

export interface RunStatusResponseBody {
  runId: string;
  status: RunStatus;
  summary?: RunSummary;
  dashboardUrl?: string;
}

// Simple API key storage for dev. Replace with DB-backed store in production.
export type ApiKeyRecord = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string | null;
  scopes?: string[];
  hash: string; // salted sha256
  salt: string;
};

const DATA_DIR = join(process.cwd(), "lamdis-api", ".data");
const KEY_STORE = join(DATA_DIR, "api-keys.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadKeys(): ApiKeyRecord[] {
  try {
    const raw = readFileSync(KEY_STORE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveKeys(items: ApiKeyRecord[]) {
  ensureDataDir();
  writeFileSync(KEY_STORE, JSON.stringify(items, null, 2));
}

export function createApiKey(name: string, scopes: string[] = ["runs:*"]) {
  const items = loadKeys();
  const id = randomUUID();
  const secret = `lamdis_sk_${randomBytes(24).toString("base64url")}`;
  const salt = randomBytes(16).toString("base64url");
  const hash = createHash("sha256").update(secret + ":" + salt).digest("hex");
  const rec: ApiKeyRecord = {
    id,
    name,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes,
    hash,
    salt,
  };
  items.unshift(rec);
  saveKeys(items);
  return { key: rec, secret };
}

export function listApiKeys() {
  return loadKeys().map(({ hash, salt, ...rest }) => rest);
}

export function revokeApiKey(id: string) {
  const items = loadKeys();
  const next = items.filter((k) => k.id !== id);
  saveKeys(next);
}

export function verifyBearerToken(authHeader?: string): { apiKeyId: string } | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  // Allow a single fallback key from env for quick testing
  const envKey = process.env.LAMDIS_API_KEY;
  if (envKey && envKey === token) return { apiKeyId: "env" };

  const items = loadKeys();
  for (const rec of items) {
    const hash = createHash("sha256").update(token + ":" + rec.salt).digest("hex");
    if (hash === rec.hash) {
      // update lastUsedAt
      rec.lastUsedAt = new Date().toISOString();
      saveKeys(items);
      return { apiKeyId: rec.id };
    }
  }
  return null;
}

function ensureFetch(): typeof fetch {
  if (typeof fetch !== "undefined") return fetch;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFetch = require("node-fetch");
  return (nodeFetch.default || nodeFetch) as typeof fetch;
}

const RUNS_URL = (process.env.LAMDIS_RUNS_URL || "").replace(/\/$/, "");
const DASHBOARD_BASE = (process.env.LAMDIS_DASHBOARD_URL || process.env.NEXT_PUBLIC_LAMDIS_WEB_URL || "").replace(/\/$/, "");
const API_BASE = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");

export async function triggerRun(
  payload: TriggerRunRequestBody,
  principal: { apiKeyId: string }
): Promise<TriggerRunResponseBody> {
  const f = ensureFetch();
  // Map incoming payload to existing /ci/run contract
  // Expect suiteId under labels or explicit; otherwise reject
  // Preferred: payload.labels?.suiteId or payload as direct suiteId via payload.target?.suiteId (flexible for now)
  const suiteId = (payload as any).suiteId || (payload as any)?.labels?.suiteId || (payload as any)?.target?.suiteId;
  if (!suiteId) {
    throw new Error("suiteId is required (use body.suiteId)");
  }
  // Determine environment by either envId or connection key
  const envId = (payload as any).envId || (payload as any)?.target?.envId;
  const connKey = (payload as any).connectionKey || (payload as any)?.target?.connectionKey;
  const body: any = { suiteId };
  if (envId) body.envId = envId;
  if (connKey) body.env = { type: "connection", key: String(connKey) };
  if ((payload as any).tests) body.tests = (payload as any).tests;
  if (payload?.source) body.gitContext = {
    provider: payload.source.provider,
    repository: payload.source.repository,
    commit: payload.source.commit,
    pullRequest: payload.source.pullRequest,
    branch: payload.source.branch,
  };

  const res = await f(`${API_BASE}/ci/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || `Failed ${res.status}`);
  const data = (() => { try { return JSON.parse(txt); } catch { return {}; } })() as any;
  const runId = data.runId || data.id;
  const status = (data.status || "queued") as RunStatus;
  const dashboardUrl = data.url ? `${DASHBOARD_BASE}${data.url}` : (DASHBOARD_BASE ? `${DASHBOARD_BASE}/dashboard/runs/${runId}` : undefined);
  return { runId, status, dashboardUrl };
}

export async function getRunStatus(runId: string): Promise<RunStatusResponseBody> {
  const f = ensureFetch();
  const res = await f(`${API_BASE}/ci/result/${encodeURIComponent(runId)}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || `Failed ${res.status}`);
  const data = (() => { try { return JSON.parse(txt); } catch { return {}; } })() as any;
  const status: RunStatus = (data?.summary?.status || "running") as RunStatus;
  const totals = data?.summary?.totals;
  const summary = totals ? { total: Number(totals.passed||0)+Number(totals.failed||0)+Number(totals.skipped||0), passed: totals.passed, failed: totals.failed, skipped: totals.skipped } : undefined;
  const url = data?.url ? `${DASHBOARD_BASE}${data.url}` : (DASHBOARD_BASE ? `${DASHBOARD_BASE}/dashboard/runs/${runId}` : undefined);
  return { runId, status, summary, dashboardUrl: url };
}
