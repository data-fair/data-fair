# Concept-filter (`_c_`) misuse: prompt disambiguation + silent-drop hints

Date: 2026-06-02
Branch: `feat-better-suffix-filters`

## Problem

AI agents (and occasionally humans) wrongly apply the `_c_` prefix — which is reserved
for **concept filters** — to ordinary **column filters**, producing keys like
`_c_ville_eq=Paris` instead of `ville_eq=Paris`.

Two failure modes compound each other:

1. **Prompt ambiguity (cause).** The agent-facing documentation explains *where* `_c_`
   is used (`_c_q`, `_c_bbox`, `_c_geo_distance`, `_c_date_match`) but never states the
   negative rule. The `navigate` tool even shows `_c_`-prefixed and bare column filters
   mixed in one example string (`ui/src/composables/agent/navigation-tools.ts:126`),
   making `_c_` read like an optional/universal prefix.

2. **Silent failure (no safety net).** When a `_c_`-prefixed key does not resolve to a
   primary concept in the dataset, the API **silently drops it** by design
   (`api/src/datasets/es/commons.js:294-303`), so dashboards can broadcast concept
   filters to datasets that lack the concept. Result: `_c_ville_eq=Paris` returns the
   full unfiltered dataset with **no error**. The existing error-driven self-correction
   (recent commits on this branch) cannot fire because there is no error.

A bare column filter on an unknown column already throws `400`
(`commons.js:302`); only the `_c_` form drops silently. That gap is what this work closes.

## Goals

- Remove the prompt ambiguity so agents stop emitting `_c_`-prefixed column filters.
- Add a safety net that surfaces **any** silently-ignored `_c_` parameter (with or
  without a filter suffix) as an advisory hint, without breaking the dashboard
  broadcast contract.

## Non-goals

- No change to the silent-drop *behavior* itself (dashboards still rely on it).
- No hard `400` error for dropped `_c_` filters (would break dashboards whose concept id
  coincides with a column key). Hints only.
- No detection of the inverse mistake (bare column filter intended as a concept).

## Background: recognized `_c_` parameters

The API consumes exactly these `_c_`-prefixed parameters:

- Special params: `_c_q`, `_c_bbox`, `_c_geo_distance`, `_c_date_match`
  (`commons.js:203,267,375,414,432,480,531,720`; also read in `words-agg.js:27` and
  `query-advice.ts:43`).
- Concept filters: `_c_<conceptId><suffix>` where `<suffix> ∈ FILTER_CAPABILITIES` and
  `<conceptId>` matches a schema field's primary concept
  (`x-concept.primary === true`, `commons.js:287`).

**Everything else `_c_`-prefixed is inert** (never read). That closed set is what makes
reliable detection possible.

## Part A — Remove the prompt ambiguity (cause)

Add the explicit negative rule in the three places the agent reads filter rules:

1. `agent-tools/_utils.ts` → `filtersDescription` (lines 31-44): add one line, e.g.
   *"Never prefix a column filter with `_c_`. `_c_` is reserved for concept filters
   (full-text / geo / date, handled via the q/bbox/geoDistance/dateMatch params); a
   `_c_`-prefixed column filter is silently ignored, not applied."*
2. `agent-tools/dataset-data-subagent.ts` (filtering section, lines 22-25): the same
   negative rule, one line.
3. `ui/src/composables/agent/navigation-tools.ts` (lines 80 & 126): append
   "— never put `_c_` on column filters" to the existing `_c_`-scope sentence.

## Part B — Detection + always-on hint (safety net)

### Detection

New **pure** function `conceptFilterAdvice(req)` in
`api/src/misc/utils/query-advice.ts`, beside `queryAdvice`. It re-derives the
consumption rules from `req.query` + `req.dataset.schema` + `FILTER_CAPABILITIES`
(imported from `operations.ts`, the existing single source of truth for suffixes).

A local constant lists the recognized special params, with a comment pointing at the
`commons.js` consumers so the two stay in sync:

```ts
// recognized concept params consumed by commons.js (see _c_q/_c_bbox/_c_geo_distance/_c_date_match)
const CONCEPT_PARAMS = ['_c_q', '_c_bbox', '_c_geo_distance', '_c_date_match']
```

For each query key `K` starting with `_c_`:

