# Dataset query endpoints: surface silent partial failures

Date: 2026-06-02
Branch: `feat-better-suffix-filters`

## Problem

On the main dataset data endpoints (`/lines`, `/values_agg`, `/metric_agg`, `/geo_agg`,
`/words_agg`), several query parameters are silently ignored, dropped, or left
unvalidated — so the caller (often an AI agent) believes the parameter was honored when
it was not, and gets wrong results with **no error**.

The triggering case: the `_c_` prefix is reserved for **concept filters**, but agents
wrongly apply it to **column filters** (`_c_ville_eq=Paris` instead of `ville_eq=Paris`).
A `_c_` key that matches no primary concept is silently dropped by design
(`commons.js:294-303`) so dashboards can broadcast concept filters across datasets — so it
cannot simply become an error. The full unfiltered result comes back with no signal.

A survey of the data endpoints found the silent failures fall into two groups:

- **Genuinely must stay non-fatal** (erroring would break a legitimate pattern):
  - `_c_`-prefixed keys that match no concept (dashboard broadcast).
  - Entirely unrecognized / misspelled parameters (`siez=10`, `sort_by=…`) — many clients
    (apps, embeds, portals) pass extra params today; rejecting them would be breaking.
- **Validation gaps that should simply error** (the rest of the codebase already errors on
  the equivalent situation — they were just missed):
  - `q_fields` listing an unknown or non-text-searchable column (silently dropped from the
    search; `commons.js:152` → `operations.ts:270`).
  - `highlight` on a column lacking `text`/`textStandard` capability — existence *is*
    checked (`commons.js:230`) but capability is not, yielding empty `_highlight`.
  - `/geo_agg` `metric` + `metric_field` passed raw to ES with no validation
    (`geo-agg.js:34-37`), unlike `/values_agg` and `/metric_agg`.

For reference, these already throw `400` correctly and need no change: `select` unknown
column (`commons.js:188`), `size`/`size*page` over max (169/179), `highlight` unknown
column (230), `sort` unknown or non-sortable column (73/78), `qs` lucene field/syntax
(checkQuery), `account` and aggregation `field` lacking capability.

## Goals

1. Stop agents from emitting `_c_`-prefixed column filters (prompt fix).
2. Surface the two non-fatal silent cases (`_c_` misuse, unrecognized params) as an
   always-on advisory hint — one generalized "ignored parameters" advisory.
3. Close the three validation gaps (`q_fields`, `highlight` capability, `geo_agg` metric)
   with proper `400` errors carrying the existing `columnOperationsHint`.
4. Make the always-on hint actually reach the agent (the data tools currently drop it).

## Non-goals

- No change to the silent-drop *behavior* of legitimate dashboard concept filters.
- No rejection of unrecognized params (hint only — rejecting would break existing clients).
- Inverse mistake detection (bare column filter intended as a concept) — out of scope.
- `analysis` invalid-value fallback in `/words_agg` — low priority, deferred.

## Background: recognized parameters

`_c_` params consumed by the API: `_c_q`, `_c_bbox`, `_c_geo_distance`, `_c_date_match`
(`commons.js:203,267,375,414…`; `words-agg.js:27`), plus `_c_<conceptId><suffix>` concept
filters where `<conceptId>` matches a field's primary concept (`x-concept.primary`).
**Everything else `_c_`-prefixed is inert.**

Scalar params consumed across the data endpoints (union): `size`, `page`, `after`,
`count`, `select`, `sort`, `q`, `q_fields`, `q_mode`, `qs`, `highlight`, `thumbnail`,
`owner`, `account`, `truncate`, `html`, `draft`, `bbox`, `geo_distance`, `date_match`,
`xyz`, `wkt`, `agg_size`, `field`, `metric`, `metric_field`, `metrics`, `extra_metrics`,
`percents`, `precision_threshold`, `interval`, `missing`, `analysis`, `format`, `hint`,
plus the dynamic `<columnKey><filterSuffix>` filter keys.

The authoritative source for the allowlist is the OpenAPI contract
(`api/contract/dataset-api-docs.ts`, the `in: 'query'` parameter definitions). The
detection should derive its allowlist from there where practical so it cannot drift, with
a test asserting no documented parameter is ever flagged.

## Part A — Remove the prompt ambiguity (cause)

Add the explicit negative rule in the three places the agent reads filter rules:

1. `agent-tools/_utils.ts` → `filtersDescription` (31-44): *"Never prefix a column filter
   with `_c_`. `_c_` is reserved for concept filters (full-text / geo / date, handled via
   the q/bbox/geoDistance/dateMatch params); a `_c_`-prefixed column filter is silently
   ignored, not applied."*
2. `agent-tools/dataset-data-subagent.ts` (filtering section, 22-25): same rule, one line.
3. `ui/src/composables/agent/navigation-tools.ts` (80 & 126): append "— never put `_c_`
   on column filters" to the existing `_c_`-scope sentence.

## Part B — "Ignored parameters" hint (safety net)

New **pure** function `ignoredParamsAdvice(req)` in `api/src/misc/utils/query-advice.ts`,
beside `queryAdvice`. It works from `req.query` + `req.dataset.schema` +
`FILTER_CAPABILITIES` + the recognized-param allowlist (derived from the contract /
shared constant). For each query key `K`:

- **Skip** if `K` is in the scalar allowlist, or is `<columnKey><filterSuffix>` for a real
  column, or is a recognized `_c_` special param, or is a concept filter resolving to a
  primary concept.
