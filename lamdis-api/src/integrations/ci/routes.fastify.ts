/* Minimal Fastify registration helpers for CI endpoints. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FastifyInstance } from "fastify";
import type { TriggerRunRequestBody } from "./service.js";
import { getRunStatus, triggerRun, verifyBearerToken } from "./service.js";

export async function registerCiRoutesFastify(fastify: FastifyInstance | any) {
  fastify.post("/v1/integrations/ci/runs", async (request: any, reply: any) => {
    const principal = verifyBearerToken(request.headers?.authorization);
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const body = (request.body || {}) as TriggerRunRequestBody;
    try {
      const result = await triggerRun(body, principal);
      reply.code(200).send(result);
    } catch (e: any) {
      reply.code(400).send({ error: e?.message || "Failed to trigger run" });
    }
  });

  fastify.get("/v1/integrations/ci/runs/:runId", async (request: any, reply: any) => {
    const principal = verifyBearerToken(request.headers?.authorization);
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const runId = request.params?.runId;
    if (!runId) return reply.code(400).send({ error: "Missing runId" });
    try {
      const result = await getRunStatus(runId);
      reply.code(200).send(result);
    } catch (e: any) {
      reply.code(400).send({ error: e?.message || "Failed to fetch status" });
    }
  });
}

