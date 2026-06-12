# API performance scan — source-code notes (2026-06)

Static scan of the API source, no changes made. Scope: the GET `/lines` hot path, REST-dataset
write endpoints, globally shared middlewares, and the `@data-fair/lib-*` dependencies as used on
hot paths. Each finding has an estimated impact, a confidence level, and an experiment idea for the
benchmark phase. Findings marked **[verified]** were double-checked by direct source reading;
the rest come from a single audit pass of the actual files (with file:line refs).

Cross-references: the read path was already heavily optimized (memoized dataset fetch, JIT
flatten + JIT CSV serializer, memoized `getFilterableFields`, in-memory rate limiting, piscina
offload for xlsx/shp, `track_total_hits` controls). The notable result of this scan is that the
remaining big levers are mostly *not* in the ES query itself: they are in per-hit result
preparation, the auth layer, the write/indexing pipeline, and Express defaults.

---

## Tier 1 — likely big wins, low complexity

### T1. `prepareResultContext` is dead code — `/lines` runs the legacy O(hits × schema) path [verified]

- **Where:** `api/src/datasets/es/commons.js:510` (definition, zero callers repo-wide);
  call sites missing the `ctx` arg: `api/src/datasets/router.js:974` (readLines), `router.js:680`,
  `api/src/datasets/es/geo-agg.js:67`, `api/src/datasets/es/values-agg.js:257`.
- **What:** `prepareResultItem` (commons.js:568) takes an optional precomputed context as 6th arg.
  Nobody passes it, so every hit pays ~3 unconditional linear schema scans (`schema.find` for
  `_id`, image concept, description concept), a fresh `query.select.split(',')` per hit, and with
  `truncate` an extra `schema.find` per column per row. For size=10000 × 50-field schema that is
  ~1.5M field comparisons per request in the hottest loop of the hottest endpoint.
- **Impact:** high. **Confidence:** high. **Fix shape:** call `prepareResultContext(dataset, query)`
  once before the loop at each call site and pass it through — the fast path already exists.
- **Experiment:** micro-bench `prepareResultItem` with/without ctx (50-field schema × 10k hits);
  benchmark scenario `simple-list` with `size=10000`, watch the `prepareResultItems` step in
  `df_req_step_seconds`.

### T2. Full RS256 JWT verification per request, uncached (lib-node) [verified]

- **Where:** `node_modules/@data-fair/lib-node/session.js:17-22` (`verifyToken`), mounted on every
  request via `api/src/app.js:98`.
- **What:** Every request carrying `id_token`+`id_token_sign` cookies pays: `jwt.decode` (to read
  `kid`) + JWKS key lookup (this part is cached by jwks-rsa) + `jwt.verify` against a **PEM string**
  — so jsonwebtoken re-runs `crypto.createPublicKey` (ASN.1 parse) *and* RSA signature verification
  (~50-200 µs CPU) on every call, plus a second internal decode. No token→payload memoization: the
  same browser token is re-verified on every API call, tile, asset and SPA request (session
  middleware is mounted before statics/SPA/app-proxy too).
- **Related:** `validate(sessionState)` (`lib-express/session.js` → 40 KB precompiled ajv standalone)
  also runs once per request and its boolean result is **discarded** — pure cost, arguably a latent
  bug. And `console.warn(err)` fires on every request with an expired token (log amplifier).
- **Impact:** high for authenticated/portal traffic (pure event-loop CPU ahead of every router).
  **Confidence:** high. **Fix shape (upstream lib-node, we maintain it):** (a) cache the
  `createPublicKey` KeyObject per kid; (b) LRU `token → verified payload` with TTL = min(exp, ~60s);
  (c) gate or use the `validate` call; (d) rate-limit the expired-token warn.
- **Experiment:** autocannon a cheap endpoint with vs without a session cookie; `--cpu-prof` should
  show `createVerify`/`createPublicKey` frames vanish with the cache prototype.

### T3. AJV validator compiled per write request + unbounded ajv cache growth [verified]

