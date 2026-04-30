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
- [AI Agent Integration](docs/architecture/agent-integration-architecture.md) — tools, subagents, action buttons, and prompts exposed to the back-office AI assistant. **When modifying agent tools, subagents, or action buttons, update this document to reflect the changes.**

## Common Development Tasks

### Debug Rust native modules (parquet-writer)
```bash
npm -w parquet-writer run build:debug && RUST_BACKTRACE=1 npm test
```