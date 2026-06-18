# API code conventions

This document is the **pattern book** for all new and refactored API code. It was introduced by the
express-decoupling refactor series ([master plan](../plans/2026-06-10-code-quality-refactor.md)).
The plan carries the phase sequencing, sub-plan briefs and the parking lot; this doc carries the conventions.
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

### Placement: config-free home (revised 2026-06-16)

**Cross-cutting accessors must be importable by config-free code.** A unit-tested pure util
(e.g. `query-advice.ts`) imports an accessor; if that accessor is defined in a module that
imports `#config`/`#mongo`, the pure module transitively loads and *validates* config at import
time — which has no config dir under the `unit` test project and throws. (This actually broke the
`query-advice` unit spec: its `reqPublicOperation` accessor was defined in `permissions.ts`, which
imports `#config`.)

Rules:
- The `defineReqContext` factory and the **cross-cutting** accessors (`resource`, `resourceType`,
  `bypassPermissions`, `publicOperation`) live in the **config-free** `misc/utils/req-context.ts`.
  It imports only types + `@data-fair/lib-express` — never `#config`/`#mongo`.
- A module may host its own cross-cutting accessor **only if that module is itself config-free**
  (e.g. `public-base-url.ts`, which imports only `defineReqContext`).
- When the natural **semantic owner** is config-coupled, define the accessor in `req-context.ts`
  and **re-export it from the owner as a facade** (as `permissions.ts` now does), so both
  `permissions.<accessor>` namespace consumers and config-free direct importers work.
- Module-**local** accessors still sit next to the middleware that sets them (e.g.
  `reqSettingsParams` in `settings/middlewares.ts`, `reqDataset` in `datasets/middlewares.*`) —
  those modules aren't imported by config-free pure code.
- Define each accessor in the phase that migrates its setter or readers, never ahead of need.

Homes for the cross-cutting contexts (names and `get`/`getOptional` contracts are fixed):

| Accessor | Type | Home | Set from |
|---|---|---|---|
| `reqResource` / `setReqResource` / `reqResourceOptional` | `Resource` (throws / optional) | `req-context.ts` (re-exported by `permissions.ts`) | `applications/*`, `datasets/middlewares.ts`, `remote-services/router.js` |
| `reqResourceType` / `setReqResourceType` | `ResourceType` (throws) | `req-context.ts` (re-exported by `permissions.ts`) | several routers |
| `reqBypassPermissions` / `setReqBypassPermissions` | `BypassPermissions \| undefined` | `req-context.ts` (re-exported by `permissions.ts`) | `api-key.ts`, `application-key.ts` |
| `reqPublicOperation` / `setReqPublicOperation` | `boolean \| undefined` | `req-context.ts` (re-exported by `permissions.ts`) | `permissions.ts` |
| `reqNoCache` / `setReqNoCache`, `reqNoModifiedCache` / `setReqNoModifiedCache` | `boolean \| undefined` | `misc/utils/cache-headers.ts` | `datasets/middlewares.ts`, `api-compat/ods` |
| `reqDataset` / `setReqDataset` / `reqDatasetOptional`, `reqDatasetFull` / `setReqDatasetFull` / `reqDatasetFullOptional` | `Dataset` (get throws / optional) | `datasets/middlewares.ts` (module-local) | `datasets/middlewares.ts` (read by `datasets/router.js` + `datasets/utils/*` via legacyProp until 6d) |
| `reqPublicBaseUrl` / `setReqPublicBaseUrl`, `reqPublicWsBaseUrl` / `setReqPublicWsBaseUrl` | `string` (throws) | `misc/utils/public-base-url.ts` (config-free) | `app.js` |
| `reqPublicationSite` / `setReqPublicationSite`, `reqMainPublicationSite` / `setReqMainPublicationSite` | `any \| undefined` | `misc/utils/publication-sites.ts` | `app.js`, `catalog/router.js` |
| `reqEsAbortContext` / `setReqEsAbortContext` / `reqEsAbortContextOptional` | `EsAbortContext` (get throws / optional) | `datasets/es/abort.ts` | `datasets/es/abort.ts` (read by `rate-limiting.ts`, `datasets/router.js`) |