- **Where:** `api/src/datasets/utils/rest.ts:798-805` (`compileSchema`), called per request at
  rest.ts:913 (deleteLine — where the validator is never even used), :934, :954, :987 (bulk).
  Shared instance: `shared/ajv.js` (no cache wrapper).
- **What:** every single-line write and every bulk request rebuilds the JSON schema object and runs
  `ajv.compile` (codegen + `new Function`, ~1-10 ms for wide schemas). Worse: ajv retains every
  compiled env in `this._cache`, a strong-ref `Map` keyed by the schema **object reference**
  (`node_modules/ajv/dist/core.js:100,447-453`) — fresh object each call ⇒ compiled validators are
  never collected. CPU cost *and* a real memory leak under sustained REST writes.
- **Impact:** high for single-line write throughput; leak affects long-lived processes.
  **Confidence:** high. **Fix shape:** memoize per `(dataset.id, schema identity e.g. finalizedAt/
  schema hash, adminMode)`; skip compilation entirely for deletes.
- **Experiment:** loop 10k `POST /lines` on a 100-column dataset: throughput + RSS before/after a
  memoized variant; CPU profile `ajv.compile` self-time.

### T4. `MarkIndexedStream` does one Mongo `findOne` per indexed line [verified]

- **Where:** `api/src/datasets/utils/rest.ts:1312` (inside `_write`).
- **What:** after each ES-indexed line, a sequential round trip re-reads the line to compare
  `_updatedAt` before queueing the `$unset: {_needsIndexing}` (the unset itself is properly
  batched). 1M-line reindex ⇒ 1M serialized round trips — likely rivals ES bulk time itself.
- **Impact:** high for indexing throughput (worker reindex and sync `commitLines` both pass through
  it). **Confidence:** high. **Fix shape:** buffer ~1000 chunks, one
  `find({_id: {$in}}, {projection: {_updatedAt: 1}})`, compare in memory.
- **Experiment:** `_bulk_lines` 100k NDJSON async, time the worker `index-lines` phase (journal
  events bracket it); or diff `db.serverStatus().opcounters`.

### T5. Express default weak ETag = MD5 over every buffered response body [verified: no `app.set('etag', ...)` in app.js]

- **Where:** Express default, hit by `res.send(result)` at `api/src/datasets/router.js:1003` and
  every `res.json` in the app.
- **What:** every JSON/CSV `/lines` response is fully buffered then MD5-hashed (~4-5 ms for a 2 MB
  page of event-loop CPU) just to emit a weak ETag, while cache headers are already keyed on
  `finalizedAt`/`Last-Modified`. Caveat: the `x-private-if-none-match` shim (app.js:65) shows ETag
  revalidation **is** used by the reverse-proxy cache — disabling outright is not safe; replacing
  with a cheap precomputed ETag (hash of `finalizedAt + url`) on the resource-cached routes is the
  likely shape. Check `docs/architecture/caching.md` before touching.
- **Impact:** medium-high, O(body) CPU on the hottest path. **Confidence:** high on cost, medium on
  the safe fix.
- **Experiment:** CPU-profile `/lines?size=10000` under load, look for md5/etag frames; compare
  throughput with `etag:false` (measurement only) then with a precomputed ETag.

### T6. Duplicate `_id` in a bulk: early flush + hard 100 ms sleep + O(n²) scan [verified]

- **Where:** `api/src/datasets/utils/rest.ts:774-779`.
- **What:** when an incoming line's `_id` matches one already buffered, the partial batch is applied
  and the stream sleeps 100 ms (comment admits it papers over an ordering issue). Duplicate-heavy
  payloads (a real createOrUpdate-export pattern) degrade to ~10 lines/s. Independently, the
  duplicate check is `this.transactions.find(...)` — linear over up to 1000 buffered transactions
  ⇒ ~O(n²) per batch even for unique ids; a `Set` of buffered ids is O(1).
- **Impact:** high for duplicate-heavy payloads; low-medium (CPU) otherwise. **Confidence:** high.
- **Experiment:** `_bulk_lines` 10k lines alternating 2 ids vs 10k unique ids — throughput ratio;
  CPU profile of the unique case for the `Array.find` share.

---

