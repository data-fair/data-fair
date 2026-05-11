# Design — query-shape advice in overload errors

> Status: design approved 2026-05-11, ready for implementation planning.
> Context: [`docs/architecture/load-management.md`](../../architecture/load-management.md) §4 (compute
> budget), §6 (ES query controls / error handling), §9 (possible improvements). Follows the
> compute-budget limiter ([`2026-05-11-compute-budget-rate-limiting-design.md`](./2026-05-11-compute-budget-rate-limiting-design.md)).

## Problem

When data-fair throttles or fails an expensive dataset read it returns a bare error — `429
errors.exceedComputeBudget` (the client burned its ES-time budget), `504` ("Cette requête est trop
longue…" — the ES `timeout`/per-request `requestTimeout` elapsed), or `429` from an ES
`circuit_breaking_exception` (the query was too memory-heavy). The caller is told *that* it failed but
not *what to change*. Many of these requests are expensive for an avoidable reason visible in the
request itself: an exact `track_total_hits` count (`count` not set to `false`/`estimate`), a deep
`from` offset, a large `agg_size` / multi-level grouping, a huge `size`, no `select` on a wide
dataset. Changing any of those *defaults* globally would be too big a behaviour change; **advising**
the caller, in the error response, is cheap and safe.

## Goal

Append a short, localized, advisory sentence to those three error responses, derived from the failing
request's own parameters — e.g. *"Pour optimiser vos requêtes : passez count=false (ou count=estimate)
pour éviter le comptage exact du nombre total de lignes."* Purely additive text on the existing error
message; **no change** to query behaviour, status codes, or content types. Out of scope: the plain
`errors.exceedRateLimiting` 429 (too-many-requests — no per-query advice applies); any new error
schema/field; any config flag (advice is always on).

## Mechanism

### The advice helper — `api/src/misc/utils/query-advice.ts`

A pure function `queryAdvice(req): string`. Returns `''` when there's nothing useful to say, otherwise
` <intro> : <item> ; <item>.` assembled from i18n keys via `req.__()`. It reads `req.query`,
`req.path`, and `req.dataset?.schema` when present (it isn't always — see wiring). No heavy imports —
it lives in `misc/utils` so both the rate-limiter (same dir) and the dataset/ODS routers can import
it. The data-fair query-param vocabulary it keys off (`count`, `after`, `from`, `size`, `agg_size`,
`field`, `select`) is stable app-wide.

Rules (deliberately small; path-agnostic except the `count` rule):

| # | condition | advice key |
| --- | --- | --- |
| 1 | `req.path` ends with `/lines` or `/records`, **and** `req.query.count` is neither `'false'` nor `'estimate'`, **and** no `req.query.after` | `count` |
| 2 | `parseInt(req.query.from) >= 1000` | `deepPagination` |
| 3 | `parseInt(req.query.agg_size) >= 100`, **or** the `/values_agg` `field` grouping has more than one level (`field` split on `,`/`;` → length > 1) | `aggSize` |
| 4 | `parseInt(req.query.size) >= 1000` | `size` |
| 5 | `req.dataset` is loaded, `req.dataset.schema.length > 20`, **and** no `req.query.select` | `select` |

All numeric reads are defensive (`NaN` → rule doesn't fire). Multiple rules can fire; items are joined
with `' ; '` and the whole thing prefixed by `' ' + req.__('errors.queryAdviceIntro') + ' : '` and
suffixed `'.'`. (Exact punctuation/joiner finalized during implementation; FR uses the spaced-colon
French convention, EN the plain one.)

New i18n keys, in the same file(s) as `errors.exceedRateLimiting` (`api/i18n/messages/{en,fr}.json`):

```
errors.queryAdviceIntro          "Advice to optimize your queries"          / "Conseil pour optimiser vos requêtes"
errors.queryAdvice.count         "set count=false (or count=estimate) to skip the exact total-row count"
errors.queryAdvice.deepPagination "use keyset pagination via the after parameter instead of large from offsets"
errors.queryAdvice.aggSize       "reduce agg_size and/or the number of grouped fields"
errors.queryAdvice.size          "request fewer results per page (lower size)"
errors.queryAdvice.select        "use the select parameter to return only the columns you need"
```

### Wiring

1. **Compute-budget `429`** — `rateLimiting.middleware()` in `api/src/misc/utils/rate-limiting.ts`.
   Currently: `return res.status(429).type('text/plain').send(req.__('errors.exceedComputeBudget'))`.
   Change to send `req.__('errors.exceedComputeBudget') + (req.method === 'GET' ? queryAdvice(req) : '')`.
   The `GET` guard: the compute bucket can block a *write* request from a client that previously did
   heavy reads — query-shape advice would be off-context there. `req.dataset` is **not** loaded at this
   mount point (the limiter middleware sits above the `:datasetId` param middleware), so rule 5 never
   fires here; rules 1–4 work off `req.query`/`req.path` alone.

2. **`504` / circuit-breaker `429`** — `manageESError(req, err)` in `api/src/datasets/router.js`.
   Currently ends `throw httpError(status, message)`. Change: when `status === 504 || status === 429`,
   `throw httpError(status, message + queryAdvice(req))`; otherwise unchanged. Here `req.dataset` and
   `req.query` are available, so rule 5 can use schema width.

3. **ODS-compat read paths** — the three `esUtils.extractError(err)` catch sites in
   `api/src/api-compat/ods/index.ts` (`records`, the others). When the resolved `status` is `504` or
   `429`, append `queryAdvice(req)` to `message` before it's sent. `req.path` there is the ODS route
   (`…/records`) so rule 1 still recognises it.

`queryAdvice` returning `''` makes every append site a no-op when no rule fires, so the only risk is a
slightly-irrelevant hint, never a broken response.

## Testing

- `tests/features/infra/query-advice.unit.spec.ts` (the `unit` Playwright project — no server): feed
  the helper hand-built `req`-likes and assert the produced string — `count` fires on `/lines` with an
  exact count and not when `count=false`/`estimate`/`after`; `deepPagination` at `from=1000` and not
  `from=999`; `aggSize` at `agg_size=100` and on a two-level `field`; `size` at `size=1000`; `select`
  only when `dataset.schema.length > 20` and no `select`; empty string when nothing applies; multiple
  rules combine in order.
- Extend `tests/features/infra/compute-budget.api.spec.ts`: after exhausting the budget, a `/lines`
  request with an exact count gets a `429` whose body **contains** the `count` advice text; the same
  request with `count=false` gets a `429` whose body does **not** contain it. (Run this spec in
  isolation while iterating; the full suite runs on push via husky.)

## Files touched

- `api/src/misc/utils/query-advice.ts` — new helper + rules.
- `api/src/misc/utils/rate-limiting.ts` — append advice to the `exceedComputeBudget` 429 body (GET only).
- `api/src/datasets/router.js` — `manageESError`: append advice to `504`/`429` messages.
- `api/src/api-compat/ods/index.ts` — append advice to `504`/`429` messages at the three `extractError` sites.
- `api/i18n/messages/en.json`, `api/i18n/messages/fr.json` — `errors.queryAdviceIntro` + `errors.queryAdvice.*`.
- `tests/features/infra/query-advice.unit.spec.ts` — new spec.
- `tests/features/infra/compute-budget.api.spec.ts` — extra assertions.
- `docs/architecture/load-management.md` — note in §4 and §6 that overload errors now carry query-shape advice.

## Out of scope (follow-ups)

- Advice on the plain `errors.exceedRateLimiting` 429 (e.g. "cache responses / batch your calls").
- Schema-aware advice in the compute-budget 429 (would need the dataset loaded before the limiter
  middleware, or a deferred-append trick).
- Machine-readable advice (a structured `advice: [...]` field) for programmatic consumers.
- Surfacing the same hints proactively in `api-docs.json` per endpoint.
