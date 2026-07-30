# Correctness bugs found during the 2026-06 performance scan

Side-findings from the static performance scan (see `benchmark/perf-scan-notes.md`). None of these
are performance issues — they are dormant correctness bugs to fix in their own right. Three are in
`@data-fair/lib-*` packages (upstream fixes + version bumps).

## B1. `memoizedGetDataset` cache key collapses publicationSite objects

- **Where:** `api/src/datasets/service.js:220-227` — `memoize(getDataset, { primitive: true, length: 6 })`
- **What:** args 2 and 3 (`publicationSite`, `mainPublicationSite`, built in `app.js:120-133`) are
  objects; memoizee `primitive: true` string-coerces them to `"[object Object]"`. Two different
  publication sites (different owners/domains) requesting the same slug-based dataset ref within
  the 30 s TTL share one cache entry, although `getByUniqueRef` filters by the site's owner — a
  dataset slug resolvable on site A could be served (or 404'd) for site B from the stale entry.
- **Exposure:** multi-domain deployments using slug-based dataset refs.
- **Fix shape:** include a stable primitive site key (e.g. `publicationSite?.owner + publicationSite?.url`)
  in the memoized function's signature, or a custom `normalizer`.
- **Test idea:** two publicationSite objects with different owners, same slug-only datasetId,
  called within the TTL — assert the second call does not return the first's result.

## B2. Missing `await` on `checkMatchingAttachment` — stale attachment dirs never cleaned

- **Where:** `api/src/datasets/utils/rest.ts:853` — `if (!checkMatchingAttachment(...))`
- **What:** `checkMatchingAttachment` is async; the un-awaited promise is always truthy, so the
  `removeDir` branch is unreachable and stale attachment directories are kept forever.
- **Fix shape:** add the `await`; check surrounding error handling still holds.
- **Test idea:** unit test that a non-matching attachment dir gets removed after a line write.

## B3. lib-node events-queue retry drops the notification it means to requeue

- **Where:** `node_modules/@data-fair/lib-node/events-queue.js:63` (upstream: lib-node repo)
- **What:** on a failed POST to the events service, `this.notificationsQueue.unshift()` is called
  **with no argument** — a no-op — so the failed notification is silently dropped instead of
  retried. Data loss on any transient events-service unavailability.
- **Fix shape (upstream):** `unshift(notification)`; consider bounding retries to avoid an
  infinite-retry queue.

## B4. lib-express ws-server ping sweep aborts at the first dead socket

- **Where:** `node_modules/@data-fair/lib-express/ws-server.js:83` (upstream: lib-express repo)
- **What:** `return ws.terminate()` inside the 30 s ping `for` loop exits the whole sweep at the
  first dead socket — remaining clients are neither pinged nor marked that round, delaying dead
  connection cleanup (stale subscribers keep receiving fan-out sends).
- **Fix shape (upstream):** `ws.terminate(); continue` (or restructure with `for…of` + no return).

## B5. lib-express session: `validate(sessionState)` result discarded

- **Where:** `node_modules/@data-fair/lib-express/session.js` (`Session.req`) — `validate(sessionState)`
  called once per request, boolean return and `validate.errors` ignored (upstream: lib-express repo)
- **What:** the validation enforces nothing; it is either a latent bug (was meant to throw/log on
  invalid state) or dead cost. Decide intent: enforce (throw 500/log) or remove/gate to dev.
  Note: also listed in the perf notes (T2) since it is per-request CPU.
