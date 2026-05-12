# Catch-all `_search` field for wide datasets — design

## Problem

The `q` query parameter is turned into one or more Elasticsearch `simple_query_string` /
`query_string` clauses whose `fields` array is built from the dataset schema in
`getFilterableFields` (`api/src/datasets/es/commons.js`): for each text-bearing column it emits up
to three entries (`key`, `key.text^N`, `key.text_standard`). On datasets with many columns this
array reaches several hundred entries. Elasticsearch expands a `simple_query_string` into roughly
one sub-query per field per term, so a semantically trivial one-word `q` becomes hundreds of term
lookups across hundreds of term dictionaries — expensive to both parse and execute. The cost is
O(columns); no app-side memoization helps because the work is inside ES.

## Goal

For wide datasets, replace the O(columns) `fields` array with a constant-size set of internal
catch-all fields populated at index time via `copy_to`. Do **not** reindex existing datasets
eagerly; degrade gracefully until a wide dataset is next reindexed. Keep relevance ranking
(field boosting) roughly intact. Add a `q_fields` hint to the overload-advice messages.

## Width metric & threshold

`nbTextSearchFields(schema)` = number of schema fields whose `esProperty(field)` produces a
`.text` or `.text_standard` inner field. In practice this is all indexed non-object / non-geo
columns; string columns (`uri-reference` or no format) contribute both `.text` and
`.text_standard`, numbers/dates contribute `.text_standard`.

**A dataset is "wide" ⇔ `nbTextSearchFields(schema) > 30`.** This is a hardcoded constant in
`api/src/datasets/es/commons.js` — not configurable.

## Mapping changes

`indexDefinition(dataset)` (`api/src/datasets/es/manage-indices.js`) is a pure function of the
schema, so it computes `wide` itself. When `wide`:

- Add two top-level properties to `body.mappings.properties`:
  - `_search: { type: 'text', analyzer: config.elasticsearch.defaultAnalyzer, fields: { text_standard: { type: 'text', analyzer: 'standard' } } }`
  - `_search_boosted`: identical shape.
- On every column that currently produces a `.text` / `.text_standard` inner field, add a
  `copy_to`:
  - columns with `x-refersTo` ∈ { `http://www.w3.org/2000/01/rdf-schema#label`,
    `http://schema.org/description`, `https://schema.org/DefinedTermSet` } →
    `copy_to: ['_search', '_search_boosted']`
  - all other such columns → `copy_to: '_search'`
  - extension sub-fields live under nested objects (`properties[extKey].properties[subKey]`);
    `copy_to: '_search'` from there still targets the top-level `_search` (ES resolves the target
    from the mapping root).
- `_search` / `_search_boosted` are **not** added to `dataset.schema`, so they remain invisible to
  `select`, `select=*`, sort, filters, `highlight`, returned `_source`, and the `esFields` list
  built in `getFilterableFields`.

`updateDatasetMapping` (the cheap `putMapping`-without-reindex path) gets one more guard: if the
new mapping contains `_search` and the old one does not — i.e. the dataset just crossed the
threshold, or its `copy_to` assignments changed — throw, exactly like the existing "new inner
field added" case. That forces a full reindex. Consequence: wide datasets pick up `_search` on
their next reindex-triggering schema change; there is no migration job.

## Persistence

A new internal boolean `dataset.esCopyToSearch` is added to the dataset contract
(`api/contract/dataset*.js`) as read-only (not user-settable, stripped from user input like other
computed fields). After a successful (re)index — right after `switchAlias` succeeds in the
finalize/index task — the dataset is patched with the `wide` value that `indexDefinition` used. It
is recomputed on every reindex.

Query-time behavior keys off this stored flag, **never** off recomputing width from the live
schema (the live schema may differ from the schema the current index was built with).

**Virtual datasets:** the flag is not stored on the virtual dataset. At query time a virtual
dataset uses `_search` iff **every descendant** has `esCopyToSearch === true`. Implementation must
source the descendant flags where the virtual alias is built (`aliasName` uses
`dataset.descendants`); if it turns out the descendant flags are not reachable there without new
plumbing, the fallback is to treat virtual datasets as never-copyTo (legacy/reduced path). This
fallback is acceptable and must be decided during implementation, not left ambiguous.

## Query changes (`getFilterableFields` / `prepareQuery`)

Four regimes, evaluated in this order:

