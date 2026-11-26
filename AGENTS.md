# Data Fair - Agent Guidelines

## Project Overview

Data FAIR (Findable, Accessible, Interoperable, Reusable Data) is an open-source data management platform developed by Koumoul. It provides a web-based interface for publishing, exploring, and sharing datasets.

## Dev environment

Quick start without any tooling: `npm ci && npm run dev` (fixed ports from `dev/default.env`, overridden by `.env`), then `npm test`.

The environment is started by the user, in a terminal: `npm run dev` starts the containers, the mock server, the api and the ui, logs in `dev/logs` (`mock.log`, `api.log`, `ui.log`). Read the logs before restarting anything: nodemon (api) and vite (ui) already reload on file changes. Agents do not kill the processes or containers they did not start.

Each dev process also has its own npm script, reading its settings from environment variables (`dev/default.env` overridden by `.env`): `npm run dev-deps` (containers only), `npm run dev-setup` (idempotent builds), `npm run dev:api`, `npm run dev:ui`, `npm run dev:mock`.

- Core containers: elasticsearch, mongo, s3, simple-directory, nginx, clamav (upload scanning, ~30 MB with the EICAR-only signature database). Optional: `events`, `capture`, `agents`, `registry`, `openapi-viewer`, `maildev` (mails sent through simple-directory). Start them with a compose profile: `npm run dev -- --profile events --profile agents`. An optional service is absent when its port variable is empty (`EVENTS_PORT=`); `npm run dev` blanks the ports of the optional containers that are not running, so restart `npm run dev` after adding one.

### Port assignments

Port numbers are defined in `.env`. Do not modify port assignments.

### Testing

See [docs/architecture/testing.md](docs/architecture/testing.md) for full details on the test suite structure, conventions, and how to run tests.

Quick reference:
```bash
npm test                          # all tests
npm run test-unit                 # unit tests only
npm run test-api                  # API tests only
npm run test-e2e                  # e2e tests only
npx playwright test path/to/file  # specific file
```

