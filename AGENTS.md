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

The test suite is very long, when iterating on changes always run only the related test cases. The full test suite will be run when pushing by a git hook managed by husky.

```bash
# Start test dependencies (Mongo, ES, MinIO), these will usually already be started when an AI agent is used
npm run test-deps        
# Run all tests
npm test
# Run a specific test
npm run test-base test-it/<test-name>.ts -t "test name"
```

**Test conventions:**
- Use `describe`, `it`, `before`, `after`, `beforeEach`, `afterEach` from `node:test`
- Use `assert.rejects(promise, { status: XXX })` instead of try-catch blocks for error assertions
- Import utilities from `./test-it/utils/index.ts`
- Import workers dynamically: `const workers = await import('../api/src/workers/index.ts')`
- Use absolute paths for resources: `path.resolve(import.meta.dirname, '../test-it/resources/...')`
- Type annotations often needed for callback functions: `(err: any) => err.key`

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