## Tier 2 — medium wins, low-to-moderate complexity

### T7. application-key middleware: up to 3 sequential uncached Mongo queries per embed/app request

- **Where:** `api/src/misc/utils/application-key.ts:57-104`, mounted on every dataset read route
  (`datasets/router.js:1005` etc.).
- **What:** any request whose Referer matches `/data-fair/embed/dataset/…` or `/data-fair/app/…`
  with a key runs `applicationsKeys.findOne` + possibly `applications.countDocuments` +
  `applications.findOne`, sequential and uncached, in front of every data query an embedded app
  makes — exactly the high-QPS public traffic. The dataset fetch right next to it is memoized 30 s.
- **Impact:** medium-high for portal/embed deployments, nil for direct API clients.
  **Confidence:** high on mechanism. **Fix shape:** memoizee with ~30 s TTL, same pattern as
  `memoizedGetDataset`.
- **Experiment:** autocannon `/lines` with an embed-style Referer+key vs without; watch the
  `middlewares` step in `df_req_step_seconds` and mongod op counters.

### T8. API-key auth: sha512 (fine) + uncached `settings.findOne` per request

- **Where:** `api/src/misc/utils/api-key.ts:30-34`, mounted globally on catalog/applications/stats
  and per-route on datasets.
- **What:** every request presenting `x-apiKey` does an indexed but uncached Mongo round trip
  (~0.5-2 ms). M2M harvesters hitting `/lines` pay it per call.
- **Impact:** medium (latency + mongod load). **Confidence:** high. **Fix shape:** short-TTL
  memoize keyed on hashed key + scopes (mirror `memoizedGetPublicationSiteSettings`).
- **Experiment:** autocannon `/lines` with api key, p50/p99 before/after memoization.

### T9. ES bulk flush threshold 200 KB is far below ES sweet spot

- **Where:** `api/src/datasets/es/index-stream.js:68-71`; `config.elasticsearch.maxBulkChars:
  200000` (`api/config/default.cjs:58`).
- **What:** bulks flush at 2000 lines or 200 KB — with realistic lines the byte cap wins
  (~600 lines/bulk) vs ES guidance of ~5-15 MB. Caveat: the same constant gates sync-vs-async
  bulk handling in `bulkLines` (rest.ts:1070,1113) — raising it changes two behaviors; decouple
  into two config knobs first.
- **Impact:** high for reindex throughput, medium overall. **Confidence:** medium-high.
- **Experiment:** reindex the 100k benchmark dataset at 200 KB / 1 MB / 5 MB (config-overridable
  via `benchmark.cjs`), measure wall time.

### T10. O(n²) scans and `$or`-of-1000 filters in `applyTransactions`

- **Where:** `api/src/datasets/utils/rest.ts:444,462,477,484,568,584`
  (`operations.find(op => op._id === _id)` inside `for await` loops);
  rest.ts:431,473,564 (`$or` of up-to-1000 single-`_id` clauses instead of `_id: {$in: ids}`).
- **What:** previous-doc read-backs (patch/delete/create checks) locate operations by linear scan
  (~1M comparisons per 1000-line patch batch) and query Mongo with a 1000-branch `$or` instead of
  one `$in` IXSCAN. createOrUpdate-only bulks skip these passes.
- **Impact:** medium (patch/update/delete-heavy bulks). **Confidence:** high for the scans,
  medium-high for `$or` (needs `explain()`). **Fix shape:** `Map<_id, op>` per batch; `$in` + shared
  `_owner` condition.
- **Experiment:** `_bulk_lines` 100k `_action:'patch'`; `--cpu-prof` for `applyTransactions`
  self-time; `explain('executionStats')` on both filter shapes against 1M docs.

### T11. Per-line costs in the indexing hot loop (`applyCalculations`, `formatLine`, double stringify)

