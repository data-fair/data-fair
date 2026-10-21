# Platform OpenAPI document

`GET /data-fair/api/v1/platform/api-docs.json` serves one OpenAPI 3.1 document describing every service of the site: data-fair, simple-directory and, when configured, metrics and events. It is public, identical for every caller of a site (no session is read) and marked `allowAnyScope`, so a scoped token reads it too. Design: `docs/superpowers/specs/2026-10-19-platform-api-docs-design.md`.

Code: `api/contract/platform-api-docs.ts` (pure: check, rewrite and merge), `api/src/platform-api-docs/service.ts` (fetching, caching, per-site memoization), the route in `api/src/misc/routers/root.ts`, `api/contract/scopes-security.ts` and `api/contract/x-agent.ts` (what data-fair contributes).

## Who reads it

`@data-fair/openapi-mcp` turns the document into one MCP server: an operation is a tool only if it carries `x-agent`, skills come from the root `x-agent.skills`, and the `oauth2` scheme with the operations' `security` lets the consumer keep only the tools a token's scopes reach. The document does not decide which tools a client gets; the token's scopes do, downstream. Coding agents and the agents service's autonomous runs reach it through the mcp server; the back-office browser assistant does not use it.

It replaces the deployment index (`/api/v1/agents/index.json`) and the agent profiles (the tier x silo vocabulary): authorization is the OAuth scopes of [scopes.md](scopes.md).

## Services

| Namespace | Source | Mount path on the site | Present when |
| --- | --- | --- | --- |
| `datafair` | in process, `apiDocs(publicUrl)` without a session (no superadmin routes) | data-fair's public path + `/api/v1` | always |
| `sd` | `(privateDirectoryUrl \|\| directoryUrl) + '/api/api-docs.json'` | `/simple-directory` | always |
| `metrics` | `privateMetricsUrl + '/api/api-docs.json'` | `/metrics/api` | `privateMetricsUrl` is set |
| `events` | `privateEventsUrl + '/api/api-docs.json'` | `/events/api` | `privateEventsUrl` is set |

Fragments are fetched over private URLs, once per service, not per site: after the rewrite nothing in a fragment depends on the site. The merged document has one server, the origin of the request's public base URL; every path carries its service's mount path. Processings is not aggregated: its listed document is superadmin-only.

To add a service, add an entry to `platformServices()` in `service.ts` (id in lowercase `[a-z0-9]+` by convention — nothing checks it, but `<ns>_<name>` must stay a valid tool name — title, mount path, public document path, private URL) and extend `PlatformServiceId`. The service must serve a public, session-independent document, annotated with `x-agent` and declaring its scopes in an `oauth2` scheme if its operations are scoped.

## Rewrites

`prepareFragment` runs once per fetched document and is pure.

- A fragment is accepted if it is an object with `openapi` 3.0.x or 3.1.x and `paths` (simple-directory is 3.0).
- Paths are prefixed with the mount path; `servers` (path level and operation level) are removed.
- `operationId` becomes `<ns>_<operationId>`; every component kind except security schemes is renamed `<ns>_<name>` and the internal `$ref`s follow.
- Tags become `<Service title> / <tag>`, root tags are concatenated.
- Each `x-agent` entry (an operation may carry an array) gets the final tool name `<ns>_<name ?? snake_case(operationId)>`.
- Root `x-agent.skills` are collected: name `<ns>-<name>`, `tools` prefixed, `href` resolved against the service's public document path on the site.
- **Vocabulary.** openapi-mcp refuses the whole document for a bad tag or skill annotation, and under `lint: 'error'` for a bad operation annotation, so one service's version skew would cost every service its tools. The merge therefore keeps only the keys openapi-mcp knows (`agentEntryKeys`, `agentTagKeys`, `agentSkillKeys`, pinned to openapi-mcp's vocabulary by a unit test) and removes the others with a warning — `profiles` and `namePrefix` included. A skill openapi-mcp would refuse (name not kebab-case once namespaced, description over 1024 characters, both `href` and `body`, `tools` not a list of names) is removed with a warning, as is a tag `guide` that is not a text and an `x-agent` that is not an object or a list of objects. The fragment itself is not refused: the rest of it is fine. The values of the kept keys are not checked here (see Known gaps).
- A duplicate `operationId` inside a fragment loses its id on the second and later occurrences, with a warning; if one of them carries `x-agent`, the fragment is refused.
- A path already provided by an earlier service is left out of the merge, with a warning on the later one.

## Security and refusals

