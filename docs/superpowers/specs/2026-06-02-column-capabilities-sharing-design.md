# Column capabilities: single source of truth + leaner agent intelligence

**Date:** 2026-06-02
**Status:** Design approved, pending spec review

## Context

Every dataset column carries an `x-capabilities` object that determines which query
operations it supports: filter suffixes (`_eq`, `_in`, `_search`, …), sorting, grouping,
metric and word aggregations. The mapping from capabilities to supported operations is
currently expressed in several disconnected places:

- **Enforcement** — `api/src/datasets/es/commons.js` (the filter loop calls
  `requiredCapability` per suffix; `parseSort`), `values-agg.js`, `metric-agg.js`,
  `words-agg.js`. Each site hardcodes which capability its operation needs.
- **OpenAPI docs** — `api/contract/dataset-api-docs.ts:143-168` re-derives the per-column
  suffix list in an inline `if/else` chain over `hasCapability()`.
- **Agent tools** — `agent-tools/get-dataset-schema.ts` + `_utils.ts` have **nothing**.
  `filtersDescription` only says "see server instructions for available suffixes", and
  `formatSchemaColumns` strips `x-capabilities`. The data-exploration subagent guesses
  suffixes by column type, tries, and fails with no actionable feedback.

The suffix→capability mapping is therefore duplicated between enforcement and docs, and
absent where the agent could use it.

`hasCapability`/`requiredCapability` already live in `api/src/datasets/es/operations.ts`
(re-exported via `commons.js`). `api/contract` already imports freely from `api/src`, so a
shared derivation has a natural home there. `agent-tools` is a deliberately
zero-dependency package consumed by the UI (not the API); pushing capability logic into it
would break that boundary.

## Goals

1. One declarative source of truth for "given a column, which query operations are valid".
2. Collapse the docs/enforcement duplication onto it.
3. Make the data-exploration subagent reliably pick valid filters — **without** per-column
   verbosity in `get_dataset_schema`.
4. Add **zero cost to the Elasticsearch query hot path.**

## Non-goals

