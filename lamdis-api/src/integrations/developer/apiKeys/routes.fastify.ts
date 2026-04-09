/* Fastify helpers for Developer API key routes. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FastifyInstance } from "fastify";
import { createApiKey, listApiKeys, revokeApiKey } from "./service.js";

export async function registerDeveloperKeyRoutesFastify(fastify: FastifyInstance | any) {
  fastify.get("/v1/developer/api-keys", async (_request: any, reply: any) => {
    try {
      const items = listApiKeys();
      reply.code(200).send({ items });
    } catch (e: any) {
      reply.code(400).send({ error: e?.message || "Failed to list keys" });
    }
  });

  fastify.post("/v1/developer/api-keys", async (request: any, reply: any) => {
    try {
      const { name, scopes } = (request.body || {}) as { name?: string; scopes?: string[] };
      if (!name || !name.trim()) return reply.code(400).send({ error: "Missing name" });
      const result = createApiKey(name.trim(), Array.isArray(scopes) ? scopes : undefined);
      reply.code(200).send(result);
    } catch (e: any) {
      reply.code(400).send({ error: e?.message || "Failed to create key" });
    }
  });

  fastify.delete("/v1/developer/api-keys/:id", async (request: any, reply: any) => {
    try {
      const id = request.params?.id;
      if (!id) return reply.code(400).send({ error: "Missing id" });
      revokeApiKey(id);
      reply.code(204).send();
    } catch (e: any) {
      reply.code(400).send({ error: e?.message || "Failed to revoke key" });
    }
  });
}

