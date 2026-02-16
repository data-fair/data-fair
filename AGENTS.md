# Data Fair - Agent Guidelines

## Project Overview

Data FAIR (Findable, Accessible, Interoperable, Reusable Data) is an open-source data management platform developed by Koumoul. It provides a web-based interface for publishing, exploring, and sharing datasets.

**Version:** 5.17.1  
**License:** AGPL-3.0-only  
**Node.js:** v24

## Architecture

This is a monorepo using npm workspaces with the following packages:

| Package | Description |
|---------|-------------|
| `api` | Express server - REST API, data processing, file storage |
| `ui` | Nuxt.js/Vue.js frontend |
| `shared` | Shared types, utilities, and validation logic |
| `embed-ui` | Embeddable UI components |
| `test` | Test suite |
| `parquet-writer` | Rust native module for Parquet file writing |

## Tech Stack

- **Backend:** Node.js v24, Express v5, MongoDB, ElasticSearch
- **Frontend:** Vue.js 2, Nuxt 2, Vuetify 2
- **Storage:** Local filesystem or S3-compatible storage
- **Data Formats:** CSV, Excel, JSON, GeoJSON, Parquet, Shapefile
- **Standards:** DCAT, RDF, JSON-LD

## Running the Project

### Development Dependencies

```bash
npm run dev-deps          # Start MongoDB, ElasticSearch via Docker
npm run dev-api           # Start API server (port 5600)
npm run dev-ui            # Start frontend dev server
npm run dev-zellij        # Start both with Zellij layout
```

### Testing

```bash
npm test                  # Run all tests
npm run test-deps        # Start test dependencies (Mongo, ES, MinIO)
```

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

## Important Commands

| Command | Description |
|---------|-------------|
| `npm run dev-deps` | Start Docker services (MongoDB, ElasticSearch) |
| `npm run dev-api` | Run API in development mode with hot reload |
| `npm run dev-ui` | Run Nuxt frontend dev server |
| `npm run test` | Run test suite |
| `npm run lint` | Lint all packages |
| `npm run build` | Build production UI |

## Project Conventions

- **Language:** JavaScript ES7+ with TypeScript for types
- **Linting:** neostandard (ESLint-based)
- **Code Style:** ESLint with auto-fix (`npm run lint-fix`)
- **Git Hooks:** Husky for pre-commit lint and commit message validation
- **Testing:** Test files in `test/` workspace

## Key Paths

- API entry: `api/index.ts`
- API source: `api/src/`
- Frontend: `ui/`
- Config: `api/config/`
- Types: `api/types/`

## Common Development Tasks

### Debug Rust native modules (parquet-writer)
```bash
npm -w parquet-writer run build:debug && RUST_BACKTRACE=1 npm test
```

### Build Docker image
```bash
docker build --progress=plain -t data-fair-dev .
```

### Run documentation locally
```bash
npm run doc
```
Then open http://localhost:3144