The merged document declares `oauth2` (client credentials, `tokenUrl` = `<site origin>/simple-directory/api/auth/nhi-token`, scopes = the union of the fragments' `oauth2` scopes), `apiKey` and `sdCookie`. Operations keep their own `security`; a fragment's root `security` is copied onto the operations that have none, so the merged root declares none.

- **Fail closed.** An operation with no security anywhere gets `[{ sdCookie: [] }]`: no scoped token reaches it. Only `security: []` or an empty alternative `{}` is public.
- **Alternatives are ORed, scopes inside one requirement are ANDed.** data-fair therefore emits one `{ oauth2: [scope] }` alternative per accepted scope (`oauth2Alternatives`), not one requirement holding all of them.
- **A fragment is refused** (left out entirely, reported in `x-platform`, its last good version not reused) if: it declares an `oauth2`-type scheme under another name, or an `oauth2` scheme with a flow other than client credentials; it declares `apiKey` or `sdCookie` differently from the platform; an operation or `x-agent` entry requires `oauth2` (or any other scheme) without the fragment declaring it, or an `oauth2` scope its scheme does not declare. `apiKey` and `sdCookie` may be required without being declared: they are the platform's shared schemes, and neither grants anything to a scoped token.
- **A security that is not a list** (root or operation) fails closed: the operation gets `[{ sdCookie: [] }]`, with a warning.
- Other security schemes (e.g. `http`) are not carried: the alternatives using one are removed, with a warning, and an operation left with none falls back to `[{ sdCookie: [] }]`.
- **Narrowing per tool.** An `x-agent` entry may carry its own `security`, which replaces the operation's for filtering and can only drop alternatives. The merge rewrites it consistently with the operation's rewritten security, so openapi-mcp's narrowing check always holds: alternatives using a dropped scheme go (an entry left with none follows the operation onto `[{ sdCookie: [] }]`), alternatives not in the operation's rewritten security are removed with a warning, and an entry left with nothing — or an entry `[]` on an operation that is not public — is removed with a warning, never made public. A `security` that is not a list removes the entry too. A skill stops naming the tool of a removed entry, unless another entry still provides that name. `agentSecurity(family, tier)` builds one: `apiKey`, `sdCookie` and one `oauth2` alternative per `acceptedScopes(family, tier)`. `PATCH /datasets/{id}` yields `datafair_update_dataset` (write tier) and `datafair_publish_dataset` (admin tier), and the same for applications: a `datasets:write` token is offered the first and not the second, while `datasets:admin`, `datasets` and unscoped sessions get both.

## Freshness and `x-platform`

`service.ts` fetches every fragment at startup and every 300 s; the remote ones (sd, metrics, events) with conditional GETs (`If-None-Match`) and a 10 s abort, data-fair's own built in process. Each service settles on its own: a slow service does not delay the others' state. The cache is in process memory, per API pod. `init` waits for the first round at most 5 s, then serves what it has.

The merge is memoized per site origin until the next state change. The root `x-platform.services` lists, per service: `status`, `error` (when any), `fetchedAt` (once it answered), `warnings` (only when there are some).

| Status | Meaning |
| --- | --- |
| `ok` | current fragment in the merge |
| `stale` | the last fetch failed (network, non-2xx, invalid JSON); the previous good fragment stays in the merge |
| `error` | never answered: absent from the merge |
| `refused` | the fetched version was refused (see above): absent from the merge |

Cache headers: `Cache-Control: no-store` while any service has never answered (no `fetchedAt`), so a shared cache does not keep a degraded document for 5 minutes after the service is back; otherwise `public, max-age=300`.

## What data-fair contributes

- `api/contract/x-agent.ts` annotates the operations. Tool names in the texts (descriptions, skills) are the platform names, `datafair_…`. `publish_dataset` and `publish_application` are narrowed to the admin tier with `agentSecurity`.
- The `workflow` skill has no `tools` binding, so it is offered to every token.
- Per-dataset documents (`/datasets/{id}/api-docs.json`) share these annotations. Their own tools are unprefixed (`search_data`) while the texts use platform names; no tool consumer reads them today.
- `GET /api/v1/agents/skills/:file` stays: skills' `href` points at it.
- The human document `GET /api/v1/api-docs.json` is unchanged (session-aware, for openapi-viewer and developers).

The agent surface is pinned by `tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts` (golden `tests/fixtures/agent-surface.json`, with the expected tool names per scope set); the merge is unit-tested in `platform-api-docs.unit.spec.ts`, the cache in `platform-api-docs-service.unit.spec.ts` and the route in `platform-api-docs.api.spec.ts`.

## Known gaps

- **Not strictly OpenAPI 3.1.** The envelope is 3.1, but 3.0 fragments are included as is: simple-directory's `examples` array on a media type makes the merged document fail a strict `openapi-3.1` schema. openapi-mcp tolerates it; converting 3.0 constructs is left for when a consumer needs it.
- **Refs to schemas the document does not embed.** simple-directory's schemas point at other `$id`s (`…/simple-directory/partial`, `…/lib/session-state`) and at `$defs` of their own resource. The merge passes them through; openapi-mcp resolves the ones the document holds (against the nearest embedded `$id` resource, then the root) and reads the others as `{}` with a console warning, never failing the document.
- **Annotation values are not validated at merge time.** Only the keys are (openapi-mcp is not a runtime dependency). A kept key with a bad value fails openapi-mcp on that operation: the whole tool set under `lint: 'error'`, only that operation under `lint: 'warn'`; a property-level `x-agent` in a shared component schema fails the document at any level. A consumer that must survive a misbehaving service loads with `lint: 'warn'`.
- **Secondary sites.** data-fair's mount path comes from the main `publicUrl` pathname, while secondary sites always serve data-fair under `/data-fair`. The two agree unless the main `publicUrl` is not mounted at `/data-fair`.

- **Agents service not switched (phase 4a).** The mcp server reads this document and filters tools by the caller's scopes (`/mcp-server/mcp`), with the dataset tools at `/mcp-server/datasets/mcp`. The agents service still selects profiles (`/mcp-server/profiles`, `?profiles=`), which the mcp server no longer serves: the personal assistants (`PERSONAL_ASSISTANTS`) and the autonomous-agent simulations stay broken until it connects to `/mcp` with a scoped token. There is no temporary route.
- **Metrics fetch untested in dev.** The URL `privateMetricsUrl + '/api/api-docs.json'` is not exercised: `privateMetricsUrl` is unset in the dev stack.
- **No catalog tool set.** Without profiles `datasets:read` covers both `list_datasets` (portal catalog) and `list_account_datasets`; a catalog-only MCP is a tool selection on the mcp side.