- **Where:** `api/src/datasets/utils/extensions.ts:640-695` (per line: `flatten(item,{safe:true})`
  clone, `schema.find` for attachment field, `schemaHasGeopoint/Geometry` schema scans, fresh
  `randomSeed.create(...)` ARC4 generator per line);
  `api/src/datasets/utils/data-streams.js:22-41` (`formatLine`: `schema.find` per key per line);
  `api/src/datasets/es/index-stream.js:44,59` (`JSON.stringify(item)` once per line solely to count
  bulk bytes, then the ES client serializes the body again; plus per-bulk array copy + per-line
  spread at :102,:119).
- **What:** all dataset-constant work hoistable to stream construction (Maps/flags), the seeded
  RNG replaceable by a cheap deterministic hash, serialization doable once by sending pre-serialized
  NDJSON to the bulk API.
- **Impact:** medium, additive over every indexed line (request and worker paths).
  **Confidence:** high on code, medium on share vs ES I/O.
- **Experiment:** `--cpu-prof` of the worker during a 100k–1M reindex: look for `flatten`,
  `random-seed` `create`, `Array.prototype.find`, `JSON.stringify` frames.

### T12. Single-line writes: full sync index pipeline + `refresh: wait_for`

- **Where:** `api/src/datasets/utils/rest.ts:875-893` (`commitLines`);
  `config.elasticsearch.singleLineOpRefresh: 'wait_for'` (default.cjs:62).
- **What:** each single-line write runs extension-pipeline setup, a Mongo read-back stream, an ES
  bulk of 1 with `refresh: 'wait_for'` (parks until next refresh), the per-line `findOne` (T4),
  `estimatedDocumentCount`, and a dataset `updateOne`. Deliberate read-after-write trade-off but no
  opt-out for fire-and-forget clients; sequential-writer throughput is capped near
  1/refresh_interval.
- **Impact:** medium (by design; quantify before deciding). **Confidence:** high on mechanism.
- **Experiment:** POST `/lines` sequential + concurrent with `wait_for` vs `false` (override in
  `benchmark.cjs`); p50 + total throughput.

### T13. JSON response is one synchronous `JSON.stringify` of the whole page

- **Where:** `api/src/datasets/router.js:1003` (`res.send(result)`), also :931 (geojson).
- **What:** up to 10k prepared rows stringified in one synchronous pass (10-100 ms blocking for
  large pages), undoing the careful yield-every-500-rows of the prepare loop; the bandwidth
  throttle then re-slices the buffer. CSV already builds incrementally. Fix shape: per-row
  stringify into parts with periodic yields (reuse the JIT approach), or true streaming.
- **Impact:** medium for large pages, negligible at default size=12. **Confidence:** high on
  mechanism.
- **Experiment:** bench `JSON.stringify(result)` 10k×50 vs per-row + `setImmediate`; watch
  event-loop-delay under concurrent load.

### T14. Event-loop yields use `setTimeout(0)` (≥1 ms timer clamp) instead of `setImmediate` [verified at router.js:973]

- **Where:** `api/src/datasets/router.js:973` (every 500 rows);
  `api/src/datasets/utils/outputs.js:39,50` (every 200 rows in results2csv).
- **What:** Node clamps `setTimeout(0)` to ~1 ms and runs it in a later loop phase: a 10k-row JSON
  page adds ~20-30 ms, CSV ~50-75 ms of pure scheduling latency. `setImmediate` yields without the
  clamp. (Inverse note: `applyTransactions` already uses `setImmediate` — rest.ts:409,501,651 —
  three separate every-100-lines yield points that could be unified.)
- **Impact:** medium for size ≥ 1000, zero at default size. **Confidence:** high.
- **Experiment:** time `results2csv` on 10k rows with both primitives; deep-pagination scenario p50.

### T15. ES transport: no `filter_path`, full `_source` list in request, no compression decision

- **Where:** `api/src/es.ts:18-28` (client opts; `config.elasticsearch.options` defaults `{}`);
  `api/src/datasets/es/search.ts:37-47`; `es/commons.js:193-195`.
- **What:** (a) responses carry per-hit `_index`/`_score`-null/`sort` arrays/`_shards` the handler
  mostly ignores — `filter_path` would shrink the JSON the client must parse; (b) default `_source`
  enumerates every schema key in the request body (wide schemas) where an `excludes` form is
  constant-size; (c) `compression: true` untested — CPU-vs-bandwidth, only relevant for remote ES.
