# Data Fair - Agent Guidelines

## Project Overview

Data FAIR (Findable, Accessible, Interoperable, Reusable Data) is an open-source data management platform developed by Koumoul. It provides a web-based interface for publishing, exploring, and sharing datasets.

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