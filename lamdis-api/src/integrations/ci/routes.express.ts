/* Minimal Express registration helpers for CI endpoints. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TriggerRunRequestBody } from "./service.js";
import { getRunStatus, triggerRun, verifyBearerToken } from "./service.js";

export function registerCiRoutesExpress(app: any) {
  // POST /v1/integrations/ci/runs
  app.post("/v1/integrations/ci/runs", async (req: any, res: any) => {
    try {
      const principal = verifyBearerToken(req.headers?.authorization);
      if (!principal) return res.status(401).json({ error: "Unauthorized" });
      const body = (req.body || {}) as TriggerRunRequestBody;
      const result = await triggerRun(body, principal);
      res.status(200).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Failed to trigger run" });
    }
  });

  // GET /v1/integrations/ci/runs/:runId
  app.get("/v1/integrations/ci/runs/:runId", async (req: any, res: any) => {
    try {
      const principal = verifyBearerToken(req.headers?.authorization);
      if (!principal) return res.status(401).json({ error: "Unauthorized" });
      const runId = req.params?.runId;
      if (!runId) return res.status(400).json({ error: "Missing runId" });
      const result = await getRunStatus(runId);
      res.status(200).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Failed to fetch status" });
    }
  });
}

