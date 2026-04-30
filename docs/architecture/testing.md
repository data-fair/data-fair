# Test Suite

## Overview

The test suite uses **Playwright** as test runner with three sub-projects: `unit`, `api`, and `e2e`. Tests are organized by feature under `tests/features/`.

The test suite is very long — when iterating on changes always run only the related test cases. The full test suite will be run when pushing by a git hook managed by husky.

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
```

## File Naming Convention

| Suffix | Type | Dependencies |
|--------|------|-------------|
| `*.unit.spec.ts` | Pure unit tests | No server needed |
| `*.api.spec.ts` | API tests (HTTP-only) | Depends on `state-setup` project |
| `*.e2e.spec.ts` | End-to-end browser tests | Depends on `state-setup`, uses Desktop Chrome |

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
└── state-teardown.ts  # Global state teardown
```

## Conventions

- Use `test` from `@playwright/test`
- In `e2e` tests use `expect` from `@playwright/test`, in `unit` and `api` tests use standard Node.js asserts
- Tests interact with the API via HTTP (no direct DB access from tests)
- Import utilities from `tests/support/`
