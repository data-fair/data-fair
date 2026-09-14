# Data Fair - Agent Guidelines

## Project Overview

Data FAIR (Findable, Accessible, Interoperable, Reusable Data) is an open-source data management platform developed by Koumoul. It provides a web-based interface for publishing, exploring, and sharing datasets.

## Dev environment

The dev environment is managed by zellij (terminal multiplexer) and docker compose. **Never start, stop, or restart dev processes yourself** — the user manages them through zellij panes.

### Checking status

```bash
bash dev/status.sh
```

This shows the health of all services (nginx, API, UI, mock server, docker services, databases) and lists log files with sizes and timestamps.

### Log files

All dev processes write to `dev/logs/`:
- `dev-api.log` — API server
- `dev-ui.log` — UI dev server (Vite)
- `dev-mock.log` — mock server (simple-directory, events, etc.)
- `docker-compose.log` — all docker compose services

### Troubleshooting

1. Run `bash dev/status.sh` to identify which services are down
2. Read the relevant log file in `dev/logs/` for error details
3. Report findings to the user — do not attempt to fix infrastructure issues yourself

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

The test suite is very long — when iterating on changes always run only the related test cases. The full test suite will be run when pushing by a git hook managed by husky.

### Simulations

Judged simulations of the back-office AI assistant: a simulated user drives the
real chat in a real browser, and a judge reads the transcript. They answer "did a
person get what they came for", which no other test here does.

**Run them with the `/agents-sim` skill**, not by hand. A simulation is not
finished when the browser closes: the transcripts still have to be judged and
reported, and evidence from a previous run has to be cleared first or a case that
never dispatched will report the old verdict as if it were this one's. The skill
does all of that in order; the npm scripts below are just the pieces it drives.

The bridge must already be running. It has a `bridge` pane in the zellij layout,
so it usually is — if not, the maintainer starts it with `npm run dev-bridge`,
never an agent, because it is a long-running foreground process.
`bash dev/status.sh` reports it as `dev-bridge (opt)`.

The underlying scripts, for reference:

```bash
npm run simulate                                # every case
SIM_CASES=lien-ouvert-par-l-utilisateur npm run simulate
npm run simulate:report
```

A run opens a **real browser window** and drives it in front of you — the persona
looks around the page, clicks and types on its own. Do not touch that window
while it runs: you and the persona would be driving the same page, and a stray
click lands in the transcript as something the product did. Set `SIM_HEADLESS=1`
to run without a window. Every run also writes a Playwright trace, so a finished
run can be replayed action by action with `npx playwright show-trace`.

They are **not** part of `npm test` or `npm run quality`, and must never be: every
case spends Claude plan quota. A run also calls `clean()`, which resets the dev
environment's whole test state — not just `test_`-owned datasets, applications
and settings, but also an unfiltered wipe of the `limits`, `applicationsKeys`,
`remoteServices`, `baseApplications`, `extensions-cache`, `thumbnails-cache`,
`locks` and integrity collections, plus the tmp directory.

Cases live in `simulations/cases/index.ts`. See
[docs/architecture/agent-integration.md](docs/architecture/agent-integration.md).

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

In-depth documentation for complex subsystems lives in `docs/architecture/`:

- [Dataset Drafts](docs/architecture/dataset-drafts.md) — draft lifecycle, API mechanics, UI section visibility for file-new vs file-updated
- [Publication Sites](docs/architecture/publication-sites.md) — publication sites model, permissions gate (admin / staging / department), and sync with the `portals` service
- [Testing](docs/architecture/testing.md) — test suite structure, naming conventions, running tests
- [Dataset Validation](docs/architecture/dataset-validation.md) — schema validation, mandatory extensions, diagnostic CSV, file vs REST flows
- [AI Agent Integration](docs/architecture/agent-integration.md) — tools, subagents, action buttons, and prompts exposed to the back-office AI assistant, and the judged simulation suite that exercises them end to end. **When modifying agent tools, subagents, or action buttons, update this document to reflect the changes.**
- [Load Management](docs/architecture/load-management.md) — rate limiting, request timeouts and Elasticsearch query controls across the app and the reverse-proxy layer, plus notes on possible further hardening
- [Caching & cache headers](docs/architecture/caching.md) — the five caching layers (reverse-proxy cache, HTTP cache headers, `memoizee` in-process caches, MongoDB-backed caches, ad-hoc object caches), how they coordinate freshness, and the config reference
- [Map base layer & tileserver](docs/architecture/map-tiles.md) — where dataset maps get their MapLibre style (`map.style`, the same-origin `/tileserver` convention) and the 302 redirect keeping legacy `tileserver-koumoul` remote-service URLs alive, with its removal conditions
- [Application Keys](docs/architecture/application-keys.md) — intermediate-security tier for un-connected access to applications and the datasets they embed: data model, URL shapes, the two enforcement points (proxy + dataset middleware), permission scoping, owner boundary, and the anti-spam stack for anonymous writes
- [Code conventions](docs/architecture/code-conventions.md) — module file roles (router/middlewares/service/operations), request-context accessors, typing ratchet. **Read before refactoring or adding API code.**
- [Date management](docs/architecture/date-management.md) — the date / date-time strategy end to end: French-first sniffing, offset-preserving storage, timezone-aware filters & aggregations, and display in the data's own timezone (not the viewer's). **Read before touching date parsing, storage, or display.**
- [/lines read efficiency](docs/architecture/read-lines-efficiency.md) — the design choices behind the `/lines` hot path: stream the source not the response (ETag/Link preserved, zero observable change), the streamed `LinesSource` + splitter, per-format routing (incl. the pbf/shp zero-copy worker paths and why xlsx stays buffered), the parity/verification harness, and the measured rejected alternatives. **Read before touching the `/lines` read path.**
- [Storage accounting](docs/architecture/storage-accounting.md) — the `store_bytes` / `indexed_bytes` metrics: physical vs CSV-equivalent accounting, the per-line `_bytes` field and sum aggregation, and the organic `_esLineBytes` migration. **Read before touching storage computation or quota enforcement.**

## Common Development Tasks

### Debug Rust native modules (parquet-writer)
```bash
npm -w parquet-writer run build:debug && RUST_BACKTRACE=1 npm test
```