The test suite is very long — when iterating on changes always run only the related test cases. Pushing runs a light gate (type ratchet, unit tests, the `@smoke` set and the api/e2e spec files the push changes); the full suite runs on pull requests and nightly on master. See [Quality gates](docs/architecture/testing.md#quality-gates).

### Table performance

The dataset table (`ui/src/components/dataset/table/`) is a critical, optimized
component. When a change touches it, or what it relies on
(`ui/src/composables/dataset/lines.ts`, the filters composables, `use-headers.ts`):

1. Run `npm run benchmark -- ui-table --dataset=<id> --base=master` (plus the account
   options), on a dev dataset with the shape described in `benchmark/README.md`, "UI table
   harness". It takes about 10 minutes, so run it in the background. Put the verdict and
   any flagged lines in your summary. If no such dataset exists in the dev environment,
   ask the user for one.
2. Give the user the dataset's table URL on the dev stack,
   `/data-fair/embed/dataset/<id>/table`, for a manual look at scrolling, search and
   menus. It needs a dev session, since the dataset is private on purpose: never make a
   dev dataset public, because the test suites count every dataset a user can read.

### Linting & Type Checking

```bash
npm run lint             # ESLint for all workspaces
npm run lint-fix         # Auto-fix lint issues
npm run check-types      # TypeScript type checking
```

### Building

```bash
npm run build            # Build UI
npm run build-types      # Build type definitions
npm run build-parsers    # Build PEG.js parsers (where, select, order-by, etc.)
```

## Architecture Documentation

Design specs and implementation plans are not kept in this repository; durable architecture docs live in `docs/architecture/`.

In-depth documentation for complex subsystems lives in `docs/architecture/`:

- [Dataset Drafts](docs/architecture/dataset-drafts.md) — draft lifecycle, API mechanics, UI section visibility for file-new vs file-updated
- [Publication Sites](docs/architecture/publication-sites.md) — publication sites model, permissions gate (admin / staging / department), and sync with the `portals` service
- [Testing](docs/architecture/testing.md) — test suite structure, naming conventions, running tests
- [Dataset Validation](docs/architecture/dataset-validation.md) — schema validation, mandatory extensions, diagnostic CSV, file vs REST flows
- [AI Agent Integration](docs/architecture/agent-integration.md) — tools, subagents, action buttons, and prompts exposed to the back-office AI assistant. **When modifying agent tools, subagents, or action buttons, update this document to reflect the changes.**
- [Platform API docs](docs/architecture/platform-api-docs.md) — the merged OpenAPI document of every service of a site (`/api/v1/platform/api-docs.json`): namespacing rewrites, security refusals and fail-closed rules, freshness and `x-platform` status, how to add a service, known gaps. **Read before touching `x-agent` annotations, `oauth2Alternatives`/`agentSecurity` or a service's public OpenAPI document.**
- [Notifications](docs/architecture/notifications.md) — three-layer event model, topic key conventions, draft-prefix logic, uniformisation gaps
- [Load Management](docs/architecture/load-management.md) — rate limiting, request timeouts and Elasticsearch query controls across the app and the reverse-proxy layer, plus notes on possible further hardening
- [Caching & cache headers](docs/architecture/caching.md) — the five caching layers (reverse-proxy cache, HTTP cache headers, `memoizee` in-process caches, MongoDB-backed caches, ad-hoc object caches), how they coordinate freshness, and the config reference
- [Map base layer & tileserver](docs/architecture/map-tiles.md) — where dataset maps get their MapLibre style (`map.style`, the same-origin `/tileserver` convention) and the 302 redirect keeping legacy `tileserver-koumoul` remote-service URLs alive, with its removal conditions
- [Application Keys](docs/architecture/application-keys.md) — intermediate-security tier for un-connected access to applications and the datasets they embed: data model, URL shapes, the two enforcement points (proxy + dataset middleware), permission scoping, owner boundary, and the anti-spam stack for anonymous writes
- [Fragments](docs/architecture/fragments.md) — datasets and applications declared `partOf` another resource: derived ACL and its sync points, application-context read for dataset fragments, default hiding in listings, attach/detach and delete cascade. **Read before touching permissions, listing filters or the application-key middleware.**
- [Dev environment resource limits](docs/architecture/dev-resources.md) — why the vite dev server and Elasticsearch are memory-capped: running several dev stacks side by side can exhaust host RAM and swap, and the resulting global OOM kill destroys the desktop session while leaving the containers running. Also covers the ES / MongoDB / ClamAV caps
- [Code conventions](docs/architecture/code-conventions.md) — module file roles (router/middlewares/service/operations), request-context accessors, typing ratchet. **Read before refactoring or adding API code.**
- [Date management](docs/architecture/date-management.md) — the date / date-time strategy end to end: French-first sniffing, offset-preserving storage, timezone-aware filters & aggregations, and display in the data's own timezone (not the viewer's). **Read before touching date parsing, storage, or display.**
- [/lines read efficiency](docs/architecture/read-lines-efficiency.md) — the design choices behind the `/lines` hot path: stream the source not the response (ETag/Link preserved, zero observable change), the streamed `LinesSource` + splitter, per-format routing (incl. the pbf/shp zero-copy worker paths and why xlsx stays buffered), the parity/verification harness, and the measured rejected alternatives. **Read before touching the `/lines` read path.**
- [Storage accounting](docs/architecture/storage-accounting.md) — the `store_bytes` / `indexed_bytes` metrics: physical vs CSV-equivalent accounting, the per-line `_bytes` field and sum aggregation, and the organic `_esLineBytes` migration. **Read before touching storage computation or quota enforcement.**
- [OAuth scopes](docs/architecture/scopes.md) — the `scope` claim of NHI sessions: vocabulary and tiers, the three enforcement layers (gate at mount, `list()`/`canDoForOwner()`, websocket channels), any-scope routes, what stays refused, the OpenAPI `oauth2` scheme. **Read before touching `permissions.ts`, `scopes.ts`, router mounts in `app.js` or `canSubscribe`.**
- [Dashboard](docs/architecture/dashboard.md) — how the home page composes the services of the stack: the endpoints it reads from processings and portals (a cross-service contract), iframe blocks, what `extraTodoItems` is for. **Read before changing one of those endpoints.**
- [Multilingual metadata](docs/architecture/metadata-i18n.md) — mockup: `x-i18n-*` translations of the datasets metadata, their cleaning on write, the explicit `lang` localized reads and the cross-language search
- [Catalog search](docs/architecture/catalog-search.md) — how `q=` ranks datasets and applications: the owned term index, dis_max BM25 scored in the aggregation, the `markStale` contract for bulk writers. **Read before touching `q=`, `find.ts`, or anything writing dataset/application metadata.**

## Common Development Tasks

### Debug Rust native modules (parquet-writer)
```bash
npm -w parquet-writer run build:debug && RUST_BACKTRACE=1 npm test
```