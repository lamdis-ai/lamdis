/* Developer API keys simple file-backed store and helpers. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash, randomBytes, randomUUID } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export type ApiKeyPublic = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string | null;
  scopes?: string[];
};

type ApiKeyStored = ApiKeyPublic & { hash: string; salt: string };

const DATA_DIR = join(process.cwd(), "lamdis-api", ".data");
const KEY_STORE = join(DATA_DIR, "api-keys.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll(): ApiKeyStored[] {
  try {
    const raw = readFileSync(KEY_STORE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveAll(items: ApiKeyStored[]) {
  ensureDataDir();
  writeFileSync(KEY_STORE, JSON.stringify(items, null, 2));
}

export function listApiKeys(): ApiKeyPublic[] {
  return loadAll().map(({ hash, salt, ...pub }) => pub);
}

export function createApiKey(name: string, scopes: string[] = ["runs:*"]) {
  const items = loadAll();
  const id = randomUUID();
  const secret = `lamdis_sk_${randomBytes(24).toString("base64url")}`;
  const salt = randomBytes(16).toString("base64url");
  const hash = createHash("sha256").update(secret + ":" + salt).digest("hex");
  const rec: ApiKeyStored = {
    id,
    name,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes,
    hash,
    salt,
  };
  items.unshift(rec);
  saveAll(items);
  const { hash: _h, salt: _s, ...pub } = rec as any;
  return { key: pub as ApiKeyPublic, secret };
}

export function revokeApiKey(id: string) {
  const items = loadAll();
  const next = items.filter((k) => k.id !== id);
  saveAll(next);
}

