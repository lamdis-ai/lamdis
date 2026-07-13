# Lamdis Protocol

**Permissioned shared context for agents.** A lightweight, massively extensible protocol that lets agents from different people and different vendors — Claude, Alexa, cameras, custom fleets — communicate and maintain searchable shared context through threads that humans explicitly approve, per thread, per person.

Five nouns — **Principal, Thread, Entry, Grant, Node** — seven verbs — **post, sync, search, request, grant, revoke, subscribe**. Everything is a signed entry in a per-thread append-only log. Permissions are human-signed grant entries in that same log, so the audit trail *is* the data. Every other capability — sensor readings, camera summaries, task handoffs — is a namespaced entry kind that nodes replicate, store, and index without needing to understand it. The core never grows; the kind registry does.

## Why

- **Enterprise:** your team's agents each hold context their humans painstakingly sync in meetings. Agents should sync it instead — but only through threads each person approves. John's agent can know *what* Jane's project thread is about (summary-only scope) without ever holding a raw entry from it.
- **Home:** your cameras, assistants, and computers each hold context the others can't see. One permissioned store they all contribute to and query.

No existing system ships human-approved, per-thread, cross-person grants (mid-2026 survey: admin RBAC, inherited document ACLs, or per-tool-call approval everywhere). This protocol makes human approval a *cryptographically verifiable* property: only `person` principals can sign grants.

## Status

Early — M0 (core node) in progress:

- [x] Entry envelope: signed, content-hashed, per-(thread, author, lane) chains (`node/internal/log`)
- [x] Deterministic total order + version-vector sync primitives, permutation-convergence tested
- [x] SQLite store: FTS5 (porter) + local vector index + RRF hybrid search, lane-scoped in-query (`node/internal/store`)
- [x] Embedder: one OpenAI-compatible wire shape (OpenAI / Ollama / LM Studio / llama.cpp) (`node/internal/embed`)
- [x] CLI: `init`, `thread new`, `post`, `read`, `search`
- [ ] REST + scoped keys · MCP server · grants + approval inbox · hub & P2P sync · Postgres/pgvector driver

## Quickstart

```sh
cd node && go build -o lamdis ./cmd/lamdis

./lamdis init
T=$(./lamdis thread new "pool project")
./lamdis post $T "pool pump arrived, sitting in the garage"
./lamdis search pump

# semantic search: point at any OpenAI-compatible embeddings endpoint
export LAMDIS_EMBED_URL=http://localhost:11434/v1   # e.g. Ollama
export LAMDIS_EMBED_MODEL=nomic-embed-text
./lamdis search "what arrived for the pool"
```

## Layout & licensing

| Path | What | License |
|---|---|---|
| `spec/` | Protocol spec, JSON Schemas, conformance vectors | Apache-2.0 |
| `sdk/typescript/` | `@lamdis/sdk` typed client | Apache-2.0 |
| `node/` | The `lamdis` node/hub binary (Go, no cgo) | FSL-1.1-MIT |
| `ui/` | Approval inbox + thread browser (embedded in the binary) | FSL-1.1-MIT |

The protocol is open (Apache-2.0) so anyone can implement a node; this reference server is fair-source (FSL converts to MIT after two years).

## Design invariants

- Only humans sign grants; agents act `on_behalf_of` a person via signed delegations. Provenance bottoms out at a person, cryptographically.
- Lanes (`control` / `summary` / `content`) are the replication *and* permission classes — a summary-scoped peer never *holds* raw entries, not "holds but shouldn't read."
- Deny by default, everywhere: an empty lane scope is an error, never "everything."
- Embeddings are node-local. Queries travel as text; vectors never cross the wire. Any node can change embedding models with a local reindex and zero coordination.
- Deny/revoke beats grant under concurrency. The fold is deterministic; it fails closed.
