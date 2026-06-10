# API code conventions

This document is the **pattern book** for all new and refactored API code. It was introduced by the
express-decoupling refactor series ([master plan](../superpowers/plans/2026-06-10-code-quality-refactor.md)).
Legacy code converges to these conventions module by module across that series; until a module's
phase lands, old patterns coexist — that is expected.

**Read this before refactoring or adding API code.**

---

## 1. Module file roles & dependency direction

Each domain module (`datasets`, `applications`, `settings`, …) converges on:

```
<module>/
  router.ts        # ONLY place req/res appear. Route declarations, middleware chains,
                   # input extraction, service calls, res.send. No business logic.
  middlewares.ts   # thin adapters: parse req → call operations/service → set req context
                   # via symbol accessors. Each middleware's decision logic is an exported
                   # plain function so it is callable without Express.
  service.ts       # express-free orchestration: mongo/ES/files/events. Explicit typed
                   # params (never req). Throws httpError. Callable from workers/tests.
  operations.ts    # pure functions, no I/O at all. The unit-test surface.
  types.ts         # module-local types (optional)
```

**Dependency direction (enforced by review; candidate for a lint rule later):**

- `router → middlewares → service → operations`
- `operations.ts` imports nothing that does I/O.
- `service.ts` never imports Express.
- Cross-module imports target only another module's `service.ts` / `operations.ts` / `types.ts` —
  never its `router.ts` or `middlewares.ts`.
- `misc/utils` is reserved for genuinely generic utilities (`find.js`, `ajv`, `bytes`, …).
  Domain logic currently living there (permissions, api-key, application-key, publication-sites, …)
  keeps its path for now but follows the same split internally; relocation is a Phase 5 decision.

Good existing examples of the target pattern: `remote-services/operations.ts`,
`base-applications/operations.ts`, `files-storage/*`, `workers/*`, `misc/utils/find.js`.

---

## 2. Request context: symbol accessors replace `req` mutation

**The problem:** ~35 distinct properties are mutated onto `req` across 10+ files. Any function that
reads them is coupled to Express. The accessor pattern (following `@data-fair/lib-express`
`session.ts` / `site.ts`) puts all casts in one place and makes the context contract explicit.

### The factory

```ts
// api/src/misc/utils/req-context.ts
export const defineReqContext = <T>(name: string, legacyProp?: string): ReqContext<T> => {
  const key = Symbol(name)
  return {
    set: (req, value) => {
      (req as any)[key] = value
      if (legacyProp) (req as any)[legacyProp] = value   // dual-write during transition
    },
    get: (req) => {
      const value = (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
      if (value === undefined) throw new Error(`req context "${name}" was not set (middleware missing?)`)
      return value
    },
    getOptional: (req) => (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
  }
}
```

### Naming convention

The exported bare accessor name (`reqResource`, `reqNoCache`, `reqPublicBaseUrl`) is the canonical
call site. Its return type encodes the contract:

- `T` — throws when the middleware was not applied. Use `get` when the backing middleware is
  unconditional (always runs on matching routes).
- `T | undefined` — genuinely optional. Use `getOptional` when presence depends on per-request
  conditions.

**Choose based on the setter's runtime guarantee, not by analogy with another accessor.**

### Cross-cutting accessors (in `misc/utils/req-context.ts`)

| Exported name | Type | Source |
|---|---|---|
| `reqResource` / `setReqResource` | `Resource` (throws) | `applications/router.js`, `datasets/middlewares.js` |
| `reqResourceOptional` | `Resource \| undefined` | same |
| `reqResourceType` / `setReqResourceType` | `ResourceType` (throws) | several routers |
| `reqBypassPermissions` / `setReqBypassPermissions` | `BypassPermissions \| undefined` | `api-key.ts`, `application-key.ts` |
| `reqPublicOperation` / `setReqPublicOperation` | `boolean \| undefined` | `permissions.ts` |
| `reqNoCache` / `setReqNoCache` | `boolean \| undefined` | `datasets/middlewares.js` |
| `reqPublicBaseUrl` / `setReqPublicBaseUrl` | `string` (throws) | `app.js` |
| `reqPublicWsBaseUrl` / `setReqPublicWsBaseUrl` | `string` (throws) | `app.js` |
| `reqPublicationSite` / `setReqPublicationSite` | `any \| undefined` | `app.js`, `catalog/router.js` |
| `reqMainPublicationSite` / `setReqMainPublicationSite` | `any \| undefined` | `app.js` |

Module-specific accessors live next to the middleware that sets them (e.g. `reqSettingsParams` in
`settings/middlewares.ts`, `reqDataset` in `datasets/middlewares.*`).

### Current legacy mutation sites (as of 2026-06-10)

The following `req.<prop> = …` assignments remain while phases migrate them:

