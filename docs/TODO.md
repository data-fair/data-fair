# Follow-ups & known bugs

Forward-looking work distilled from the express-decoupling refactor series (Phases 0–7, complete —
the per-phase plans lived in `docs/plans/` and are now in git history; the conventions they produced
live in [code-conventions.md](architecture/code-conventions.md)).

These are **suspected bugs preserved bit-for-bit during the refactor** (each needs a failing test
first, then a fix) plus a few cleanup/typing/perf candidates. Priority is `P1` (do soon) / `P2`
(worthwhile) / `P3` (opportunistic). Cost is `S` (≤½ day) / `M` (~1 day) / `L` (multi-day).

Related docs: dormant correctness bugs from the perf scan in
[`plans/2026-06-12-bugs-found-during-perf-scan.md`](plans/2026-06-12-bugs-found-during-perf-scan.md)
(folded into the grouping below as `B1`–`B5`); the separate `_geoshape` simplification effort in
`plans/2026-06-15-geoshape-simplification-*.md`.

> Convention (from code-conventions.md §5): each of these gets a **dedicated PR with a failing test
> first** — they were never fixed inline during the refactor.

---

## Suggested PR candidates (grouped)

### PR 3 — Settings document-targeting & metadata bugs `P1 · S–M`
- `1` **`updateDatasetsMetadata` `$unset` broken + condition inverted** — the `$unset` key interpolates
  the object `oldMeta` (→ `customMetadata.[object Object]`) instead of `oldMeta.key`, and the guard
  `if (newDatasetsMetadata.custom?.some(nc => nc.key === oldMeta.key))` looks inverted (cleans up when
  the key still exists). Custom-metadata cleanup never works correctly. (`settings/service.ts`)
- `2b` **POST publication-sites replaces the wrong settings doc** — `mongo.settings.replaceOne(owner, …)`
  filters on `owner` with no `department: { $exists: false }` clause (PUT/PATCH/DELETE use `ownerFilter`);
  for an org with department settings docs the POST can replace the wrong document. Failing test:
  org-root site sync while department settings exist. `P2`.

### PR 4 — Standalone correctness fixes `P1/P2 · S each`
Independent, different modules — can ship together or individually.
- `2c` **activity GET 500s on every call** `P1` — `activity/router.ts` calls `findUtils.query(req, {status:'status'})`
  with an obsolete 2-arg signature → `Object.keys(undefined)` throws. Untested documented stub; fix + add an
  api spec. (a code comment in `activity/router.ts` points here)
- `B2` **missing `await` on `checkMatchingAttachment`** `P2` — `rest.ts:~853` `if (!checkMatchingAttachment(...))`
  never awaits an async fn → always truthy → the `removeDir` branch is dead → stale attachment dirs kept
  forever (disk leak).
- `2d` **catalog DCAT `modified` always undefined** `P3` — `buildDcatCatalog` reads `datasets.dataUpdatedAt`
  off the **array** instead of the `dataset` loop var. Fix = `dataset.…`; `/catalog/dcat` spec doesn't assert it.

### PR 5 — ES query / caching correctness `P1/P2 · S`
- `B1` **`memoizedGetDataset` cache key collapses publicationSite objects** `P1` — `service.ts` `memoize(..., {primitive:true})`
  string-coerces the object args to `"[object Object]"`, so two different publication sites sharing a
  slug-based ref within the 30 s TTL collide → a dataset could be served (or 404'd) for the wrong site.
  Multi-domain exposure. Fix: a stable primitive site key or a custom normalizer.
- `9` **words-agg `significant_text` typo** `P2` — guard tests `aggType === 'signifant_text'` (missing `i`)
  → `filter_duplicate_text` never set → the words aggregation never de-duplicates near-identical text.
  (`datasets/es/words-agg.ts:44`)
- `2` **memoize cache path has no test coverage** `P3` — `datasets/middlewares` memoize is bypassed under
  test (`NODE_ENV !== 'development'`). Coverage gap, not a bug.

### PR 6 — Upstream `@data-fair/lib-*` fixes `P2 · M`
Cross-repo (lib-node / lib-express) + version bumps; group as one upstream pass.
- `B3` **events-queue retry drops the notification** `P2` — `lib-node/events-queue.js:63` `unshift()` called
  with **no argument** → failed notification silently dropped instead of requeued. Data loss on transient
  events-service unavailability. Fix: `unshift(notification)` (+ bound retries).
- `B4` **ws-server ping sweep aborts at first dead socket** `P3` — `lib-express/ws-server.js:83`
  `return ws.terminate()` exits the whole 30 s sweep at the first dead socket. Fix: `terminate(); continue`.
- `B5` **session `validate(sessionState)` result discarded** `P3` — `lib-express/session.js` ignores the
  boolean + `validate.errors`. Decide intent: enforce (throw/log) or remove/gate to dev (per-request CPU).

### PR 7 — Typing & simplification polish `P3 · S–L`
Opportunistic; touch when already in the area.
- `7a(i)` eventsLog `account` expects lib-express `Account` (with `name`) but call sites pass `AccountKeys`
  (~12 occurrences in settings alone) — fix once (lib-express adapter or local type). `S–M`.
- `7b` `settings/operations.ts` polish: `fillSettings(settings: any)`, the `@ts-ignore` on `delete settings._id`
  (type `& { _id?: unknown }`), `fillSettings`'s plain `Error(...)` → `httpError` decision (guarded by a
  pinning test), optional `cleanDatasetsMetadata` slugify test. `S`.
