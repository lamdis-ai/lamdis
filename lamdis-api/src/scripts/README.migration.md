# Action -> Request Migration and Manifest Composition

This folder contains migration tools to support the new model where Actions point to one of:

1. a Request
2. a Knowledge Article
3. a Workflow

And manifests are composed at publish time by dereferencing these references.

## What changed

- Requests are first-class: reusable HTTP definitions (transport, schemas, auth)
- Actions are thin pointers to Request/Knowledge/Workflow, plus user-facing titles/desc
- Publishing a manifest now flattens actions by resolving their pointers into export-ready entries

## Scripts

- `npm run migrate:actions-to-requests`
  - Scans all orgs and actions
  - For actions without any pointer, creates a Request from their transport/schemas/auth
  - Updates those actions with `request_ref: { id: <created> }`
  - If an action already had `static_response` but no `knowledge_ref`, creates a Knowledge Article and links it
  - Leaves legacy fields on Action for back-compat

- `npm run migrate:action-library-to-requests`
  - Converts Action Templates (the public/shared action library) into Request Templates
  - Skips templates that are purely static-response
  - Normalizes legacy http fields into transport.http and http.full_url for consistent consumption

- `npm run migrate:manifests` (existing)
  - Backfills per-org default Manifest documents and links historical versions

- `npm run migrate:action-maps` (existing)
  - Seeds per-manifest action maps from latest version or all enabled actions

## Verifying

1. Dry run by inspecting output logs; script is idempotent
2. Publish a manifest from the dashboard; the published snapshot should:
   - Include actions that point to Requests, with transport and schemas from the Request
   - Include knowledge actions as hosted/static_response
   - Include workflow actions as hosted endpoints

## Rollback

- The migration only adds Request/Knowledge docs and adds pointer fields on Actions.
- It does not delete any data; you can revert pointers manually if needed.