- **`_c_` misuse, Tier 1 (high-confidence typo):** `_c_<inner><suffix>` where `<suffix>`
  is a valid filter suffix and `<inner>` is a **column key** → suggest the bare form
  `<inner><suffix>` ("drop the `_c_` prefix; it is reserved for concept filters").
- **`_c_` inert, Tier 2:** any other unconsumed `_c_` key → "ignored — `_c_` is reserved
  for concept filters and matched no concept in this dataset".
- **Unknown parameter (#5):** any remaining key not in the allowlist → "`<K>` is not a
  recognized parameter and was ignored". (Optional, deferred: a did-you-mean suggestion via
  edit distance to the allowlist.)

Returns `''` when nothing applies, mirroring `queryAdvice`.

### Emission gate (in `attachQueryHint`, `query-advice.ts:73-91`)

- `hint=false` → return `result` unchanged (nothing emitted).
- Otherwise:
  - `correctness = ignoredParamsAdvice(adviceReq)` — computed **always** (fast or slow,
    `true` or `auto`).
  - `perf = shouldEmitHint(mode, esStepDurationMs) ? queryAdvice(adviceReq).trim() : ''`
    — perf advice keeps its slow-auto / `true` gate.
  - Join the non-empty pieces into the single `hint` string; attach only if at least one is
    present.
- The 429/504 error-advice path keeps calling only `queryAdvice` — unchanged.

### i18n (`api/i18n/messages/{en,fr}.json`)

Add, assembled in the existing `intro : item ; item.` shape:
- `queryAdviceIgnoredIntro` — e.g. EN "Some parameters were ignored".
- `queryAdviceConceptUseColumn` — item, EN "%s → use %s instead (the _c_ prefix is for
  concept filters)".
- `queryAdviceConceptUnknown` — item, EN "%s matched no concept here".
- `queryAdviceUnknownParam` — item, EN "%s is not a recognized parameter".

### Known tradeoff

Dashboards broadcasting a concept filter to a dataset lacking that concept get a Tier-2
hint in the response body; apps passing incidental extra params get an unknown-param hint.
Both are additive (a prepended `hint` field), ignored by clients, and suppressed by
`hint=false`. Accepted per the decision to flag any silent drop.

## Part C — Surface the hint to the agent

In `formatResult` of `agent-tools/search-data.ts` (75-96),
`agent-tools/aggregate-data.ts`, and `agent-tools/calculate-metric.ts`, append `data.hint`
to the text output when present (e.g. a trailing `> Hint: <hint>` line). Without this the
always-on hint never reaches the model.

## Part D — Close the three validation gaps (proper 400s)

1. **`q_fields`** (`commons.js`, where `qFields` is resolved ~152, or alongside the `q`
   handling 267-281): when `q_fields` is provided, each listed key must exist in the schema
   (else `400` "n'existe pas", like `select`) and be text-searchable (else `400` with
   `columnOperationsHint`, like `_search`).
2. **`highlight`** (`commons.js:227-233`): after the existence check, require the column to
   have `text` or `textStandard` capability; else `400` with `columnOperationsHint`
   (matching the `_search` requirement at `commons.js:366`).
3. **`/geo_agg` `metric`/`metric_field`** (`geo-agg.js:34-37`): validate exactly like
   `/values_agg`/`/metric_agg` — `metric_field` exists, has the `values` capability, and the
   metric/field type are compatible (reuse the existing `assertMetricAccepted` /
   metric-validation helper); else `400`.

## Testing

- `tests/.../query-advice.unit.spec.ts` (`ignoredParamsAdvice` / `attachQueryHint`):
  - Tier 1: `_c_ville_eq` + column `ville` → suggests `ville_eq`.
  - Tier 2: `_c_foo` → "matched no concept".
  - Unknown param: `siez=10` → "not a recognized parameter".
  - Legit concept filter, legit `_c_q`/`_c_bbox`, and every scalar in the allowlist → no
    advice (drift guard: iterate the contract's documented query params and assert none are
    flagged).
  - `hint=false` → suppressed; `auto` on a fast query → correctness hint still emitted.
- `tests/.../search-hint.api.spec.ts`: end-to-end `_c_`-typo and unknown-param requests
  return a `hint`.
- New / extended capability API tests for Part D: `q_fields` unknown column → 400;
  `q_fields` non-text column → 400; `highlight` non-text column → 400; `geo_agg`
  `metric_field` unknown / non-`values` → 400.
- agent-tools unit test: `formatResult` surfaces `hint` in the text output.

## Docs

Update `docs/architecture/agent-integration-architecture.md` (filter section) per the
CLAUDE.md mandate: the `_c_` disambiguation and the always-on ignored-parameters hint.
Note the new `q_fields`/`highlight`/`geo_agg` 400s if the doc enumerates error behavior.

## Affected files

- `agent-tools/_utils.ts`, `agent-tools/dataset-data-subagent.ts`
- `agent-tools/search-data.ts`, `agent-tools/aggregate-data.ts`, `agent-tools/calculate-metric.ts`
- `ui/src/composables/agent/navigation-tools.ts`
- `api/src/misc/utils/query-advice.ts`
- `api/src/datasets/es/commons.js` (Part D #1, #2), `api/src/datasets/es/geo-agg.js` (Part D #3)
- `api/i18n/messages/en.json`, `api/i18n/messages/fr.json`
- `docs/architecture/agent-integration-architecture.md`
- tests: `query-advice.unit.spec.ts`, `search-hint.api.spec.ts`, capability API specs, agent-tools unit spec
