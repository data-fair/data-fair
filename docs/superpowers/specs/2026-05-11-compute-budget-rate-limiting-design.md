# Design — time-weighted (compute-budget) rate limiting

> Status: design approved 2026-05-11, ready for implementation planning.
> Context: [`docs/architecture/load-management.md`](../../architecture/load-management.md) §4–§9 and
> [`load-management-plan.md`](../../architecture/load-management-plan.md) section C (recommendation R5).
> This implements **only** the time-weighted limiter; the in-app concurrency cap (R7) and the
> estimated-cost token model (the rest of R5) remain follow-ups.

## Problem

The existing in-app rate limiter (`api/src/misc/utils/rate-limiting.ts`) charges **exactly one token per
request** regardless of cost: a 4-level `/values_agg` over a huge dataset costs the same as fetching one
line. A token-per-request bucket bounds the *arrival rate*, not the *amount of work* a client causes —
and the slower the requests, the more of them pile up concurrently for a given rate (Little's law). So a
client issuing a stream of expensive Elasticsearch queries can keep the data nodes saturated while
staying well under the request-rate limit.

## Goal

Add a second, complementary limiter keyed the same way as the existing one but denominated in
**milliseconds of Elasticsearch wall-clock time consumed per rolling window**. It bills the actual
cost, so a heavy consumer trips it ~50–100× sooner than a cheap one; and because it measures real ES
time, it self-adapts — when the cluster slows down, every query bills more, budgets drain faster, fewer
queries are admitted, the cluster recovers. It does **not** replace the request-count limiter or the
bandwidth throttle; it runs alongside them.

Scope: applied via the same middleware mount as the existing dynamic-API rate limiting — i.e. every
request under `/api/v1/datasets` and `/api/v1/compat-ods`. Requests that issue no ES query (metadata,
schema, static file downloads) naturally bill ~0 and are never affected.

## Mechanism

> Implemented 2026-05-11. The `ComputeBucket` class lives in its own module
> `api/src/misc/utils/compute-budget.ts` (rather than inside `rate-limiting.ts`) so it has no `#config`
> import and can be unit-tested in the `unit` Playwright project. Everything else below shipped as written.

### The bucket

- A small custom `ComputeBucket` class (~25 lines, in `api/src/misc/utils/compute-budget.ts`) — the
  `limiter` library's `RateLimiter`/`TokenBucket` can neither be force-debited nor go negative, which this needs.
- One bucket per `(userId | clientIp) × limitType`, `limitType ∈ {user, anonymous}` (the dataset /
  ODS-compat routers only ever use those two types). In-memory, per pod — same caveats as the existing
  limiter, same reliance on the reverse proxy hashing by client IP, same `x-ignore-rate-limiting`
  bypass header.
- State: `content` (available ms, starts at `budgetMs`), `lastDrip`, `lastUsed`. On every access it
  first "drips": `content = min(budgetMs, content + (now - lastDrip) * budgetMs / windowMs)`.
- `hasBudget()` → `content > 0`.
- `debit(ms)` → `content = max(-budgetMs, content - max(0, ms))`. **The bucket may go negative, floored at
  `-budgetMs`** — this is what makes a single over-budget query impose a real cool-down (without a
  negative floor, going only to zero refills almost immediately and leaves no lasting effect on a
  sequential heavy stream). Cool-down after one over-budget query: up to one window (from the floor back
  to `> 0`).
- Idle buckets swept in the existing 20-min cleanup loop; `clear()` (used by the test reset endpoint
  `DELETE /test/.../rate-limiting`) clears them too.

### Wiring into the request lifecycle

Extend `rateLimiting.middleware()` in `api/src/misc/utils/rate-limiting.ts`:

1. **On entry**, right after the existing request-count `consume()` check: if not bypassed and
   `getComputeBucket(req, limitType)` has no budget (`content ≤ 0`), respond `429` `text/plain` with a
   **new** message `errors.exceedComputeBudget` (FR + EN). A `debugLimits('exceedComputeBudget', …)`
   line and a Prometheus counter `df_compute_budget_exceeded_total{limitType}` for visibility.
2. **Register `res.on('close', …)`** (fires exactly once — after a normal finish *or* on a client
   disconnect): if not bypassed, `debitCompute(req, limitType, req.esAbortContext?.esElapsedMs ?? 0)`.
   A request the client aborted is still billed for the ES work it kicked off (the helper's `finally`
   records the partial elapsed before the abort throw).

### Measuring "ES call wall-clock"

The accumulator lives on the **`abortContext`** object (`api/src/datasets/es/abort.js`,
`createEsRequestOptions(req, res)`): it is created once per request, already stored on
`req.esAbortContext`, and already threaded through every ES helper on the read paths (commit
`f65dd646d`). Add `esElapsedMs: 0` to it. Each ES helper wraps **only its `client.xxx()` call**:

```js
const t = Date.now()
try { res = await client.transport.request(params, { ...abortContext, meta: true }) }
finally { if (abortContext) abortContext.esElapsedMs += Date.now() - t }
```

Helpers to touch: `search.ts`, `values-agg.js`, `metric-agg.js`, `geo-agg.js`, `words-agg.js`,
`values.js`, `bbox-agg.js`, `small-aggs.js`, `count.js`, `iter-hits.ts`, `multi-search.js`. Worker
callers pass no `abortContext` → no-op (unchanged).

Rejected alternative: a global `AsyncLocalStorage` + ES-client diagnostic events — more elegant in
principle, but the `@elastic/transport` client doesn't hand back a duration without also stamping the
request event, so it's more moving parts; the inline wrap also keeps `abortContext` as the single
coherent "per-request ES interaction" object.

### Known gap (documented, not fixed here)

The streaming export paths not yet wired for abort — `/full`, ODS `/exports`, `master-data/bulk-searchs`
— create no `abortContext`, so they currently bill **0** ES-time. Same set, same follow-up as the abort
wiring (see `load-management.md` §8 item 1 and the R1 status note).

## Configuration

In `api/config/default.cjs` → `defaultLimits.apiRate`, add one field per limit type, reusing the
existing `duration` (60 s) as the window:

```js
anonymous: { duration: 60, nb: 600,  computeMs: 20000, bandwidth: {…} },  // 20 s of ES-time / 60 s
user:      { duration: 60, nb: 1200, computeMs: 60000, bandwidth: {…} },  // 60 s of ES-time / 60 s
```

`0` / absent = disabled (so `remoteService` / `postApplicationKey` / `appCaptures`, which the dataset
middleware never uses, get nothing). Env overrides `DEFAULT_LIMITS_API_RATE_ANONYMOUS_COMPUTE_MS` /
`DEFAULT_LIMITS_API_RATE_USER_COMPUTE_MS` in `api/config/custom-environment-variables.cjs`; field added
to `api/config/type/schema.json`.

Default rationale: `user` budget ≥ the ES `searchTimeout` (45 s) so one legitimate slow query never
locks an authenticated client out; `anonymous` tighter — an anon client firing a 45 s query overshoots
its 20 s budget and cools down ~60 s, acceptable for untrusted traffic. Two parallel heavy streams from
one client exhaust either budget within a window and then get `429`d — the intended "sustained heavy
consumer" behavior.

## API documentation

Extend the existing `apiRate(key, label)` blurb in `api/contract/dataset-api-docs.ts` (rendered into the
"Pour protéger l'infrastructure de publication de données…" bullet list at the top of every dataset's
`api-docs.json`): when `computeMs` is set, append one sentence per role, e.g. *"De plus, le temps de
traitement cumulé de ses requêtes ne peut pas dépasser N secondes par intervalle de D secondes ; au-delà
les requêtes sont rejetées (429) jusqu'à régularisation."* — same FR-only style as the surrounding text,
no new doc section.

## Observability

- `debugLimits('exceedComputeBudget', limitType, user, clientIp)` — consistent with the existing
  `exceedRateLimiting` debug line.
- Prometheus `client.Counter` `df_compute_budget_exceeded_total` with a `limitType` label — so we can
  see in production whether/how often it bites and tune the defaults.

## Testing

A targeted spec under `tests/features/datasets/` (run in isolation while iterating; the full suite runs
on push via husky). Set `computeMs` very low in the test config (a few ms) so any ES-hitting request
exhausts it:

- one `/lines` (or `/values_agg`) request → the next request to the same dataset returns `429` with the
  `errors.exceedComputeBudget` message;
- a non-ES request (`GET /datasets/:id` description) is **not** blocked (billed 0);
- the `x-ignore-rate-limiting: <secret>` header bypasses it;
- after `DELETE /test/.../rate-limiting` the budget is reset and requests go through again;
- (optional) the bucket recovers over the window.

## Files touched

- `api/src/misc/utils/rate-limiting.ts` — `ComputeBucket` class; `getComputeBucket` / `hasComputeBudget`
  / `debitCompute` exports; wire into `middleware()`; extend `clear()` and the 20-min sweep.
- `api/src/datasets/es/abort.js` — add `esElapsedMs: 0` to the context; update the doc comment.
- `api/src/datasets/es/search.ts`, `values-agg.js`, `metric-agg.js`, `geo-agg.js`, `words-agg.js`,
  `values.js`, `bbox-agg.js`, `small-aggs.js`, `count.js`, `iter-hits.ts`, `multi-search.js` — inline
  timing wrap around the `client` call.
- `api/config/default.cjs`, `api/config/custom-environment-variables.cjs`, `api/config/type/schema.json`
  — `computeMs` field + env vars.
- `api/contract/dataset-api-docs.ts` — extend the `apiRate` blurb.
- `api/i18n/*` (wherever `errors.exceedRateLimiting` is defined) — `errors.exceedComputeBudget` FR + EN.
- `api/src/misc/utils/observe.ts` (or inline in `rate-limiting.ts`) — the rejection counter.
- `tests/features/datasets/…` — new spec.
- `docs/architecture/load-management.md` (new subsection + flip R5's status note) and
  `load-management-plan.md` section C (record that the time-weighted limiter shipped).

## Out of scope (follow-ups)

- In-app concurrency cap on heavy ES reads, per origin / per dataset / global (R7).
- Estimated-cost token weighting on obviously-heavy endpoints/formats (the rest of R5).
- Billing ES time for the streaming export paths — comes with wiring those for abort.
- Any cross-pod / distributed-flood mitigation — needs infra (R8) or a shared counter.