- No per-column capability annotation in `get_dataset_schema` output (decision: "pure lean
  / errors only"). The agent assumes defaults and corrects reactively from errors.
- No new agent tool or capability-query endpoint.
- No change to `agent-tools`' zero-dependency boundary; the shared module stays API-side.
- No change to Elasticsearch query construction, analyzers, or mappings.
- Geo/date filters (`bbox`, `geoDistance`, `dateMatch`) stay out of the per-column
  derivation — they are concept/dataset-level, not column-capability driven.

## Design

### Part 1 — Shared derivation in `operations.ts`

A single declarative table and two pure functions, beside `hasCapability`:

```js
// THE one place the suffix→capability mapping is written.
const FILTER_CAPABILITIES = {
  _eq: 'index', _neq: 'index', _in: 'index', _nin: 'index',
  _gt: 'index', _gte: 'index', _lt: 'index', _lte: 'index',
  _starts: 'index', _exists: 'index', _nexists: 'index',
  _contains: 'wildcard',
  _search: ['text', 'textStandard'] // any-of
}

// suffixes valid for this column, in canonical order
export const getColumnFilters = (prop) => /* keys of FILTER_CAPABILITIES whose
  capability is satisfied; array values use any-of via hasCapability */

// fuller operation summary for docs / error messages
export const getColumnOperations = (prop) => ({
  filters: getColumnFilters(prop),
  sortable: /* values || insensitive (matches parseSort) */,
  groupable: /* values && !_geo* (matches values-agg) */,
  metric: /* values && numeric type (matches metric-agg) */,
  wordAgg: hasCapability(prop, 'textAgg')
})
```

`hasCapability` is **unchanged**. The any-of semantics for `_search` are handled *inside*
`getColumnFilters` (it calls `hasCapability` per element of the array), so the hot
`hasCapability` signature and body stay byte-for-byte identical.

### Part 2 — Self-orienting errors (core agent win)

`requiredCapability(prop, filterName, capability)` already holds `prop`. On the throw
branch only, it appends the valid alternatives for that column:

> Impossible d'appliquer un filtre `_contains` sur le champ `name`. La fonctionnalité
> "Texte filtrable sur groupe de caractères" n'est pas activée … **Filtres disponibles sur
> ce champ : `_eq`, `_neq`, `_in`, `_nin`, `_starts`, `_search`.**

Same enrichment for the sort error in `parseSort`, the group error in `values-agg.js`, and
the word-agg error in `words-agg.js` — each names the valid operations/filters for that
column, so the agent corrects on its next call.

The enrichment string is built by calling `getColumnFilters`/`getColumnOperations` **only
when constructing the error message** (i.e. only when the operation is already being
rejected). It never runs on a successful request.

### Part 3 — Consumers refactored onto the table

- **`dataset-api-docs.ts:143-168`** — replace the inline `if/else` chain with
  `getColumnFilters(p)` (plus the existing header logic). Pure dedup; doc generation is not
  a hot path.
- **`commons.js` filter loop** — for the single-capability suffixes (the `index` and
  `wildcard` ones), replace each branch's hardcoded capability argument with
  `FILTER_CAPABILITIES[filterSuffix]`, e.g.
  `requiredCapability(prop, filterSuffix, FILTER_CAPABILITIES[filterSuffix])`.
  `_search` is the one any-of case: it keeps its existing bespoke logic verbatim
  (selects whichever of `text`/`text_standard` is present, rejects only when neither),
  and is *not* table-driven — `requiredCapability`/`hasCapability` still take a single
  capability and stay unchanged. The array value `FILTER_CAPABILITIES._search` is read
  only by `getColumnFilters` (which does its own any-of). The ES query construction in
  every branch is untouched.

### Part 4 — Global reference for the agent (stated once, not per column)

- **`agent-tools/_utils.ts` `filtersDescription`** — rewrite from "see server instructions"
  to a compact real list: the index suffixes, plus the two exceptions (`_contains` needs a
  wildcard-enabled column, `_search` needs a text column), plus the rule: *"if a filter is
  rejected, the error states which filters the column supports — switch accordingly."*
- **`agent-tools/dataset-data-subagent.ts` prompt** — add a short "Filtering" note with the
  same rule and "prefer `_search` for free-text matching."
- **`get_dataset_schema`** — **unchanged** (pure lean).

## Hot-path guarantee

The Elasticsearch query success path is the constraint. After this change:

- `hasCapability` — unchanged (same body, same per-call cost).
- The filter loop's only new success-path work is **one object-property read**
  (`FILTER_CAPABILITIES[filterSuffix]`) per matched filter key, replacing a string literal.
  No allocation, no extra function call.
- `getColumnFilters` / `getColumnOperations` allocate arrays/objects and are invoked
  **exclusively** on the error path (message construction) and during OpenAPI doc
  generation. They are never called when a request succeeds.

A unit test asserts that, for every single-capability suffix, the capability the
enforcement loop checks equals `FILTER_CAPABILITIES[suffix]` (and that `_search`'s
text/text_standard handling matches `getColumnFilters`) — guaranteeing the table stays the
single source even though enforcement and enumeration read it through different call shapes.

## Files touched

| File | Change |
|---|---|
| `api/src/datasets/es/operations.ts` | Add `FILTER_CAPABILITIES`, `getColumnFilters`, `getColumnOperations`; enrich `requiredCapability` message. `hasCapability` unchanged. |
| `api/src/datasets/es/commons.js` | Filter loop reads capability from the table; `parseSort` error names valid alternatives. |
| `api/src/datasets/es/values-agg.js` | Group error names valid alternatives. |
| `api/src/datasets/es/words-agg.js` | Word-agg error names valid alternatives. |
| `api/contract/dataset-api-docs.ts` | Replace inline suffix derivation with `getColumnFilters`. |
| `agent-tools/_utils.ts` | Rewrite `filtersDescription` with the real suffix list + error-driven rule. |
| `agent-tools/dataset-data-subagent.ts` | Add short "Filtering" guidance to the prompt. |

## Testing

- **Unit** (`operations.ts` pure functions): `getColumnFilters`/`getColumnOperations` for
  the default column, `index:false`, `wildcard:true`, `values:false`, `textAgg:true`,
  `text:false`+`textStandard:false`. Table-consistency assertion vs. enforcement.
- **API** (`tests/features/datasets/schema/capabilities.api.spec.ts`): existing tests must
  pass unchanged (behavior-identical enforcement); add assertions that the 400 message now
  lists the valid filters for the column.
- **Agent-tools unit**: `filtersDescription` content sanity (lists suffixes) — light.
- No behavior change expected in any existing test; the enforcement outcomes are identical,
  only error message text gains a suffix list.

## Risks

- **Behavior drift in enforcement** when table-driving the loop. Mitigated: table values
  equal today's hardcoded args; `capabilities.api.spec.ts` covers the rejection cases; the
  consistency unit test pins them together.
- **Hot-path regression.** Mitigated by the guarantee above: no allocation added to the
  success path; enumeration helpers confined to error/doc paths.
- **Agent over-relies on errors** (extra round-trips). Accepted trade-off per the "pure
  lean" decision; exceptions are rare (most columns are all-default) and the round-trip
  only happens on the specific deviating column.
