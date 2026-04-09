### Call destination

Manifests are vendor-first by default. Choose "Vendor" to export direct vendor URLs; agents will call providers using provider-native auth. Choose "Lamdis hosted" only for Hosted/Proxy actions; the manifest will point to lamdis.ai and we call the provider for you.
# lamdis-web
 
See also: [AGENTS.md](./AGENTS.md) for UI development guidance (reuse base components, avoid duplicate Tailwind).

## Analytics (Dashboard)

The Dashboard Analytics page visualizes:
- Manifest retrievals (7d line chart)
- Action invocations (7d line chart, merged across Hosted + Gateway)
- Failures (7d bar chart, shown only when non-zero)
- Action summary table (last 7d)

Source breakdown:
- Toggle “Source breakdown” to overlay Hosted vs Gateway daily counts when the API returns `includeSources=1` data.
- The UI requests `GET /analytics/actions?includeSources=1` via the app API when the toggle is enabled.

Backends:
- Hosted signals come from lamdis-api HostedActionInvocation logs.
- Gateway signals come from lamdis-agents-api via lamdis-api `/analytics/ingest`.