| File | Properties set |
|---|---|
| `api/src/app.js` | `publicBaseUrl`, `publicWsBaseUrl`, `publicationSite`, `mainPublicationSite` |
| `api/src/datasets/middlewares.js` | `dataset`, `datasetFull`, `noCache`, `url` |
| `api/src/datasets/router.js` | `resourceType`, `linesOwner`, `body`, `_draft` |
| `api/src/datasets/utils/rest.ts` | `_fixedFormBody`, `body`, `_rawBody`, `_uploadedAttachmentPath` |
| `api/src/datasets/es/abort.js` | `esAbortContext` |
| `api/src/applications/router.js` | `resourceType`, `resource`, `baseApp`, `isNewApplication` |
| `api/src/applications/proxy.js` | `application`, `resourceType`, `matchingApplicationKey` |
| `api/src/settings/router.ts` | `owner`, `department`, `ownerFilter` |
| `api/src/remote-services/router.js` | `resourceType`, `remoteService` |
| `api/src/catalog/router.js` | `resourceType`, `publicationSite` |
| `api/src/misc/utils/permissions.ts` | `publicOperation` |
| `api/src/misc/utils/api-key.ts` | `bypassPermissions` |
| `api/src/misc/utils/application-key.ts` | `bypassPermissions`, `matchingApplicationKey` |
| `api/src/api-compat/ods/index.ts` | `resourceType`, `noModifiedCache` |

### Migration mechanics per property

1. Phase 0 shipped the accessor with `legacyProp` configured. `set()` dual-writes — both the
   symbol key and the legacy plain property — so **setters and readers can migrate in any order**.
2. Each module phase converts its readers and setters to use the accessors.
3. Once both greps are empty, drop the `legacyProp` argument (ends dual-write) and remove the
   corresponding member from `RequestWithResource` / ad-hoc types in `api/types/index.ts`:

```bash
# When both return nothing, the property is fully migrated:
grep -rnE "req\.<prop> *= [^=]" api/src          # setters
grep -rnE "\breq\.<prop>\b" api/src               # readers
```

Final state: `api/types/index.ts` `Request`/`RequestWithResource` intersections shrink away;
`@ts-ignore`s on req access disappear.

---

## 3. Express-free services

Service functions receive plain data, never `req`. Recurring shapes:

```ts
// owner context extracted once by the router, passed to service calls
type OwnerContext = { owner: AccountKeys, ownerFilter: Record<string, any> }

// audit-log context without req — same EventLog output as passing { req }
const logCtx = reqEventLogContext(req)  // { user, account, ip, host }
// usage in service:
eventsLog.info('df.event', 'message', { ...logCtx, account: owner })
```

- `reqEventLogContext` is exported from `misc/utils/req-context.ts`.
- Helpers that intrinsically need the HTTP layer (e.g. `notifications.subscribe` forwards the auth
  cookie) are **router-layer helpers**: they stay called from `router.ts`, with any pure
  payload-building extracted to `operations.ts`.
- Validation at the boundary: routers validate/narrow input with `assertValid` / `returnValid`
  (generated validators from `@data-fair/lib-validation`); services receive typed values.

---

## 4. Typing rules

- **js → ts in the same PR:** every `.js` file touched by a phase converts in that phase. Moving
  logic is the natural moment; JSDoc coverage is too thin to bridge.
- **No new suppressions:** no new `@ts-ignore` / `@ts-expect-error` / `as any` outside accessor
  modules. Each phase reduces its module's suppression count; target is 0.
- **Types from schema:** domain types come from JSON schemas via `df-build-types` (`api/types/*`).
  TS2339 "missing property" errors are fixed by **enriching the schema**, not by casting.
- **The ratchet:** `npm run check-types-ratchet` runs `dev/check-types-ratchet.sh`. It is wired
  into `npm run quality` (husky pre-push). The tsc error count may only decrease:

  ```bash
  npm run check-types-ratchet   # prints "api tsc errors: N (baseline: M)"
  ```

  When a PR improves the count, the script updates `dev/type-errors-baseline.txt` automatically —
  commit that file with the PR. Baseline as of 2026-06-10: **1807 errors**.

---

## 5. Refactor guardrails

- **API/e2e specs are the behavior contract:** never modified by refactors. They pin routes,
  status codes, payloads, and permissions.
- **Unit specs:** assertions never change; import paths may be updated in the same PR when a
  tested file moves; new specs for newly extracted `operations.ts` functions are encouraged
  (additions only).
- **Mechanical moves only:** function bodies move verbatim. Signature changes are limited to
  replacing `req` with explicit params. Resist drive-by cleanups — record in the plan's parking
  lot instead.
- **Suspected bugs found while moving:** preserved bit-for-bit in the move, recorded in the plan's
  parking lot (`§9`), never fixed inline. They get a dedicated later PR with a test.
- **Mount and middleware chain order preserved exactly:** load-management depends on it (rate
  limiter runs after api-key resolution — see `docs/architecture/load-management.md §3`).
- **One phase = one worktree = one PR.** Target ≤ ~800 changed LOC per PR where feasible. Datasets
  (Phase 6) is split into four sub-PRs.
