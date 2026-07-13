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
- [x] Permission engine: person-signed grants, four scopes, deny-wins fold, TTL, delegations (`node/internal/perm`)
- [x] P2P sync: signed HTTP between paired nodes, permission-filtered serving — a summary-scoped peer never receives a content byte (`node/internal/sync`, `node/internal/api`)
- [x] CLI: `serve`, `peer add`, `sync [-watch 30s]`, `grant`, `revoke`, `access`
- [x] Bidirectional sync: push verb with contribute enforcement on both ends — peers can only upload what their grant window allows, and clients refuse unauthorized data relayed by a compromised peer
- [x] MCP server (`lamdis mcp`, stdio): whoami, list/read/create threads, post_entry (content or summary lane), search_context, sync_peers. Deliberately no grant/revoke tools — approvals are human-signed acts, never tool calls
- [ ] Access-request flow + approval inbox UI (Lamdis Portal) · hub mode & federation · Postgres/pgvector driver · libp2p transport

## Connect your agent (MCP)

```jsonc
// .mcp.json (Claude Code, or any MCP client)
{ "mcpServers": { "lamdis": { "command": "lamdis", "args": ["mcp"] } } }
```

Your agent can then post working context to threads, publish shareable
summaries (`post_entry` with `lane: summary` — that's what summary-scoped
peers see), search everything you hold, and `sync_peers` before answering
freshness-sensitive questions.

## Two-person quickstart (you + a coworker)

```sh
# each of you, once:
./lamdis init                          # creates your identity (a keypair)
./lamdis serve -addr :8420             # keep running (LAN, Tailscale, or tunnel)

# pair by URL — identities are exchanged automatically, like adding a contact:
./lamdis peer add jane http://<janes-host>:8420
#   ✓ paired with jane (ed25519:QZHP…)

# you, working:
./lamdis thread new "q3 payments migration"
./lamdis post payments "raw working notes stay private"
./lamdis post -kind core.summary -lane summary -json '{"text":"migration on track, cutover mid-August"}' payments

# share the gist — thread by title, person by name:
./lamdis grant -ttl 168h payments jane summary,search
./lamdis access payments               # who sees this thread, and how much
./lamdis revoke payments jane          # stop sharing any time

# jane:
./lamdis sync -watch 30s               # receives the summary lane — never your raw notes
./lamdis search cutover
```

Commands take a thread's **title** (or any unique fragment of it) and a peer's
**name** — the `ed25519:` strings exist underneath, but you never type them.

With a `contribute,read` grant instead, your coworker's posts flow back to
your node on their next sync — full two-way collaboration, each side owning
its own store. Both machines must be reachable from each other (LAN, VPN,
or SSH/SSM tunnels through a host you both already access). An always-on
rendezvous hub — a node on shared infrastructure that both sides sync
against so neither laptop needs to reach the other — is the next milestone:
it requires a steward-granted hub role so the relay itself holds replicas
without being a person.

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
