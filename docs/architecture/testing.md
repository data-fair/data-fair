# Test Suite

## Overview

The test suite uses **Playwright** as test runner with three sub-projects: `unit`, `api`, and `e2e`. Tests are organized by feature under `tests/features/`.

The judged agent simulations (`*.sim.spec.ts`, under `simulations/`) live under their own `playwright.sim.config.ts` instead — a bare `playwright test` or `npm test` can never reach them, because every case spends Claude plan quota. See `npm run simulate` in AGENTS.md's Simulations section and [agent-integration.md](agent-integration.md).

The test suite is very long — when iterating on changes always run only the related test cases. See [Quality gates](#quality-gates) for what runs on commit, push, pull request and nightly.

## Running Tests

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

# Run the smoke set
npx playwright test --project api --project e2e --grep @smoke
```

Every run writes per-test durations to `dev/logs/test-timings.json` (Playwright's json
reporter, next to the `dot` one). It holds the last run only.

## File Naming Convention

| Suffix | Type | Dependencies |
|--------|------|-------------|
| `*.unit.spec.ts` | Pure unit tests | No server needed |
| `*.api.spec.ts` | API tests (HTTP-only) | Depends on `state-setup` project |
| `*.e2e.spec.ts` | End-to-end browser tests | Depends on `state-setup`, uses Desktop Chrome |
| `*.sim.spec.ts` | Judged agent simulations | Own `playwright.sim.config.ts`; not part of `npm test` |

## Directory Structure

```
tests/
├── features/          # Test specs organized by feature
│   ├── datasets/      #   dataset-related tests
│   ├── auth/          #   authentication tests
│   ├── remote-services/
│   └── ...
├── support/           # Shared utilities (axios, events, workers)
├── fixtures/          # Playwright fixtures
├── resources/         # Test data files
└── state-setup.ts     # Global state setup (runs before api/e2e tests)
```

## Conventions

- Use `test` from `@playwright/test`
- In `e2e` tests use `expect` from `@playwright/test`, in `unit` and `api` tests use standard Node.js asserts
- Tests interact with the API via HTTP (no direct DB access from tests)
- Import utilities from `tests/support/`

## Quality gates

The full suite takes about 22 minutes on one worker (measured 2026-10: unit 7 s, api 12.8 min,
e2e 8 min) and must stay single-worker inside an environment (tests share the dev env
state), so it does not run on every push. The pre-push gate takes about a minute (type
ratchet ~10 s, unit ~18 s, smoke set ~40 s) plus whatever spec files the push changed. Each layer
runs what is worth its cost there:

| When | Where | What |
|---|---|---|
| commit | `.husky/pre-commit` | `npm run lint`, with the eslint cache (a few seconds warm) |
| push | `.husky/pre-push` → `dev/pre-push.sh` | type ratchet, all unit tests, the `@smoke` api/e2e set, and the api/e2e spec files changed since `origin/master` |
| push | `commits.yml` | docker build + staging deploy only, no quality checks |
| pull request | `pull-requests.yml` → `reuse-quality.yml` | the full gate: lint, type ratchet, builds, UI types, audit, and the whole unit/api/e2e suite over 3 parallel shards |
| release tag | `releases.yml` → `reuse-quality.yml` | the full gate, before building the image |
| nightly | `nightly.yml` → `reuse-quality.yml` | the full gate on master without retries, skipped when master has not moved since the last green nightly run |

`npm run quality` still runs the whole gate locally, for when you want the certainty before
pushing.

**Why changed spec files and not `--only-changed`.** Playwright's `--only-changed` follows
the import graph of test files. api and e2e tests reach the code over HTTP, so a change in
`api/src` or `ui/src` never shows up in their imports; only the spec files themselves can
be selected reliably.

**CI shards.** Each shard is a fresh runner with its own docker services (the `dev`
profile, as locally), dev API and dev UI, running `playwright test --shard=i/3`. Setup costs
about 1.5 minutes per shard: the docker pull is cheap on GitHub runners, the Rust build of
`parquet-writer` was the expensive part and is cached (Swatinem/rust-cache), so a shard only recompiles what changed. On a failure
the shard uploads `test-results/` and `dev/logs/` as an artifact.

### The smoke set

Tests tagged `@smoke` (`test('...', { tag: '@smoke' }, ...)`) cover the core flows end to
end — a broken one means the product is broken for most users, not one feature. Keep the
set small: the whole point is that it runs on every push. Tag a test only if it is fast
(check `dev/logs/test-timings.json`) and exercises a path many features depend on. A
feature-specific regression is what the pull request and nightly gates are for.
