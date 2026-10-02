# Agent profiles across the stack

Status: design agreed 2026-10-02. Rollout step 1 (openapi-mcp 0.3.0) and step 2 (data-fair's
vocabulary and annotations, metrics) are implemented; see section 10.

The services of the stack publish OpenAPI documents annotated with `x-agent`, which
`@data-fair/openapi-mcp` turns into agent tools. data-fair's deployment index
(`GET /api/v1/agents/index.json`, `api/contract/agents-index.ts`) lists those documents, and a
consumer composes them into one tool set by asking for a set of **profiles**.

Tools come and go with the services; profiles do not. Autonomous agents are configured by
selecting profiles, so a profile name is a public contract: once an agent configuration says
`write_portals`, that name must keep meaning the same thing for as long as the stack exists.
This document fixes the profile vocabulary, the rules that place a tool in it, and what each
component has to do to follow it.

## 1. Needs

Two families of consumers ask very different things of the same APIs.

- **Back-office assistants** — the agents service's autonomous agents today, the browser
  assistant tomorrow — work on an account's resources across every service: data-fair,
  portals manager, processings, catalogs, events, metrics, capture, simple-directory. They
  need a strong **horizontal** distinction between reading, changing content and changing who
  can access what, and a **vertical** one across resource families, so that a portal-theming
  agent is not handed processings tools.
- **Catalog exploration** — the `mcp` server's public mode and its historical
  `/datasets/mcp` route, portals' end-user assistants — answers questions about what a portal
  offers. It needs a short, efficient tool set with no management concerns at all.

## 2. Current state (2026-10-02)

- A single profile exists anywhere: `explore`. data-fair declares its six read tools in it
  (`api/contract/x-agent.ts`), metrics its `aggregate_requests` tool (branch
  `feat-agent-api-docs`). The index declares `explore` only.
- `explore` serves both needs above, and the mix already causes a bug: the annotated
  `list_datasets` is `GET /datasets`, scoped to the session's account (or the site owner on a
  secondary domain), while the historical MCP server and the portal assistant used
  `GET /catalog/datasets`, scoped to the portal's `publicationSites`. On a portal host, `mcp` v2
  lists the owner's datasets, not the portal's catalog.
- The index lists processings and simple-directory, whose documents carry no annotation;
  processings' listed document (`/processings/api/v1/admin/api-docs.json`) is superadmin-only.
  events, catalogs and the portals manager publish no OpenAPI document. capture publishes one,
  unannotated.
- The agents service (branch `feat-autonomous-agents`) selects tools per MCP server with a
  `toolFilter` of tool names, and its spec treats a server catalog entry as "a URL plus a
  profile".

## 3. The vocabulary

### The grid

Eight **silos**, one per resource family as a user sees it — not per service:

| Silo | Covers | Services |
|---|---|---|
| `datasets` | datasets, lines, attachments, schema, master data, journal | data-fair |
| `applications` | applications, configuration, attachments | data-fair |
| `portals` | portals, pages, reuses, groups, images and fonts, theming | portals |
| `processings` | processings, runs | processings |
| `catalogs` | remote catalogs, imports, publications to catalogs | catalogs |
| `notifications` | events log, subscriptions, webhooks | events |
| `metrics` | audience metrics | metrics |
| `account` | account settings (topics, licences, vocabulary, API keys, publication sites configuration), organization members, invitations, departments, partners | data-fair settings, simple-directory |

Three **tiers**, each a question about the action, not about the endpoint:

| Tier | The action… | Examples |
|---|---|---|
| `read` | changes nothing | list, describe, query, aggregate, journals, rendered captures |
| `write` | changes the content of a resource | create, edit metadata or configuration, edit lines, drafts, trigger or kill a processing run |
| `manage` | changes **who can access a resource, whether it is exposed, or whether it exists** | permissions, publication to sites, portals or catalogs, API keys, ownership, members, deletion of a resource |

