# Lamdis Protocol — Specification (v0 draft)

SPDX-License-Identifier: Apache-2.0

> Status: **draft, extracted from the reference implementation as it is built.**
> Normative freeze at v0.1 happens when multi-node sync is proven (reference
> milestone M3). Until then this document trails `node/` and
> `schemas/entry.schema.json` is the most reliable artifact.

## 1. Model

- **Principal** — anything that can sign. `person`, `agent`, or `device`
  (reserved). Identity is an Ed25519 keypair; the id is
  `ed25519:` + Crockford base32 of the 32-byte public key.
  **Only `person` principals may sign grants.**
- **Thread** — the unit of sharing, permissioning, and replication. Its id is
  the entry id of its genesis entry (`core.thread`).
- **Entry** — the only unit of data. Immutable, signed, hash-chained. See
  `schemas/entry.schema.json`.
- **Grant** — a control-lane entry signed by a person steward, giving a
  principal scopes on a thread.
- **Node** — a store of threads that syncs with peers and hubs. A hub is a
  node with federation/directory features enabled; same software.

## 2. Entries and chains

Entries chain per **(thread, author, lane)**: `seq` starts at 1 with no gaps;
`prev` is the SHA-256 of the previous entry in the same chain (64 zeros for
the first). The signature (`sig`) is Ed25519 over the canonical JSON with
`sig` omitted; the entry hash is SHA-256 over the canonical JSON with `sig`
included.

**Canonical encoding:** UTF-8 JSON, envelope fields in schema order, `body`
object keys sorted recursively at every depth, number literals preserved
verbatim, no insignificant whitespace, no HTML escaping.

**Total order** across a thread: `(lamport, author, id)` — every conforming
node sorts identically. `ts` is display metadata, never ordering authority.

**Lanes** are replication/permission classes:

| Lane | Contents | Replicated to |
|---|---|---|
| `control` | membership, grants, delegations, redactions | every member at every scope |
| `summary` | tier ≥ 1 summaries, thread cards | `summary` scope and above |
| `content` | everything else | `read` scope |

**Kinds:** reverse-DNS namespaced. `core.*` is reserved:
`core.thread`, `core.message`, `core.membership`, `core.delegation`,
`core.access_request`, `core.grant`, `core.deny`, `core.revoke`,
`core.summary`, `core.thread_card`, `core.redaction`.
Unknown non-core kinds MUST be replicated, stored, indexed (over `body.text`
when present), and served opaquely — *must-replicate, may-ignore*.

## 3. Sync

Nodes exchange per-thread version vectors `{(author, lane) → max seq}` and
stream missing entries per chain in ascending seq. Receivers verify
signatures and chain position; a gap, fork, or bad signature rejects the
entry. Sync is always evaluated *as a principal*: the serving node filters
lanes by the requester's effective scope before streaming.

Three verbs: **List** (threads visible to the caller at any scope),
**Pull** (entries after the caller's heads, lane-filtered; the response
carries the server's own heads), **Push** (the caller offers entries it or
its delegated keys authored). Push rules, all fail-closed: author must be
the authenticated principal or a key delegated to it; author must hold
contribute within its `[grant, revoke)` lamport window; only summary and
content lanes are remotely writable. Receivers apply the same
`MayContribute` window check when ingesting pulled entries, so a
compromised peer cannot relay data its members were never authorized to
write. (Caveat, stated in the threat model: lamport is author-asserted, so
a revoked author could backdate within its old window; v1 accepts this
under honest-node assumptions.)

## 4. Scopes and grants (normative core, implementation pending)

Four composable scopes, fixed in v1: `contribute`, `read`, `summary`,
`search`. Deny by default. Grant flow: `core.access_request` (control lane)
→ steward's client collects a **human** signature → `core.grant` /
`core.deny` → optional `core.revoke`. Deny/revoke beats grant under
concurrency; conflict resolution folds in total order and fails closed.

## 5. Retrieval

Search queries travel as **text**; each node embeds locally with its declared
profile and merges vector + FTS candidate lists by reciprocal rank fusion.
Embeddings never appear in entries or sync frames.

## 6. Out of scope for v1

E2EE lanes (designed-for: lanes map to future key scopes), DIDs/SSO, key
recovery, custom scopes or lanes, open-federation moderation, CRDT
co-editing. The v1 threat model is honest-node authorization plus transport
encryption, stated plainly.