- **Impact:** medium for large pages / remote ES; low on localhost size=12. **Confidence:** medium
  (topology-dependent).
- **Experiment:** the existing ES query harness (perf-es-optims branch) is suited: compare
  content-length + latency with/without `filter_path` at size=10000; profile JSON.parse in the ES
  client.

### T16. Schema-derived per-request work in `prepareQuery` and friends

- **Where:** `api/src/datasets/es/commons.js:191-196` (fields array + `_source` filter +
  O(select×schema) validation), :297-302 (`schemaByKey`/`schemaByConcept` Maps rebuilt per request),
  :421-424 + router.js:771,775 (repeated `schema.find('_geoshape'/'_geocorners')`),
  :72 (`parseSort` allocates `fields.concat([...])` per sort key);
  also `api/src/misc/utils/query-advice.ts:86-89` (two Sets rebuilt from the full schema on every
  JSON response) and `api/src/misc/utils/permissions.ts:34,68` (anonymous `can()` probe recomputed
  per request).
- **What:** all of it depends only on the dataset document — one memoized "schema context" keyed on
  `(dataset.id, finalizedAt)` (the `getFilterableFields` pattern, es/operations.ts:250) would
  replace ~6 linear scans + several allocations per request.
- **Impact:** low-medium individually, worthwhile as one batched change. **Confidence:** high on
  per-request execution, medium on measurability vs the ES round trip.
- **Experiment:** micro-bench `prepareQuery` 200-field schema × 100-field select, 100k iters,
  vs precomputed-context variant; heap-sampling profile during `simple-list`.

### T17. `_score: null` serialized into every row

- **Where:** `api/src/datasets/es/commons.js:570`.
- **What:** with default sort ES returns `_score: null` and it's copied onto every row →
  `"_score":null` ≈ 14 bytes × rows in every JSON response, plus a property write per row.
  API-compat check needed before conditioning it.
- **Impact:** low. **Confidence:** high on mechanism.
- **Experiment:** response-size diff at size=10000; grep tests/docs for `_score` guarantees.

---

## Tier 3 — small/situational, batch with other work

- **T18. Cookie header parsed twice** — `cookie-parser` (app.js:96) then `cookie.parse` again in
  `lib-node/session.js:28`. µs-level; lib fix: accept pre-parsed `req.cookies`.
- **T19. Mongo cursor `batchSize(100)`** feeding 2000-line ES bulks — `rest.ts:1249`; ~20 getMores
  per bulk. Raise to ~1000 or byte-aware. Low-medium.
- **T20. History mode revisions bulk runs strictly after main bulk** — `rest.ts:643-661`; write
  amplification is inherent but the two round trips are serialized; restructuring is possible but
  the dependency on writeErrors limits it. Low-medium, only with `rest.history`.
- **T21. No ES index tuning during full offline reindex** — `manage-indices.js:213`; standard
  `refresh_interval: -1` + `replicas: 0` during load into the not-yet-aliased index, restore before
  switch. Medium for full reindexes; needs care but is well-trodden ES practice.
- **T22. events-log per-line writes** — `rest.ts:917,941,961,974` await a dynamic
  `import()` per call and `logEvent` JSON.stringify+console.log per write; level check happens
  after building everything (`lib-express/events-log.js:23-28`). Hoist import; short-circuit level
  earlier (lib). Low-medium for high-rate single-line writes.
- **T23. rate-limiting middleware re-derives client IP up to 2×/request** and allocates
  throttle closures per request — `rate-limiting.ts:67,96,223-245`. The in-memory design is right;
  cache `getClientIp` on a req symbol. Low.
- **T24. body parser mounted before any auth** — app.js:87-94: garbage 1 MB POSTs are parsed before
  401. Hardening more than perf. Low.
- **T25. `/ping` does 4-5 live dependency probes per call, uncached** — `admin/service.ts:72-91`.
  Only matters with aggressive orchestrator polling; 2-5 s memoize. Low.
