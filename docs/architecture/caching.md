# Caching & cache headers

Data Fair has five caching layers. Together they implement a **stale-while-revalidate**-ish
strategy: serve something fast, validate cheaply (a `HEAD`-like Mongo projection, a
`Last-Modified` comparison, a `304` from upstream) before doing the expensive thing. Every cache
hit is a query that never reaches Elasticsearch/MongoDB — see [`load-management.md`](./load-management.md)
for the other half of that story.

```
browser / SDK ──HTTP──► reverse proxy ──┤ Layer 1: proxy_cache, keyed on method+host+uri,
   (own cache via            │          │          honours upstream Cache-Control, revalidates
    Cache-Control/ETag/      ▼          └──────────────────────────────────────────────────────
    Last-Modified)      data-fair API
                          │  Layer 2: HTTP cache headers   (api/src/misc/utils/cache-headers.js)
                          │  Layer 3: in-process memoizee caches (per Node.js process)
                          │  Layer 4: MongoDB-backed caches (cache.js capped collection, extensions/thumbnails caches, remote attachments)
                          │  Layer 5: ad-hoc per-process object caches (base-app index.html, …)
                          ▼
                  Elasticsearch / MongoDB / S3 / remote services
```

## Layer 1 — reverse-proxy HTTP cache

The reverse proxy (nginx) in front of the API runs an `proxy_cache` zone keyed on
`$request_method $scheme$host$request_uri` (host-aware: same path, different host → different
entry). It revalidates expired entries against the upstream `Last-Modified`/`ETag`, collapses a
thundering herd with `proxy_cache_lock`, and serves stale on upstream 5xx. The cache volume is
ephemeral (it does not survive a proxy restart). A secret header/cookie
(`x-fg87fa6658fpbuia83hb8`, or `x-cache-bypass` in the test harness) forces a fresh fetch.

Because the proxy runs with response buffering **off** (good for streaming extensions and large
bodies), a response is only buffered — and therefore worth caching — when the upstream sets
`X-Accel-Buffering: yes`, which the API does exactly for public, cacheable responses (see Layer 2).
Whether a stored entry is reused, for how long, and whether it must revalidate is decided entirely
by the upstream `Cache-Control`/`Last-Modified` headers — i.e. by Layer 2.

The proxy also copies the conditional request headers into `X-Private-If-Modified-Since` /
`X-Private-If-None-Match` (and forwards `X-Forwarded-Path`, `X-Client-IP` for in-app IP rate
limiting, `Range` for pmtiles) — see Layer 2 §"private-cache revalidation". Access logs record the
cache status, resource and operation so hit rates per dataset/operation show up in the metrics
pipeline.

## Layer 2 — HTTP cache headers emitted by the API

All header logic is centralised in **`api/src/misc/utils/cache-headers.js`** and applied as route
middlewares. The matching contract is exercised by `tests/features/datasets/query/cache-headers.api.spec.ts`
(which simulates the proxy cache via the `x-cache-bypass` header).

| Middleware | Used on | Behaviour |
|---|---|---|
| `noCache` | mutable / admin / draft endpoints (`GET /datasets/:id`, `/schema`, `/raw`, `/data-files`, admin & settings routers) | `Cache-Control: must-revalidate, private, max-age=0` + `X-Accel-Buffering: no`. Never stored. |
| `resourceBased(dateKey = 'updatedAt')` | dataset data-query endpoints (`/lines`, `/values_agg`, `/geo_agg`, `/metric_agg`, `/values/:field`, `/api-docs.json`, …) — most pass `'finalizedAt'` so the cache key tracks the data, not metadata edits | full conditional-GET + max-age logic, below |
| `listBased` | collection endpoints (`/api/v1/datasets`, `/applications`, `/catalog/datasets`) | public **only** when the caller opts out of per-user data (`select=-userPermissions` **and** `visibility` contains `public`); otherwise `setNoCache`. Public ⇒ `must-revalidate, public, max-age=publicMaxAge` + `X-Accel-Buffering: yes`. |

**`resourceBased` logic:**

1. If `req.noCache` (e.g. a virtual dataset filtered by the caller's account — output is
   caller-specific) ⇒ `setNoCache`, return.
2. Resource date = `req.resource[dateKey]` (usually `finalizedAt`) falling back to `updatedAt` →
   becomes the `Last-Modified` header.
3. **Conditional GET**: `If-Modified-Since` exactly equal to that date ⇒ `304`, no query runs.
   (Skipped when `req.noModifiedCache` — see below.)
4. **Visibility** from `req.publicOperation` (set by `permissions.ts`). Public ⇒ `X-Accel-Buffering:
   yes` so the proxy buffers & caches; private ⇒ `X-Accel-Buffering: no`.
