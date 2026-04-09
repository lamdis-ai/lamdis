/* Express helpers for Developer API key routes. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createApiKey, listApiKeys, revokeApiKey } from "./service.js";

export function registerDeveloperKeyRoutesExpress(app: any) {
  app.get("/v1/developer/api-keys", async (_req: any, res: any) => {
    try {
      const items = listApiKeys();
      res.status(200).json({ items });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Failed to list keys" });
    }
  });

  app.post("/v1/developer/api-keys", async (req: any, res: any) => {
    try {
      const { name, scopes } = (req.body || {}) as { name?: string; scopes?: string[] };
      if (!name || !name.trim()) return res.status(400).json({ error: "Missing name" });
      const result = createApiKey(name.trim(), Array.isArray(scopes) ? scopes : undefined);
      res.status(200).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Failed to create key" });
    }
  });

  app.delete("/v1/developer/api-keys/:id", async (req: any, res: any) => {
    try {
      const id = req.params?.id;
      if (!id) return res.status(400).json({ error: "Missing id" });
      revokeApiKey(id);
      res.status(204).send();
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Failed to revoke key" });
    }
  });
}