Note: `cache-headers.ts` and `publication-sites.ts` are config-coupled but still host their own
accessors — acceptable for now because **no config-free module imports them**. If that changes,
move the accessor to `req-context.ts` and re-export (the facade pattern above). `esAbortContext`
is a near-module-local accessor whose config-coupled home (`datasets/es/abort.ts`) is likewise
acceptable: its only non-router reader (`rate-limiting.ts`) is not pure / unit-tested, so a
config-free home is not required.

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
| `api/src/datasets/middlewares.ts` | `url` only (`dataset` / `resource` / `datasetFull` / `noCache` / `linesOwner` / `_draft` now set via accessors — Phase 6c/6d) |
| `api/src/datasets/router.ts` | *(none — fully migrated Phase 6d; `resourceType` now `setReqResourceType`, body-mutating handlers moved to `routes/*.ts`)* |
| `api/src/datasets/utils/rest.ts` | `body` (`_fixedFormBody` now a module-local accessor; `_rawBody` / `_uploadedAttachmentPath` eliminated — Phase 6b) |
| `api/src/datasets/es/abort.ts` | `esAbortContext` (now an accessor — see note below) |
| `api/src/applications/router.js` | `resourceType`, `resource`, `application`, `baseApp`, `isNewApplication` |
| `api/src/applications/proxy.js` | `application`, `resource`, `resourceType`, `matchingApplicationKey` |
| `api/src/misc/utils/permissions.ts` | `publicOperation` |
| `api/src/misc/utils/api-key.ts` | `bypassPermissions` |
| `api/src/misc/utils/application-key.ts` | `bypassPermissions` |
| `api/src/api-compat/ods/index.ts` | `resourceType`, `noModifiedCache` |

Rows disappear as module phases land. `settings` (Phase 1) is fully migrated. `catalog` and
`remote-services` (Phase 2 / partial Phase 3, 2026-06-12) now set `resourceType` / `resource` /
`publicationSite` / `remoteService` through accessors (`setReqResourceType`, `setReqResource`,
`setReqPublicationSite`, `setReqRemoteService`) instead of raw mutation. The cross-cutting accessors
now live in their topical homes: `resource` / `resourceType` in `misc/utils/permissions.ts`,
`publicationSite` / `mainPublicationSite` in `misc/utils/publication-sites.ts`,
`remoteService` in `remote-services/middlewares.ts` — all keep `legacyProp` dual-write because
datasets/applications routers still set `resource` / `resourceType` by raw mutation.
`esAbortContext` (Phase 6a, 2026-06-16) is now set through the `setReqEsAbortContext` accessor in
`datasets/es/abort.ts` (module-local, `legacyProp` dual-write); its only non-router reader,
`misc/utils/rate-limiting.ts`, was migrated to `reqEsAbortContextOptional`. The `legacyProp` is
**retained** because `datasets/router.js` still reads `req.esAbortContext` by raw access; drop it
when `router.js` migrates (slice 6c/6d).
Phase 6b (2026-06-17) decoupled the `rest.ts` attachment helpers: `_rawBody` and
`_uploadedAttachmentPath` were **eliminated** (now locals/return values of an express-free
`manageAttachment` / `rollbackUploadedAttachment`), and `_fixedFormBody` became a **module-local
accessor** (`defineReqContext`, no `legacyProp` — only `rest.ts` set/read it). The mounted line
route handlers stay `(req, res, next)` adapters that assemble the helper context at the boundary.
Phase 6c (2026-06-17) converted `datasets/service.js` → `.ts` (already express-free, types only) and
`datasets/middlewares.js` → `.ts`. The middlewares now set `dataset` / `datasetFull` through new
**module-local** accessors (`setReqDataset` / `setReqDatasetFull`, `legacyProp` dual-write) and set
`resource` / `noCache` through the existing `setReqResource` / `setReqNoCache` accessors; reads of
`publicationSite` / `mainPublicationSite` / `resource` use the existing optional getters. `req.url`
(a genuine Express prop, not request context) is the only remaining raw mutation. The `dataset` /
`datasetFull` `legacyProp` is **retained** because `datasets/router.js` (≈213 reads) and the typed
`datasets/utils/*` files still read `req.dataset` / `req.datasetFull` by raw access — drop it (and the
`esAbortContext` legacyProp) when `router.js` migrates in slice 6d.
Phase 6d (2026-06-18) split `datasets/router.js` into `routes/*.ts` thin adapters composed by a 33-line
`datasets/router.ts` (`datasets/` is now 100% TS). All remaining datasets `req.*` reads migrated to
accessors. New accessors: `linesOwner` + `_draft` (module-local in `middlewares.ts`, `legacyProp` —
`rest.ts` / `upload.ts` still raw-read) and `operation` (`setReqOperation` / `reqOperation` in
`permissions.ts`, **no** `legacyProp` — atomic: `permissions.middleware` sets it, the files
metadata-attachments GET is the only reader). The `resourceType` `.use` now calls `setReqResourceType`.
**`legacyProp` dropped** for `resource` / `datasetFull` / `esAbortContext` (grep-verified no raw readers
repo-wide). **`legacyProp` retained** for `dataset` (`query-advice.ts` / `upload.ts` / `rest.ts` /
`outputs.ts` raw-read) and `resourceType` (`api-compat/ods/index.ts` still raw-sets it — drop both in
Phase 7). Several middlewares were re-typed `req: RequestWithResource` → `req: Request` at the source
(`permissions.middleware` / `canDoForOwnerMiddleware`, `application-key`) since they only read context via
accessors — this removes the `router.<verb>(…)` overload friction; do the same for any middleware that
breaks a typed route chain. The `clamav.middleware` DOM-`Response` parking-lot item was resolved here.

