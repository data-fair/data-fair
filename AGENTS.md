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

The test suite uses Playwright as test runner with three sub-projects: `unit`, `api`, and `e2e`. Tests are organized by feature under `tests/features/`. The test suite is very long — when iterating on changes always run only the related test cases. The full test suite will be run when pushing by a git hook managed by husky.

```bash
# Run all tests
npm test
# Run a specific sub-project
npm run test-unit
npm run test-api
npm run test-e2e
# Run a specific test file
npx playwright test tests/features/datasets/bulk.api.spec.ts
# Run a specific test by name
npx playwright test tests/features/datasets/bulk.api.spec.ts -g "test name"
```

**File naming convention:**
- `*.unit.spec.ts` — pure unit tests (no server needed)
- `*.api.spec.ts` — API tests (HTTP-only, depend on `state-setup` project)
- `*.e2e.spec.ts` — end-to-end browser tests (depend on `state-setup` project, use Desktop Chrome)

**Test structure:**
- `tests/features/` — test specs organized by feature (datasets, auth, remote-services, etc.)
- `tests/support/` — shared utilities (axios, events, workers)
- `tests/fixtures/` — Playwright fixtures
- `tests/resources/` — test data files
- `tests/state-setup.ts` / `tests/state-teardown.ts` — global state lifecycle

**Test conventions:**
- Use `test` from `@playwright/test`
- In `e2e` tests use `expect` from `@playwright/test`, in `unit` and `api` tests use standard nodejs asserts.
- Tests interact with the API via HTTP (no direct DB access from tests)
- Import utilities from `tests/support/`

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

## Common Development Tasks

### Debug Rust native modules (parquet-writer)
```bash
npm -w parquet-writer run build:debug && RUST_BACKTRACE=1 npm test
```