The test for `manage` is a single sentence on purpose: an agent rewriting a description does
something reversible and private; publishing a dataset on a public portal, opening its
permissions or deleting it changes its audience or loses it. data-fair's permission classes
already draw this line (`shared/permissions/operations.ts`: `write` is grantable to
contributors, `admin` — delete, permissions, `changeOwner`, `writePublications`,
`writePublicationSites`, `writeExports`, `setReadApiKey` — is held by the owner's admins).
Services that gate everything behind the owner's admin role (portals, catalogs, events) still
place most of their surface in `write`; only exposure and deletion go to `manage`.

Profile names are `<tier>_<silo>`: `read_datasets`, `write_portals`, `manage_processings`.

### Inclusion and umbrellas

- `manage_<silo>` includes `write_<silo>`, which includes `read_<silo>`: any one cell is enough
  to act in its silo.
- The umbrellas `read`, `write` and `manage` include every cell of their tier; through the
  cells, `manage` includes everything below it.
- A selection is any mix of umbrellas and cells: `read` plus `write_portals` is a portal editor
  that can look at everything else.

### Outside the grid

- **`catalog`** — the resources **actively published on a portal, in their end-user form**:
  datasets and their data, applications, reuses, pages, news, events. It is scoped by the
  portal the request comes from. It is not "public data": permissions still apply, and on a
  private portal its members see what was published for them. It combines freely with the
  grid — an agent holding `read_datasets` and `catalog` can manage its datasets and check what
  end users actually get.
- **`platform`** — superadmin operations (reindex, diagnose, plugins, service status). It is
  included in no umbrella and never offered to autonomous agents.

### The index declares everything

The index declares the whole vocabulary, empty cells included (`write_metrics` has no tool and
may never have one), with French and English titles and descriptions, and the umbrellas'
`includes`. Services declare only the cells they fill, under the same names. A configuration
naming an empty cell gets nothing rather than an "unknown profile" error, and a service that
fills a cell later changes no configuration.

## 4. Placing a tool

1. **One tier.** A tool sits at the lowest tier its action needs.
2. **Every silo that needs it.** A tool may serve several silos at that tier. capture's two
   operations — the rough equivalent of a browser snapshot, without browser orchestration — are
   `[read_applications, read_portals]`, because portal theming and page edition need to see
   their result as much as application configuration does.
3. **`catalog` beside the grid.** An operation that serves both a catalog and an account use
   unchanged stays one tool with both profiles: the per-dataset reads (describe, search,
   aggregate, field values, metric) are `[catalog, read_datasets]`.
4. **One endpoint, several tiers: views.** `PATCH /datasets/{id}` edits the description
   (`write`) and the publication sites, exports and read API key (`manage`) through the same
   body. Such an operation is annotated with one **view** per tier, each exposing an
   allow-list of body fields (see openapi-mcp below). The API still refuses a contributor's
   PATCH that touches `publicationSites`: profiles decide what an agent is offered, never what
   it is allowed.
5. **Read-only versus destructive is not a tier.** The agents service's approval gate classifies
   calls from MCP annotations (`readOnlyHint`, `destructiveHint`), independently of profiles.
   `deleteLine` is a `write` tool with `destructiveHint: true`, and the gate handles it.

## 5. Tool names

Profiles are the only configuration contract; tool names belong to their services and may
change. They still follow two rules.

- **A tool name is unique across the whole stack, whatever the profiles.** Any combination of
  profiles composes without collision, which is what lets `catalog` mix with the grid.
- **When a catalog tool and a management tool cover the same resource, one of them carries a
  qualifier.** The end-user side is qualified `published` — the resource went through an act
  of publication and the tool returns its published, end-user form. The exception is where a
  historical catalog name already exists: the dataset and application listings keep their
  short names on the catalog side, and the management side is qualified `account`.

| Resource | `catalog` | grid |
|---|---|---|
| datasets | `datafair_list_datasets` → `GET /catalog/datasets` | `datafair_list_account_datasets` → `GET /datasets` (`read_datasets`) |
| applications | `datafair_list_applications` (portal `publicationSites`) | `datafair_list_account_applications` (`read_applications`) |
| portal pages | `portals_list_published_pages` (portal public API) | `portals_list_pages` (manager, `read_portals`) |
| reuses | `portals_list_published_reuses` | `portals_list_reuses`, drafts and moderation included (`read_portals`) |

## 6. Stability rules

1. Profile names are never renamed or removed. A new resource family is a new silo; the
   umbrellas pick it up without any configuration change.
2. The meaning of a tier never moves: an action does not migrate from `write` to `manage`
   because a service changed its role model.
3. Profiles say what an agent is **offered**. What it is **allowed** to do is the permissions of
   its identity (an autonomous agent's non-human identity, or the user), enforced by each API.
4. Nothing in configuration references a tool name.

## 7. What each component has to do

### openapi-mcp

Specified in its own repository; this document only depends on the result.

1. **Views.** An operation's `x-agent` may be an array. Every element then needs an explicit
   `name`, unique within the array (the `manage` view of a PATCH is always selected with its
   `write` view, since `manage` includes `write`). `editor.readOperation` and
   `editor.schemaOperation` keep pointing at the raw operation and ignore views.
2. **Body allow-list.** A view can restrict the request body to a list of fields; the schema is
   pruned before both `flat` and `compact` modes, so the compact listing and the local
   validation agree. An allow-list rather than a deny-list: a governance field added to an API
   later must be exposed nowhere until someone places it, rather than leak into `write`.
3. **Vocabulary check.** The composer reports a service that declares a profile the index does
   not declare, so a typo (`write_portal`) cannot create a profile no agent can select.

### data-fair

- `api/contract/agents-index.ts` declares the vocabulary of section 3, plus `explore` as a
  deprecated alias (section 8).
- `api/contract/x-agent.ts` moves to the grid:
  - `GET /catalog/datasets` is annotated `catalog` as `list_datasets`; `GET /datasets` becomes
    `list_account_datasets` in `read_datasets`;
  - the per-dataset reads carry `[catalog, read_datasets]`;
  - applications get `list_account_applications` in `read_applications` and the portal-scoped
    `list_applications` in `catalog`;
  - `PATCH` on datasets and applications becomes a `write_*` view and a `manage_*` view;
  - `DELETE`, the `/permissions` routes and `PUT /owner` go to `manage_*`;
  - settings routes go to the `account` silo.
- The catalog workflow skill (today's `workflow`) is restricted to `catalog`; a back-office
  workflow skill, if any, to the grid.

Done in step 2, except what needs API work first: the portal-scoped `list_applications` (data-fair
has no `/catalog/applications` route), `PUT /owner`, application permissions and settings (not in
the root document yet), and creation tools, whose bodies deserve their own design.

### metrics

`aggregate_requests` moves from `explore` to `read_metrics`.

### portals

- The manager API publishes an annotated document for `read_portals`, `write_portals` and
  `manage_portals`: portals, pages, reuses, groups. Publishing a draft and ingress or domain
  changes are `manage`.
- The portal's public API (`portal/server/routes/portal/api/*`) publishes an annotated document
  for `catalog`: published pages, news, events, reuses. How the index reaches a per-portal
  document (listed per site by data-fair, or proxied by portals) is decided with that work.

### processings

Serve an account-level document instead of the superadmin one the index lists today:
`read_processings` (processings, runs), `write_processings` (configuration, `_trigger`,
`_kill`), `manage_processings` (creation, deletion, permissions, webhook key). Until it exists,
processings leaves the index.

### catalogs, events, capture, simple-directory

catalogs and events publish a first annotated document each. capture annotates its two
operations `[read_applications, read_portals]`. simple-directory annotates members,
invitations and partners in the `account` silo; listed without annotations it contributes no
tool, so it can stay in the index meanwhile.

## 8. Consumers and migration

### The `mcp` server

- Public mode exposes `catalog` only (`PUBLIC_PROFILES` defaults to `["catalog"]`), and
  `/v0/servers` lists it alone.
- Internal mode — the agents service's runs — accepts any combination of declared profiles;
  `/v0/servers` lists `catalog` and the umbrellas.
- The compatibility route `/datasets/mcp` composes `catalog` from data-fair with no prefix: the
  historical names, now with the portal scoping they used to have.

### The agents service

- An autonomous agent selects `profiles: string[]` on the stack's server entry; `toolFilter`
  goes away. The selection is checked against the server's declared profiles when the agent is
  saved and when it runs.
- The configuration UI is a small tree derived from the index's `includes`: roots `catalog`,
  `read`, `write`, `manage`; each grid root selectable as a whole or unfolded into its silos;
  cells implied by a selection shown as such (`write_portals` implies `read_portals`).
- The selectable roots may follow the role of the agent's identity in the account (`user`:
  `read`; `contrib`: up to `write`; `admin`: everything). This narrows the offer; the APIs
  enforce the rights either way.

### The browser back-office assistant

Out of scope. Its direction: combine server-side tools selected by these same profiles —
derived from the user's role rather than from a configuration — with the contextual tools of
the page it runs in.

### Retiring `explore`

`explore` is deployed only through `mcp`'s public mode and compatibility route, which are
catalog uses, and no autonomous agent configuration exists yet. The index keeps `explore` for
one release as a deprecated alias that includes `catalog`, then drops it.

## 9. Guardrails

- data-fair: a unit test pins the index vocabulary; it may only grow.
- Every service: a golden snapshot of its tool surface per declared profile, as data-fair
  (`tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`) and metrics
  (`test-it/03-agent-api-docs.ts`) already do.
- A stack check composes every document with every profile at once and asserts that no service
  declares an undeclared profile, that no tool name repeats, and that no tool sits at two tiers.

## 10. Rollout

1. openapi-mcp: views, body allow-list, vocabulary check. — done
2. data-fair index and annotations, metrics moved to `read_metrics`, `explore` alias. — done
3. `mcp` server: `catalog` in public mode, the compatibility route.
4. agents service: profile selection and the tree.
5. Then each service in turn — portals, processings, catalogs, events, capture,
   simple-directory — fills its cells without touching any configuration.