- **Skip** if `K ∈ CONCEPT_PARAMS`.
- Otherwise it is a concept-filter attempt. Find the trailing `FILTER_CAPABILITIES`
  suffix (if any) and the inner name (`K` minus `_c_` minus suffix; or `K` minus `_c_`
  when no suffix matches):
  - If inner matches a **primary concept id** → applied, skip (no advice).
  - **Tier 1 (high-confidence typo):** valid suffix present *and* inner matches a
    **column key** → suggest the bare form `<inner><suffix>`.
  - **Tier 2 (inert):** any other unconsumed `_c_` key (no suffix, e.g. `_c_ville`; or a
    suffix whose inner matches neither concept nor column) → "ignored, matched no
    concept here".

Returns `''` when nothing applies, mirroring `queryAdvice`'s contract.

### Emission gate

In `attachQueryHint` (`query-advice.ts:73-91`):

- `hint=false` → return `result` unchanged (nothing emitted).
- Otherwise:
  - `correctness = conceptFilterAdvice(adviceReq)` — computed **always** (fast or slow,
    `true` or `auto`).
  - `perf = shouldEmitHint(mode, esStepDurationMs) ? queryAdvice(adviceReq).trim() : ''`
    — perf advice keeps its existing slow-auto / `true` gate.
  - Join the non-empty pieces into the single `hint` string; attach (prepended) only if
    at least one piece is present.

The 429/504 **error-advice** path keeps calling only `queryAdvice` — unchanged.

### i18n

Add to `api/i18n/messages/{en,fr}.json`, assembled in the existing
`intro : item ; item.` shape:

- `queryAdviceConceptIgnoredIntro` — e.g. EN "Some _c_ parameters were ignored (the _c_
  prefix is reserved for concept filters: full-text, geo, date)".
- `queryAdviceConceptUseColumn` — item template, e.g. EN "%s → use %s instead".
- `queryAdviceConceptUnknown` — item template, e.g. EN "%s matched no concept here".

### Known tradeoff

Dashboards that legitimately broadcast a concept filter to a dataset lacking that
concept will now receive a Tier-2 hint in the response body. It is additive (a prepended
`hint` field), apps ignore it, and `hint=false` suppresses it. Accepted per the decision
to flag *any* silent drop.

## Part C — Surface the hint to the agent

The data tools currently drop `data.hint`. In `formatResult` of
`agent-tools/search-data.ts` (lines 75-96), `agent-tools/aggregate-data.ts`, and
`agent-tools/calculate-metric.ts`, append `data.hint` to the text output when present
(e.g. a trailing `> Hint: <hint>` line). Without this the always-on hint never reaches
the model.

## Testing

- `tests/.../query-advice.unit.spec.ts` (new cases on `conceptFilterAdvice` /
  `attachQueryHint`):
  - Tier 1: `_c_ville_eq` + column `ville` → suggests `ville_eq`.
  - Tier 2: `_c_foo` (no suffix) → "ignored" message.
  - Legit concept filter (`_c_<conceptId><suffix>` matching a primary concept) → no advice.
  - Legit special params (`_c_q`, `_c_bbox`) → no advice.
  - `hint=false` → suppressed entirely.
  - `auto` mode on a fast query → correctness hint still emitted (perf advice not).
- `tests/.../search-hint.api.spec.ts`: end-to-end request with a `_c_`-typo filter
  returns a `hint`.
- agent-tools unit test: `formatResult` surfaces `hint` in the text output.

## Docs

Update `docs/architecture/agent-integration-architecture.md` (filter section) per the
CLAUDE.md mandate: document the `_c_` disambiguation and the new always-on
concept-filter hint.

## Affected files

- `agent-tools/_utils.ts`
- `agent-tools/dataset-data-subagent.ts`
- `agent-tools/search-data.ts`, `agent-tools/aggregate-data.ts`, `agent-tools/calculate-metric.ts`
- `ui/src/composables/agent/navigation-tools.ts`
- `api/src/misc/utils/query-advice.ts`
- `api/i18n/messages/en.json`, `api/i18n/messages/fr.json`
- `docs/architecture/agent-integration-architecture.md`
- tests: `query-advice.unit.spec.ts`, `search-hint.api.spec.ts`, agent-tools unit spec