### Migration mechanics per property

Brand-new context properties never pass `legacyProp`; dual-write and the fallback read are migration-only mechanisms for properties that already exist as plain mutations.

1. The migrating phase defines the accessor in its topical home (table above) with `legacyProp`
   configured. `set()` dual-writes — both the symbol key and the legacy plain property — so
   **setters and readers can migrate in any order**.
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
- **Rename = update every importer specifier + boot-check (Phase 6a lesson):** renaming `X.js`→`X.ts`
  requires rewriting EVERY importer's `'…/X.js'` specifier to `.ts` **repo-wide** (siblings, barrel,
  cross-module, `benchmark/`, `tests/`, `contract/`, `types/`, JSDoc `import()`) — Node's
  `--experimental-strip-types` does NOT rewrite `.js`→`.ts` at runtime, so a stale specifier crashes
  with `ERR_MODULE_NOT_FOUND` even though `tsc`/the ratchet resolve it fine. Always run at least one
  api spec after a rename to confirm the app still boots — `tsc` alone won't catch this.
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
  replacing `req` with explicit params. Resist drive-by cleanups — record in the master plan's parking
  lot (`docs/plans/2026-06-10-code-quality-refactor.md §9`) instead.
- **Suspected bugs found while moving:** preserved bit-for-bit in the move, recorded in the plan's
  parking lot (`§9`), never fixed inline. They get a dedicated later PR with a test.
- **Mount and middleware chain order preserved exactly:** load-management depends on it (rate
  limiter runs after api-key resolution — see `docs/architecture/load-management.md §3`).
- **One phase = one worktree = one PR.** Target ≤ ~800 changed LOC per PR where feasible. Datasets
  (Phase 6) is split into four sub-PRs.

## 6. `misc/utils` classification (Phase 5b triage, 2026-06-15)

As of Phase 5b, `api/src/misc/utils/` is **100% TypeScript** (no `.js` remain). The junk-drawer
dissolution is otherwise *deferred*: files are classified below but **not relocated** in this series
(bulk moves would be churn with little type/decoupling value; do them opportunistically when a domain
phase already touches the file).

**Generic utilities — stay in `misc/utils` permanently** (no domain coupling): `ajv`, `axios`,
`http-agents`, `pipe`, `nanoid`, `bytes`, `heap`, `geohash`, `batch-stream`, `decode-stream`, `bom`,
`markdown`, `icalendar`, `csv-sniffer`, `xlsx`, `unzip`, `exec`, `cache`, `assert-immutable`,
`expect-type`, `promisify-middleware`, `compute-budget`, `find` (pure query builder), `service-workers`,
`visibility`, `observe`, `dcat/*`, `ambient-modules.d.ts`. Request-context infrastructure also stays
here: `req-context`, `public-base-url`, and the accessor homes `permissions` / `cache-headers` /
`publication-sites` (see §2 placement table).

**Domain-in-disguise — record target module, relocate later (only when cheap / when its domain phase touches it):**

| File | Target module | Note |
|---|---|---|
| `api-key.ts`, `application-key.ts` | auth / sessions | request middlewares; auth domain |
| `capture.ts`, `thumbnails.ts` | applications | app screenshot/preview generation |
| `metadata-attachments.ts` | datasets + applications | attachment upload handling |
| `query-advice.ts` | datasets | query hinting (unit-tested — keep export paths) |
| `catalogs-publication-queue.ts` | catalogs | |
| `journals.ts` | journals/events | |
| `notifications.ts`, `mails.ts` | notifications | |
| `webhooks.ts` | webhooks | |
| `topics.ts`, `licenses.ts`, `settings.ts` | settings | settings-scoped data helpers |
| `users.ts` | identities/users | |
| `metrics.ts`, `metrics-api.ts` | metrics | |
| `clamav.ts` | files-storage / security | borderline generic |
| `rate-limiting.ts` | load-management | borderline generic infra |
| `api-docs.ts` | api-docs | borderline generic |

`test-events.ts` / `test-notif-buffer.ts` are test infrastructure and stay.
