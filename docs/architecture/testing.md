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
npm run test-api-fast      # stops at the first failure, to iterate
npm run test-e2e

# Run a specific test file
npx playwright test tests/features/datasets/bulk.api.spec.ts

# Run a specific test by name
npx playwright test tests/features/datasets/bulk.api.spec.ts -g "test name"

# Run the smoke set
npx playwright test --project=api --project=e2e --grep @smoke
```

Every run writes per-test durations to `dev/logs/test-timings.json` (Playwright's json
reporter, next to the `dot` one). It holds the last run only.

## File Naming Convention

| Suffix | Type | Dependencies |
|--------|------|-------------|
| `*.unit.spec.ts` | Pure unit tests | No server needed |
| `*.api.spec.ts` | API tests (HTTP-only) | Depends on `state-setup` project |
| `*.e2e.spec.ts` | End-to-end browser tests | Depends on `e2e-warmup` (itself on `state-setup`), uses Desktop Chrome |
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
├── state-setup.ts     # Global state setup (runs before api/e2e tests)
└── e2e-warmup.ts      # Visits the main UI routes once so the dev UI transforms them before the e2e tests
```

## Conventions

- `api` specs import `test` from `tests/fixtures/diagnostics.ts`, `e2e` specs import `test` and `expect`
  from `tests/fixtures/login.ts` (which extends it), `unit` specs from `@playwright/test`
- In `e2e` tests use `expect`, in `unit` and `api` tests use standard Node.js asserts
- 30 s per test, **hooks included** (`clean()` in `beforeEach`, `checkPendingTasks()` in `afterEach`).
  A spec chaining dataset finalizations calls `test.slow()` in its `beforeEach` (x3) instead of
  raising a timeout, so slowness stays visible
- `clean()` fails, listing the tasks still running, when the worker is not idle after 20 s: the
  test before it leaked work. `checkPendingTasks()` in `afterEach` has a 10 s budget
- `goToWithAuth(url, user, { org, dep, adminMode })` logs in through simple-directory's API, once per
  user and account per worker (again after 10 min, the id_token lasts 15). Pages never send the
  session keepalive (a future `sd-keepalive` in localStorage), so the single-use exchange token is
  never rotated and every test can share the session

### On a failure

Each failed api or e2e test gets attachments in its trace (`npx playwright show-trace
test-results/<test>/trace.zip`): the last lines of the `api` and `mock` panes (`df-dev logs`,
nothing in CI where `dev/logs/` is uploaded instead), the worker's pending tasks, and, when the
API restarted during the test (nodemon reacting to an edit in the checkout), an attachment named
"the API restarted during this test, re-run it: not a regression", printed under the failure.
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
| pull request | `pull-requests.yml` → `reuse-quality.yml` | the full gate: lint, type ratchet, builds, UI types, audit, and the whole unit/api/e2e suite (unit in the static job, api and e2e in two parallel jobs) |
| release tag | `releases.yml` → `reuse-quality.yml` | the full gate, before building the image |
| nightly | `nightly.yml` → `reuse-quality.yml` | the full gate on master without retries, its e2e tests on one browser engine per night (chromium, firefox, webkit in turn; pull requests stay on chromium), skipped when this master commit already passed a night on that engine |

`npm run quality` still runs the whole gate locally, for when you want the certainty before
pushing.

**Why changed spec files and not `--only-changed`.** Playwright's `--only-changed` follows
the import graph of test files. api and e2e tests reach the code over HTTP, so a change in
`api/src` or `ui/src` never shows up in their imports; only the spec files themselves can
be selected reliably.

**CI jobs.** A build job compiles the types, the UI and `parquet-writer` once (the Rust build is
cached by Swatinem/rust-cache) and shares them as an artifact. The static job runs lint, type
checks, audit and the unit tests. The api and e2e projects run in two parallel jobs, each a fresh
runner with every docker service, a dev API and a dev UI; only the Playwright browser binaries
are cached between runs. `--shard` was dropped: it splits by file order, and the 3 shards came
out at 16 s / 2.6 min / 23.9 min. On a failure a job uploads `test-results/` and `dev/logs/` as
an artifact. A new push on a pull request cancels its running checks.

### The smoke set

Tests tagged `@smoke` (`test('...', { tag: '@smoke' }, ...)`) cover the core flows end to
end — a broken one means the product is broken for most users, not one feature. Keep the
set small: the whole point is that it runs on every push. Tag a test only if it is fast
(check `dev/logs/test-timings.json`) and exercises a path many features depend on. A
feature-specific regression is what the pull request and nightly gates are for.