- **T26. `/embed` tracking `datasets.findOne` per page load uncached** — `api/src/embed.js:7`. Low.
- **T27. publicationSite middleware** — cache is good (60 s memoizee); residual per-request object
  spread + URL string work, runs for statics too. Low.
- **T28. vector-tile neighbors sampling: 9 Mongo-cached count probes per tile** —
  `router.js:836-857`; parallel and cached but 9 cache round trips per tile is structural; an
  in-process memoizee front would remove the hops. Low-medium, tiles only.
- **T29. ws-server fan-out re-stringifies the doc once per subscriber** —
  `lib-express/ws-server.js:119`; hoist the stringify. Low unless many subscribers.

## Correctness side-findings (not perf — found on the way, worth fixing regardless)

- **C1.** `memoizedGetDataset` uses `memoizee {primitive: true}` with object args
  (`publicationSite`, `mainPublicationSite` → `"[object Object]"` in the key): two different sites
  can share a cache entry for slug-based refs within the 30 s TTL (`service.js:220-227`).
- **C2.** `rest.ts:853`: `checkMatchingAttachment(...)` called without `await` inside `if (!...)` —
  promise always truthy ⇒ the stale-attachment `removeDir` branch never runs.
- **C3.** `lib-node/events-queue.js:63`: `notificationsQueue.unshift()` called with **no argument**
  — intended retry actually drops the failed notification.
- **C4.** `lib-express/ws-server.js:83`: `return ws.terminate()` inside the 30 s ping sweep exits
  the whole loop at the first dead socket — remaining clients are not pinged/cleaned that round.
- **C5.** `lib-express/session.js`: `validate(sessionState)` result ignored (see T2) — decide
  whether it should enforce or be removed.

## On advanced strategies (object pooling / flat memory)

Nothing in this scan points at allocation *churn* as the dominant cost the way the schema scans,
crypto, and Mongo round trips are — V8's young-gen GC handles short-lived per-hit objects well.
The places where flat/zero-copy thinking *would* pay, if Tier-1/2 fixes leave them dominant in
profiles:

1. **ES response handling** (T15 + T1): per-hit objects parsed from JSON then re-shaped then
   re-stringified. The end-game is `filter_path` + per-row passthrough serialization (operate on
   the raw `_source` and emit JSON parts without intermediate objects) — effectively the CSV-JIT
   approach applied to JSON output. Worth it only if profiles show prepare+stringify still
   dominating after T1/T13.
2. **Index pipeline** (T11): serialize each line exactly once into a reusable Buffer chain and ship
   pre-serialized NDJSON to the bulk API — removes double stringify and the per-line spread.
3. Object pooling proper (reusing result-item objects) is *not* recommended: the objects escape
   into Express/JSON serialization with unclear lifetimes, and the win over young-gen GC is small
   relative to the risk.

## Suggested benchmark additions (next phase)

The harness (`benchmark/`) is GET-only today. Proposed new scenarios:

1. `auth-overhead` — same `simple-list` query anonymous vs session-cookie vs x-apiKey vs
   embed-referer+key (isolates T2/T7/T8).
2. `large-page` — `size=10000` JSON + CSV (isolates T1/T5/T13/T14/T17).
3. `bulk-ndjson-unique` — 100k unique-id createOrUpdate, async, request time + worker
   index-completion time via journal (T4/T9/T11/T19).
4. `bulk-ndjson-duplicates` — same with 50 % repeated ids (T6).
5. `bulk-patch` — 100k patches on existing lines (T10).
6. `single-line-writes` — concurrent POST `/lines` at 1/10/50 connections, with and without
   `singleLineOpRefresh` (T3/T12/T22).
7. Variants: 300-column schema (T11/T16 sensitivity), history on (T20).
8. Memory guard: run scenario 3 under `--max-old-space-size=256` (write path should pass — it is
   fully streaming) and watch RSS over 10k single-line writes for the T3 ajv leak.

Profiling support to add alongside: a `--cpu-prof`/`--heap-prof` toggle in `dev-benchmark`, and
reading `df_req_step_seconds` from the observer endpoint into the benchmark reporter so step-level
regressions are visible per scenario.
