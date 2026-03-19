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

The test suite uses Playwright Test as the test runner. It is very long — when iterating on changes always run only the related test cases. The full test suite will be run when pushing by a git hook managed by husky.

```bash
# Start test dependencies (Mongo, ES, MinIO), these will usually already be started when an AI agent is used
npm run test-deps
# Run all tests
npm test
# Run only unit tests / api tests / e2e tests
npm run test-unit
npm run test-api
npm run test-e2e
# Run a specific test file
npx playwright test tests/features/datasets/upload/datasets-upload.api.spec.ts --max-failures=1
# Run a specific test by title
npx playwright test tests/features/datasets/upload/datasets-upload.api.spec.ts -g "test name" --max-failures=1
```

**Test structure:**
- `tests/features/` — test specs organized by domain (datasets, auth, infra, settings, etc.)
- `tests/support/` — shared utilities (axios helpers, workers, events)
- `tests/resources/` — test data files (CSV, JSON, GeoJSON, etc.)
- `tests/fixtures/` — Playwright fixtures (e.g. login)

**Test file naming:** `<name>.<project>.spec.ts` where project is `unit`, `api`, or `e2e` (matches Playwright project config).

**Test conventions:**
- Use `test` (or `test.describe`) from `@playwright/test` and `assert` from `node:assert/strict`
- Import utilities from relative paths to `tests/support/` (e.g. `../../../support/axios.ts`)
- Reference resource files with relative paths from repo root: `./tests/resources/...`

**Note:** Some tests use large datasets and may hit storage limits. The test config sets `datasetStorage: 160000` bytes.

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