5. **`Cache-Control`**:
   - If the request carries a `finalizedAt`/`updatedAt` **query parameter** ≤ the resource date,
     the URL is "timestamped" — its content can never change ⇒ `must-revalidate, <public|private>,
     max-age=timestampedPublicMaxAge` (1 week). The UI deliberately adds `?finalizedAt=…` to
     map/lines requests (`ui/src/composables/dataset/lines.ts`, `ui/src/components/dataset/map/dataset-map.vue`)
     so repeated views are free, while a new finalization produces a new URL = new cache entry.
   - If the query timestamp is **greater** than the resource date ⇒ `400` + `console.warn` (the
     caller is asking for data that doesn't exist yet — usually a stale memoize cache, see Layer 3).
   - Otherwise: public ⇒ `must-revalidate, public, max-age=publicMaxAge` (5 min); private ⇒
     `setNoCache`.

`setNoCache` always also sets `X-Accel-Buffering: no` to keep the response streaming unbuffered.

**`X-Accel-Buffering` — the cacheability switch.** Since the proxy runs with buffering off, the API
must explicitly opt a response *into* buffering for it to be cached: `resourceBased`/`listBased` set
`X-Accel-Buffering: yes` for public responses, `no` everywhere else. So "public + cacheable" and
"buffered by the proxy" are the same set.

**ETags and private-cache revalidation.** For buffered JSON/string responses Express emits a weak
`ETag`, so `If-None-Match` ⇒ `304` works on top of the `Last-Modified` path. The proxy doesn't
forward `If-Modified-Since`/`If-None-Match` to the upstream when its cache is active (it answers or
revalidates itself), and for `private` responses it doesn't proxy-cache at all — which would break
browser revalidation of private resources. Fix: the proxy copies the conditional headers into
`X-Private-If-Modified-Since`/`X-Private-If-None-Match`, and `api/src/app.js` (early middleware)
copies them back into the standard headers when those are absent. Result: a logged-in user's
browser still gets `304`s on private dataset data. Thumbnails have their own copy of this dance —
`api/src/misc/utils/thumbnails.js` `setResourceHeaders` (≈ line 130).

**`req.noModifiedCache` escape hatch.** The ODS-compat layer sets it when a request uses the `now()`
function (`api/src/api-compat/ods/index.ts` ≈ line 621): the result depends on wall-clock time, so
the `Last-Modified` short-circuit and the timestamped-query path are disabled.

**`config.cache.reverseProxyCache`** (default `false`; set `true` where the proxy cache is real).
When `true`, public timestamped vector-tile requests skip the **MongoDB** tile cache (Layer 4) —
the proxy will cache them anyway, so doing it twice wastes Mongo capacity (`api/src/datasets/router.js`
≈ lines 795/997/1045).

## Layer 3 — in-process `memoizee` caches

Every API/worker Node.js process keeps a set of `memoizee` caches. They are **per process**, bounded
by `max: 10000` entries, and expire by `maxAge`. `memoizee/profile` feeds the `df_memoize_total`
Prometheus counter.

| Function | File | `maxAge` | Notes |
|---|---|---|---|
| `memoizedGetDataset` (wraps `getDataset`) | `api/src/datasets/service.js:219` | **30 s** | The hot one. Key = first 6 args only (ignores `db`, `acceptedStatuses`, `reqBody`). See below. |
| `memoizedGetPublicationSiteSettings` | `api/src/misc/utils/settings.ts:45` | 1 min | publication-site settings lookups |
| `memoizedGetFreshDataset` | `api/src/applications/utils.ts:53` | 1 min | dataset snapshot used when rendering applications |
| `getCompatODS` | `api/src/api-compat/ods/index.ts:55` | 1 min | ODS-compat resource resolution |
| `findApplicationKey` + 3 siblings | `api/src/misc/utils/application-key.ts` | 30 s | the 3-4 lookups of the application-key middleware, in front of every embed/app data request; negative results cached; `matchingApplication` is cloned on use (mutated downstream) |
| `compileSchema` (rest validators) | `api/src/datasets/utils/rest.ts` | 1 min | ajv compile per (dataset, `updatedAt`, adminMode); also bounds ajv's internal schema cache |
| `memoizedPrepare` (markdown → HTML) | `api/src/misc/utils/markdown.js:26` | 1 h | key includes `updatedAt` ⇒ self-invalidating |
| `memoizedCompileFlatten` | `api/src/datasets/utils/flatten.ts:50` | 1 h | key includes `finalizedAt` ⇒ self-invalidating |
| `getFilterableFields` | `api/src/datasets/es/commons.js:196` | 1 h | ES query-building helper |

Test endpoints `DELETE /api/v1/test-env/dataset-cache` and `…/publication-sites-cache` clear the two
dataset-related memoize caches between tests.

**`memoizedGetDataset` + `getDatasetFresh` + the `readDataset` bypass.** `readDataset` middleware
(`api/src/datasets/middlewares.js:74`) chooses:

- `tolerateStale = !acceptedStatuses && !noCache && NODE_ENV !== 'development'` ⇒ use the raw 30 s
  memoize cache. For read-only data endpoints where being ≤ 30 s stale is acceptable.
- otherwise ⇒ `getDatasetFresh`: calls `memoizedGetDataset`, then runs a **cheap projection query**
  (`{updatedAt, finalizedAt, status, errorStatus, errorRetry}`, plus `draft.updatedAt` in draft
  mode) and, if any changed, re-reads the full dataset. "Validate before trusting the cache."

**The `?updatedAt=`/`?finalizedAt=` query-param bypass** (#358, building on #352's unified
`_modified`): even on the `tolerateStale` path, if the caller passed `?finalizedAt=X` with
`X > dataset.finalizedAt` (or `?updatedAt=X` similarly), the middleware does a fresh `getDataset`
instead of trusting the ≤ 30 s-stale copy (`middlewares.js:87-95`). Why: the UI PATCHes a dataset,
gets the new `updatedAt`, then re-reads with `?updatedAt=<new>` — without the bypass it could get
the pre-PATCH schema back for up to 30 s. (The mirror image — a query timestamp *higher* than the
resource — is the `400` thrown by `resourceBased`.) Related: `api/src/datasets/utils/compute-modified.ts`
(`computeModified`, #352) produces the unified `_modified` sort field that makes this coherent
across list and detail views.

## Layer 4 — MongoDB-backed caches

**`cache.js` — capped collection for expensive computed results.** `api/src/misc/utils/cache.js`: a
**capped** `cache` collection (`config.cache.mongoSize` MB, default 2 GB), `get`/`set`/`getSet(params,
getter)` keyed by `object-hash(params)`, reads with `readPreference: 'nearest'`. Comment: *"Do not
use this too much as elasticsearch is a performant backend already, only for specific cases like
vector tiles."* **Not invalidated** — entries fall out FIFO; staleness is avoided by putting
`finalizedAt` in the params (new finalization ⇒ new hash). Consumers (all in `api/src/datasets/router.js`):

- **Vector tiles** — prepared (`vtPrepare`) and on-the-fly tiles in `readLines` (≈ lines 797, 943)
  and the dedicated tile endpoints (≈ 999, 1029, 1049); key includes `{type:'tile', sampling,
  datasetId, finalizedAt, query}`; `set` also stores the `count`/`total` for the `x-tilesampling`
  header. Skipped when `config.cache.disabled`, and when `reverseProxyCache` will cache it anyway.
- **Tile counts** — `countWithCache` (≈ line 721): `cache.getSet({type:'tile-count', …}, () =>
  esUtils.count(...))`.

`cache.init()` is called at startup from `api/src/app.js`.

**`extensions-cache`** — `mongo.ts` collection, TTL index `{lastUsed: 1}` `expireAfterSeconds` **10
days**. `api/src/datasets/utils/extensions.ts` (≈ lines 314 read / 355 write): identical remote-service
extension inputs across all datasets/owners reuse the cached output, refreshing `lastUsed` on hit.

**`thumbnails-cache`** — `mongo.ts` collection, TTL index `{lastUpdated: 1}` `expireAfterSeconds`
**10 days**. `api/src/misc/utils/thumbnails.js` `getCacheEntry(db, url, filePath, sharpOptions)`:
file-based source ⇒ validity keyed on the file's `lastModified`; URL-based source ⇒ 1-hour TTL then
a conditional GET upstream — a `304` keeps the cached image, otherwise re-fetch + re-resize. Plus
the response-side `Last-Modified`/`304`/`Cache-Control` handling in Layer 2.

**Remote attachments** — `api/src/datasets/router.js` ≈ line 1246: re-fetched only if `fetchedAt +
config.remoteAttachmentCacheDuration < now`; otherwise a conditional GET with the stored `etag` and
a `304` reuses it.

## Layer 5 — ad-hoc per-process object caches

- **Base-application `index.html`** — `api/src/applications/proxy.js` `htmlCache` (plain object, no
  expiry, never cleared): each render does a conditional GET to the static app server with the
  stored `ETag`/`Last-Modified`; a `304` reuses the cached HTML, a fetch error falls back to the
  last good copy. Bounded only by the number of distinct app URLs.
- **Remote-services proxy** (`api/src/remote-services/router.js` ≈ lines 247/276) — not a cache, but
  it forwards the conditional/cache headers both ways so the browser ↔ remote-service cache contract
  is preserved through Data Fair.
- **DNS** — `cacheable-lookup` caches DNS resolutions for the HTTP agents / outbound proxy.

## Configuration reference

`config.cache` (`api/config/default.cjs`, env vars in `custom-environment-variables.cjs`):

| Key | Default | Env var | Meaning |
|---|---|---|---|
| `cache.publicMaxAge` | `300` (5 min); `1` in `development.cjs` | `CACHE_PUBLIC_MAX_AGE` | `max-age` for non-timestamped public GETs |
| `cache.timestampedPublicMaxAge` | `604800` (1 week) | `CACHE_TIMESTAMPED_PUBLIC_MAX_AGE` | `max-age` when the request carries a `finalizedAt`/`updatedAt` query param |
| `cache.mongoSize` | `2000` (MB) | `CACHE_MONGO_SIZE` | size of the capped `cache` collection (vector tiles, tile counts) |
| `cache.reverseProxyCache` | `false` | — | set `true` where the reverse-proxy cache is real: skip the Mongo tile cache for requests the proxy will cache |
| `cache.disabled` | (referenced; unset by default) | — | when set, bypasses the Mongo `cache` entirely |

Related top-level keys: `remoteAttachmentCacheDuration`, `extensionUpdateDelay`, `locks.ttl`,
`datasetStateRetries.{interval,nb}`. memoize `maxAge`s are hard-coded (Layer 3). TTL collections
(`api/src/mongo.ts`): `extensions-cache` (`lastUsed`, 10 d), `thumbnails-cache` (`lastUpdated`,
10 d). Capped collection: `cache` (`mongoSize` MB).

## Freshness & invalidation — the rules at a glance

- **Mutable resources** (`GET /datasets/:id`, schema, raw, admin, settings, anything draft, any list
  with per-user `userPermissions`): `private, max-age=0` — never cached anywhere; the memoize cache
  is bypassed (`getDatasetFresh` validates) or not used.
- **Public dataset data** (`/lines`, `*_agg`, `/values`): `public, max-age=5min` by default;
  `public, max-age=1week` when the URL is timestamped with `?finalizedAt=`. Stored by the proxy
  (entry per `method+host+uri`), revalidated against `Last-Modified` (= the dataset's
  `finalizedAt`/`updatedAt`) on expiry; a new finalization ⇒ new `Last-Modified` ⇒ refresh; a new
  timestamped URL ⇒ brand-new entry.
- **Computed artefacts** (vector tiles, tile counts, extension results, thumbnails): keyed on a
  content timestamp (`finalizedAt`) or upstream validator (`lastModified`/`etag`) — effectively
  immutable per key; old entries expire by capped-collection FIFO or TTL index, not by explicit
  invalidation.
- **Memoize caches** are deliberately short (30 s datasets, 1 min settings/ODS, 1 h pure compiled
  artefacts whose key already includes `finalizedAt`/`updatedAt`). The dataset one additionally has
  the `getDatasetFresh` validation path and the `?updatedAt=`/`?finalizedAt=` bypass.
- **Cache busting**: the `x-fg87fa6658fpbuia83hb8` header/cookie (or `x-cache-bypass` in the test
  harness) makes the proxy bypass its cache; `DELETE /api/v1/test-env/dataset-cache` and
  `…/publication-sites-cache` clear the memoize caches; restarting the proxy empties the
  (ephemeral) reverse-proxy cache; restarting an API/worker process empties its memoize caches.

## Known sharp edges

- The reverse-proxy cache volume is ephemeral ⇒ a rollout cold-starts the cache; expect a brief
  ES/Mongo load spike after a proxy restart. `proxy_cache_lock` limits the herd but doesn't
  eliminate it.
- memoize caches are per-process and not coherent across API replicas; balancing by client IP helps
  (a given client tends to hit the same replica), but a PATCH on replica A is invisible to replica
  B's memoize cache for up to 30 s — hence the `?updatedAt=` bypass, which the UI uses but
  third-party API clients generally don't.
- `resourceBased` throws `400` if a client sends `?finalizedAt=`/`?updatedAt=` *ahead* of the
  resource — the canary for "you're talking to a node whose memoize cache is stale"; logged with
  `console.warn`.
- `htmlCache` in `applications/proxy.js` has no expiry and no size bound (bounded only by the number
  of distinct base-app URLs).
- The Mongo `cache` collection is capped: under heavy vector-tile traffic across many datasets,
  entries can be evicted faster than expected; `mongoSize` is the only knob.

## Possible improvements

- Bound `htmlCache` (and any other unbounded ad-hoc caches) by size or TTL.
- A shared (e.g. Redis-backed) layer for cross-replica coherence of the dataset memoize cache, so
  third-party API clients also get read-after-write consistency without the `?updatedAt=` trick.
- Surface per-dataset cache hit-rate metrics from the API (not only from proxy access logs) so the
  effectiveness of the timestamped-URL strategy is observable in-app.
