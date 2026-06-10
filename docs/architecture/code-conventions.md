# API code conventions

This document is the **pattern book** for all new and refactored API code. It was introduced by the
express-decoupling refactor series ([master plan](../superpowers/plans/2026-06-10-code-quality-refactor.md)).
That plan is a local working file (gitignored under `docs/superpowers/`), not committed — this doc is the committed reference.
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

**File splitting:** one `service.ts` / `operations.ts` per module until the file reaches
~400–500 lines **or** a sub-resource accumulates a cluster of ≥3 functions; then split into
`module/service/<sub-resource>.ts` (likewise `module/operations/<sub-resource>.ts`), mirroring the
router's sub-paths. The router stays one file per mount — very large routers may split into
`module/routes/*.ts` adapters composed by `router.ts` (planned for the datasets phase of the master
plan), but the mount point remains a single `router.ts`. `settings/service.ts` (~300 lines, with
publication-sites at 3 functions) sits just under both thresholds and stays whole.

**Guards & error style:** new middleware code reports failures by throwing `httpError(...)` —
never `res.status(...).send(...)` / `res.sendStatus(...)`. The `res.status(400).send(…)` and
`res.sendStatus(403)` forms still visible in `settings/middlewares.ts` are legacy behavior
preserved bit-for-bit by the refactor (§5); do not copy them into fresh code. A guard middleware
that composes a **single** existing express-free predicate (e.g. `isOwnerMember` calling
`permissions.getOwnerRole`) may keep that call inline; a guard composing **multiple** conditions or
data sources extracts an exported express-free predicate, per the `middlewares.ts` contract above.

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

**The problem:** ~30 distinct properties are mutated onto `req` across 10+ files (casts like
`(req as any).prop = …` escape a plain-property grep — when migrating a module, also grep for
`(req as any)`). Any function that reads them is coupled to Express. The accessor pattern (following
`@data-fair/lib-express` `session.ts` / `site.ts`) puts all casts in one place and makes the
context contract explicit.

Accessors exist so middlewares can hand context to later handlers; they are never a substitute for passing explicit params into services (§3).

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
| `reqResource` / `setReqResource` | `Resource` (throws) | `applications/router.js`, `applications/proxy.js`, `datasets/middlewares.js`, `remote-services/router.js` |
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

The same co-location applies to **context builders**: helpers that assemble a service write
context from `req` live in `middlewares.ts` next to the accessors they compose — not in
`router.ts`. Example: `reqWriteContext` in `settings/middlewares.ts`, which combines
`reqSettingsParams`, `reqSessionAuthenticated`, `reqHost` and `reqEventLogContext` into a
`SettingsWriteContext`.

### Path param narrowing (Express 5)

Express 5 types `req.params.x` as `string | string[]`. The single blessed, cast-free narrowing
idiom is:

```ts
if (typeof req.params.type !== 'string' || typeof req.params.id !== 'string') throw httpError(400, 'invalid path parameters')
```

(see `settingsParamsMiddleware` in `settings/middlewares.ts`). Use this one idiom everywhere —
never `as string` or ad-hoc per-handler variants. When a route file reads many params, put the
guard in the param middleware (`router.use('/:type/:id', …)`) so downstream handlers read the
narrowed context instead of re-checking; params that appear in a single route (e.g.
`:siteType/:siteId` in the settings publication-sites delete) keep the same guard at the top of
that handler.

### Current legacy mutation sites (as of 2026-06-10 — regenerate with `grep -rnE "req\.[a-zA-Z_]+ *= [^=]" api/src --include='*.js' --include='*.ts'` plus the `(req as any)` sweep)

The following `req.<prop> = …` assignments remain while phases migrate them:

| File | Properties set |
|---|---|
| `api/src/app.js` | `publicBaseUrl`, `publicWsBaseUrl`, `publicationSite`, `mainPublicationSite` |
| `api/src/datasets/middlewares.js` | `dataset`, `resource`, `datasetFull`, `noCache`, `url` |
| `api/src/datasets/router.js` | `resourceType`, `linesOwner`, `body`, `_draft` |
| `api/src/datasets/utils/rest.ts` | `_fixedFormBody`, `body`, `_rawBody`, `_uploadedAttachmentPath` |
| `api/src/datasets/es/abort.js` | `esAbortContext` |
| `api/src/applications/router.js` | `resourceType`, `resource`, `application`, `baseApp`, `isNewApplication` |
| `api/src/applications/proxy.js` | `application`, `resource`, `resourceType`, `matchingApplicationKey` |
| `api/src/remote-services/router.js` | `resourceType`, `remoteService`, `resource` |
| `api/src/catalog/router.js` | `resourceType`, `publicationSite` |
| `api/src/misc/utils/permissions.ts` | `publicOperation` |
| `api/src/misc/utils/api-key.ts` | `bypassPermissions` |
| `api/src/misc/utils/application-key.ts` | `bypassPermissions` |
| `api/src/api-compat/ods/index.ts` | `resourceType`, `noModifiedCache` |