1. **`q_fields` given** — unchanged. Per-field path over the selected columns (already small).
2. **`esCopyToSearch === true` (or virtual dataset with all descendants true), no `q_fields`** —
   *catch-all path*:
   - `qSearchFields = ['_search']`, `qStandardFields = ['_search.text_standard']`.
   - extra `should` boosting clause:
     `simple_query_string { query: q, fields: ['_search_boosted', '_search_boosted.text_standard'], ...sqsOptions }`
     with a uniform boost (`^4`) — this replaces the previous per-field `^3` / `^2` boosts.
   - `q_mode=complete` keeps its structure: `${q}*` prefix sub-query → `['_search.text_standard']`;
     `"${q}"` phrase sub-query → `['_search']`; plain sub-queries → `['_search']` +
     `['_search.text_standard']` + the boosted clause.
   - `qWildcardFields` (the `wildcard`-typed contains-search fields used only in `q_mode=complete`,
     and only present when columns opt into the `wildcard` capability) are **unchanged** — they
     cannot fold into `_search`.
3. **wide but `esCopyToSearch` not true, no `q_fields`** — *reduced legacy path*:
   - `qSearchFields` is built with keyword (`f.key`) + `.text` variants only — **no
     `.text_standard`**.
   - `q_mode=simple`: drop the separate `.text_standard` (`qStandardFields`) clause entirely → the
     issued `fields` array is roughly halved.
   - `q_mode=complete`: `qStandardFields` is still populated with all `.text_standard` fields, but
     used **only** for the `${q}*` prefix sub-query, so autocomplete keeps working; the main and
     phrase clauses use `.text` only.
4. **not wide, not copyTo, no `q_fields`** — today's behavior, untouched.

`getFilterableFields`'s memo key (`id:finalizedAt:hasQ:qFields`) stays valid: `esCopyToSearch`
only changes alongside `finalizedAt` (patched at finalize), and width derives from the schema,
which is part of the memoized dataset argument. The function additionally reads
`dataset.esCopyToSearch` (and, for virtual datasets, descendant flags) when deciding the regime.

## Overload advice (`queryAdvice`, `api/src/misc/utils/query-advice.ts`)

Add one rule, independent of `esCopyToSearch` (restricting `q_fields` reduces cost in every
regime and is good practice): if `nbTextSearchFields(req.dataset.schema) > 30` **and** `q` or
`_c_q` is set **and** `q_fields` is absent → push a new i18n key `errors.queryAdviceQFields`
("…restrict the searched columns with `q_fields=col1,col2`"). Add the key to
`api/i18n/messages/en.json` and `api/i18n/messages/fr.json`.

## Tests

- Wide dataset (> 30 text columns): after finalize → mapping contains `_search` /
  `_search_boosted` with `copy_to` on the columns; `dataset.esCopyToSearch === true`; a `q=`
  matching a value in any column returns that row; a value longer than 200 chars in a free-text
  cell is matchable via `q` (this is the `ignore_above` × `copy_to` verification, expressed as a
  test); a match in an `x-refersTo` label column outranks a match in a plain column.
- Narrow dataset (≤ 30 columns): no `_search` in the mapping, `esCopyToSearch` falsy, legacy query
  behavior unchanged.
- Wide-but-not-reindexed (flag unset, or schema widened after the index was built): query uses the
  reduced `.text`-only path; `q_mode=complete` prefix still works; the simple-mode `fields` array
  shrank.
- `q_fields` set on a wide + copyTo dataset → query uses the explicit fields, not `_search`.
- Virtual dataset over children with / without the flag → uses `_search` only when all descendants
  have it.
- `queryAdvice`: a 429 on a wide dataset with `q` and no `q_fields` → the advice string mentions
  `q_fields`.
- Existing `tests/features/datasets/query/search-*.api.spec.ts` still pass.

## Documentation

Extend `docs/architecture/load-management.md`: the new advice rule, and a short section on the
`_search` catch-all field (what it is, the threshold, the `esCopyToSearch` flag, the
no-eager-reindex policy). No new doc file is created, so the `AGENTS.md` doc list is unchanged.

## Out of scope

- Eagerly reindexing existing wide datasets.
- A `datasetWarning` value like "reindex recommended for search performance" (could be added
  later).
- Folding `.wildcard`-typed fields into the catch-all.
- Making the width threshold configurable.

## Top implementation risks (resolve during planning/implementation)

1. **`ignore_above: 200` × `copy_to`.** Our string columns are `keyword` with `ignore_above: 200`
   and the `copy_to` sits on that keyword field. Verify against ES that values longer than 200
   chars still reach `_search` (expectation: yes — `copy_to` copies the field *value*, not the
   source field's indexed term; this is the standard `_all`-replacement pattern). If it turns out
   `ignore_above` does suppress the copy, the long free-text columns we most want searchable would
   be missing from `_search`; the fallback (e.g. a different mapping shape for wide datasets' text
   columns — note that simply dropping `ignore_above` reintroduces exposure to Lucene's term-length
   limit) must then be decided.
2. **Virtual-dataset descendant flags** must be reachable where the virtual alias is built; if not,
   fall back to treating virtual datasets as never-copyTo (legacy/reduced path).