- `3` `remote-services/operations.ts:22` `computeActions` "hard to understand, simplify?" (module is
  deprecation-bound — low value). `S`.
- `5` `applications/proxy.ts` config assembly — templating/CSP likely reusable via `lib-express` serve-spa
  helpers. `M`.
- `4` `datasets/es/commons.ts` query-building deserves a redesign pass (beyond the mechanical 6a split). `L`.
- `7` remaining `.then()` chains → async/await sweep. `S`, repo-wide.
- `6` sequential independent awaits in middleware chains — measured negligible; skip unless a latency
  budget demands it. (no action)

### PR 8 — Test-suite speed `P2 · L` (the planned next big step)
Current: Playwright `workers: 1`, `fullyParallel: false`, full suite on every push. Levers in likely
value order: (1) parallelize API specs with per-spec resource prefixes — mind the nanoid leading-`-`
`$text` pitfall; (2) rebalance e2e→api→unit now that `operations.ts` surfaces exist (this refactor is the
enabler); (3) compact redundant API specs.

---

## Resolved during the series (for the record)
- **PR 2 — Datasets draft / notification correctness** (`12`/`13`/`10`/`11`) → all four triaged:
  - `12` **draft-validated notification `localizedParams` mis-shaped** → FIXED. Reshaped to
    `{ fr: { cause }, en: { cause } }` and dropped the cast (`datasets/routes/write.ts`). Before the fix
    the body rendered `… a été validé ()` — the `cause` param was never interpolated. Failing test added
    in `datasets-drafts-lifecycle.api.spec.ts` ("create a draft when updating the data file") asserting
    the notification body carries "validation manuelle" / "manual validation".
  - `13` **user-notification passed `true` as the sessionState** → FIXED. `send(notif, true as any)` →
    `send(notif, sessionState)` (`datasets/routes/misc.ts`). The legacy `true` was an obsolete
    `subscribedOnly` flag (param removed when notifications moved to the events-queue); the fix restores
    api-key originator attribution. Not observable in the dev test harness — `send` short-circuits to
    `testEvents` under `NODE_ENV=development` before the originator logic. Existing "send user
    notification" spec still green.
  - `10` **PATCH never passes a draft validation mode** → NO FIX NEEDED (confirmed dormant). The PATCH
    route has no file-upload path, and `draftValidationMode` is only consumed by `preparePatch` inside
    `if (datasetFile || attachmentsFile)`. A metadata PATCH can never create a file-draft, so the omitted
    6th arg has no observable effect. Left as-is rather than adding code for an unreachable branch.
  - `11` **cancelDraft stray arg to `journals.log`** → NO ACTION (current code correct). `journals.log`
    has no session-context parameter at all (draft-validated is logged session-less too), so the dropped
    5th arg was always a no-op. Adding session context to journals would be a cross-cutting change beyond
    this P3 item's scope.
- **PR 1 — Applications dormant bugs** (`2e`/`2f`/`2g`/`2h`) → fixed, each with a test:
  - `2e` `replaceApplication`'s readonly-preservation no-op (`!patchKeys.includes([key])` → `!patchKeys.includes(key)`).
    Reaching it required also fixing the PUT route: `attemptInsert` validated the *curated* application
    (which carries the internal `_uniqueRefs` field + a generated, possibly mixed-case id) against the
    `additionalProperties:false` application schema, so **every** PUT 400'd before `replaceApplication`
    ran (pre-existing, untested). Now it validates `req.body` via the post-req schema, like POST/datasets.
  - `2f` `deleteApplication` capture cleanup — restored a `captureFilePath` export on `misc/utils/capture.ts`
    (modern captures are stored only as `.png`) and call it instead of the non-existent `capture.path`.
  - `2g` `writeApplicationConfig` now `syncDatasets({ configuration: appConfig }, application)` — validated
    config + previous app as `oldApp` so old dataset back-refs are reconciled (dropped the unused `rawBody`).
  - `2h` POST 201 response now uses the canonical `clean(app, publicBaseUrl, publicationSite)` order.
- clamav `middleware` DOM-`Response` cast → fixed in Phase 6d.
- `/app-sw.js` reading raw `req.application` → migrated to `reqApplicationOptional` (still benign-undefined).
- `esAbortContext` legacyProp, and the whole `legacyProp` dual-write mechanism → removed at series end.
- Express-5 `req.params.x` narrowing idiom (`7a(ii)`) → documented in code-conventions.md §2.