Rows disappear as module phases land: `settings` (Phase 1) is fully migrated — its former
`owner` / `department` / `ownerFilter` row is gone and the three greps below come back empty for
those properties.

### Migration mechanics per property

Brand-new context properties never pass `legacyProp`; dual-write and the fallback read are migration-only mechanisms for properties that already exist as plain mutations.

1. Phase 0 shipped the accessor with `legacyProp` configured. `set()` dual-writes — both the
   symbol key and the legacy plain property — so **setters and readers can migrate in any order**.
2. Each module phase converts its readers and setters to use the accessors.
3. Once all three greps are empty, drop the `legacyProp` argument (ends dual-write) and remove the
   corresponding member from `RequestWithResource` / ad-hoc types in `api/types/index.ts`:

```bash
# When all three return nothing, the property is fully migrated:
grep -rnE "req\.<prop> *= [^=]" api/src          # setters
grep -rnE "\breq\.<prop>\b" api/src               # readers
grep -rn "(req as any)" api/src | grep "<prop>"   # cast-escaped accesses
```

Final state: `api/types/index.ts` `Request`/`RequestWithResource` intersections shrink away;
`@ts-ignore`s on req access disappear.

---

## 3. Express-free services

Service functions receive plain data, never `req`.

**Service signatures:** every exported service function takes the module's params/context object
as its **first argument** — `<Module>Params` for reads, `<Module>WriteContext` for writes — never a
bare mongo filter. The WriteContext carries only request-derived ambient data (parsed path params /
resource refs, `sessionState`, `host`, `logCtx`) that **at least two** functions consume; payloads
and per-operation flags stay explicit arguments. Worked example, `settings/service.ts`:

```ts
// reads: parsed once by the param middleware, first arg of every read function
type SettingsParams = { owner: AccountKeys, department?: string, ownerFilter: Record<string, any> }
// writes: ambient request-derived context shared by all write functions
type SettingsWriteContext = SettingsParams & { sessionState: SessionStateAuthenticated, host: string, logCtx: LogContext }

getTopics(params: SettingsParams)
updateSettings(ctx: SettingsWriteContext, settings)               // payload = explicit arg
deletePublicationSite(ctx: SettingsWriteContext, siteType, siteId)
```

Other recurring shapes:

```ts
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
  commit that file with the PR. `dev/type-errors-baseline.txt` is the source of truth for the
  current baseline (1800 errors as of 2026-06-10).

---

## 5. Refactor guardrails

- **API/e2e specs are the behavior contract:** never modified by refactors. They pin routes,
  status codes, payloads, and permissions.
- **Unit specs:** assertions never change; import paths may be updated in the same PR when a
  tested file moves. Newly extracted `operations.ts` functions get pinning unit specs **in the same
  PR** — additions only — at `tests/features/<module>/<module>-operations.unit.spec.ts`
  (e.g. `tests/features/settings/settings-operations.unit.spec.ts`).
- **Mechanical moves only:** function bodies move verbatim. Signature changes are limited to
  replacing `req` with explicit params. Resist drive-by cleanups — record in the plan's parking
  lot instead; if you don't have the local plan file, record it in the PR description or an issue instead.
- **Suspected bugs found while moving:** preserved bit-for-bit in the move, recorded in the plan's
  parking lot (`§9`), never fixed inline (if the local plan is unavailable, note them in the PR description or a new issue). They get a dedicated later PR with a test.
- **Mount and middleware chain order preserved exactly:** load-management depends on it (rate
  limiter runs after api-key resolution — see `docs/architecture/load-management.md §3`).
- **One phase = one worktree = one PR.** Target ≤ ~800 changed LOC per PR where feasible. Datasets
  (Phase 6) is split into four sub-PRs.
