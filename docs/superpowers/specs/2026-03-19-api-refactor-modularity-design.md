# API Refactor: Router/Service/Operations Modularity

**Date:** 2026-03-19
**Status:** Draft
**Pattern reference:** [data-fair/agents](https://github.com/data-fair/agents)

## Goal

Refactor the API layer for better maintainability by adopting the router/service/operations pattern from the agents project. Minimize breakage — no behavioral changes, same HTTP endpoints and response shapes.

## Pattern

Each module follows a three-layer structure:

- **Router** (`router.ts/js`) — HTTP layer: request validation, middleware, response formatting
- **Service** (`service.ts`) — Stateful functions: database queries, external calls, state coordination
- **Operations** (`operations.ts`) — Stateless pure functions: data transformation, validation, computation

Not every module needs all three layers. Small modules may only have a router.

## Approach

**Phase 1:** Refactor 3 small existing modules to establish the pattern.
**Phase 2:** Break up `misc/` by promoting routers to top-level modules using the established pattern.

## Phase 1: Small Modules

### search-pages (258 lines)

Current: `router.js` (91L) + `utils.ts` (40L) + `webhook.ts` (127L)

Changes:
- Rename `utils.ts` → `operations.ts` (contains pure functions: `buildPostSearchPage`, `extractPortalId`)
- `router.js` and `webhook.ts` stay as-is
- No service layer needed (no direct DB writes, simple queries in router)
- Update imports

### base-applications (319 lines)

Current: `router.ts` (306L) + `utils.js` (13L)

Changes:
- Create `service.ts` — extract from router: `initBaseApp`, `syncBaseApp`, dataset matching query logic
- Create `operations.ts` — extract from router: dataset requirements matching (pure logic ~80 lines), absorb `clean()` from `utils.js`
- Remove `utils.js`
- Slim down `router.ts` to delegate to service/operations

### remote-services (616 lines)

Current: `router.js` (321L) + `service.ts` (101L) + `utils.ts` (194L)

Changes:
- Rename `utils.ts` → `operations.ts`, keep pure functions: `validateOpenApi`, `computeActions`, `clean`, `initNew`
- Move stateful functions from utils to `service.ts`: `syncDataset`, `init`, `fixConceptsFilters` (queries DB for vocabulary)
- `router.js` stays as-is (proxy endpoint tightly coupled to Express req/res)

## Phase 2: Misc Breakup

### Promoted to top-level modules

#### settings (437L router + 53L settings utils)

```
api/src/settings/
  router.ts    ← misc/routers/settings.ts (slimmed)
  service.ts   ← NEW: API key management, settings CRUD, topics propagation, vocabulary retrieval
  operations.ts ← NEW: pure validation, settings transformation
```

#### admin (201L router + 104L status)

```
api/src/admin/
  router.js    ← misc/routers/admin.js
  service.ts   ← NEW: absorb misc/routers/status.js (health checks, error aggregation)
```

`status.js` is used by both `admin.js` and `root.ts` (for `/ping`). The `ping` function stays as a shared utility in `misc/utils/` (or is inlined in `root.ts`). The rest of status.js (health checks, error aggregation) becomes the admin service layer.

#### limits (155L)

```
api/src/limits/
  router.ts    ← extracted from misc/utils/limits.ts (3 endpoints)
  service.ts   ← extracted from misc/utils/limits.ts (getLimits, remaining, incrementConsumption, setConsumption)
```

Currently a single file mixing router + logic. Clean split.

#### identities (157L)

```
api/src/identities/
  router.js    ← misc/routers/identities.js
  service.ts   ← NEW: bulk update/delete, GDPR report generation
```

#### catalog (180L)

```
api/src/catalog/
  router.js     ← misc/routers/catalog.js
  operations.ts ← NEW: DCAT transformation (pure data mapping)
```

#### activity (37L) — router only

```
api/src/activity/
  router.js    ← misc/routers/activity.js
```

#### stats (27L) — router only

```
api/src/stats/
  router.ts    ← misc/routers/stats.ts
```

### What stays in misc/

#### Routers (unchanged)

- `misc/routers/root.ts` — serves `/ping`, `/api-docs.json`, `/vocabulary`, `/projections`, etc.
- `misc/routers/test-env.ts` — development-only test environment endpoints (353L)

#### Utils (flat directory, no reorganization)

- `permissions.ts` — used across many modules
- `find.js` — query building used across many modules
- `settings.ts` — cross-cutting utility (`getFullOwnerVocabulary`, `memoizedGetPublicationSiteSettings`), imported by `app.js`, `remote-services`, `datasets`, `root.ts`. Stays shared, does NOT move into the settings module.
- `notifications.ts` — event notifications
- `journals.ts` — event logging
- `cache-headers.js` — HTTP cache control
- `rate-limiting.ts` — rate limiting middleware
- `observe.ts`, `metrics.ts` — observability
- `api-key.ts` — imports type guards from settings router; import path must be updated when settings moves
- `dcat/` subdirectory (4 files) — stays in misc/utils/ as shared DCAT utilities, imported by catalog module
- Format helpers: `bytes.js`, `csv-sniffer.js`, `markdown.js`, `geohash.js`, `icalendar.js`, `xlsx.ts`, etc.

## Import Aliases

Use existing `#config` and `#mongo` aliases (already defined in `api/package.json`) in newly created/modified files. No mass migration of existing relative imports.

## app.js Updates

### Mount points
Updated to import from new module locations:
```js
// Before
app.use('/api/v1/settings', (await import('./misc/routers/settings.ts')).default)
// After
app.use('/api/v1/settings', (await import('./settings/router.ts')).default)
```

### Init calls
`app.js` also calls init functions that move:
- `(await import('./remote-services/utils.ts')).init()` → `(await import('./remote-services/service.ts')).init()`
- `(await import('./misc/utils/limits.ts')).router` → `(await import('./limits/router.ts')).router`

No URL changes — all endpoints keep their existing paths.

## Import Path Updates (limits)

`limits.ts` has the highest fan-in of any moved file. All consumers must be updated:
- `app.js` (router mount)
- `datasets/router.js`
- `datasets/utils/storage.ts`
- `misc/utils/metadata-attachments.ts`
- `misc/routers/stats.ts`

## TypeScript Strategy

- New files (`service.ts`, `operations.ts`) are always TypeScript
- Existing router files keep their current language (`.js` stays `.js`, `.ts` stays `.ts`)
- No mass JS-to-TS migration

## Phase 2 Implementation Order

1. **limits** — highest fan-in, depended on by datasets, stats, metadata-attachments. Do first so consumers can be updated early.
2. **activity, stats** — trivial router-only moves, quick wins.
3. **catalog** — moderate complexity, DCAT operations extraction.
4. **admin** — absorbs status.js, moderate complexity.
5. **identities** — complex service extraction (cascading deletes).
6. **settings** — heaviest module, most extraction work. Do last when pattern is well-established.

## Constraints

- No behavioral changes to any endpoint
- No response shape changes
- No middleware changes
- No database changes
- Existing tests must pass without modification
