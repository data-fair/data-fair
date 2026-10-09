# Catalog search — design (2026-09-16)

> **Superseded in part by [2026-09-18-text-search-util-design.md](2026-09-18-text-search-util-design.md).**
> This pair still describes the MongoDB `$text` engine and the per-organization `catalogSearch`
> switches, both of which were replaced before merge — the owned term index took over `q=`, and
> schema-label indexing became unconditional with no organization setting. Kept as the record of
> the evidence and the reasoning; see [docs/architecture/catalog-search.md](../architecture/catalog-search.md)
> for what shipped.

Branch `feat-better-catalog-search`. Spec A of two: this one covers the catalog search itself
(index, content, settings, assistant); spec B will cover the exposure of the catalog graph to
agents (`list_datasets` filters and facets, `relatedDatasets` in `describe_dataset`).

Evidence: [benchmark/catalog-search/FINDINGS.md](../../benchmark/catalog-search/FINDINGS.md)
(three live catalogs, 56 judged queries, real Mongo and ES A/B) and
[ES-EVALUATION.md](../../benchmark/catalog-search/ES-EVALUATION.md). In short: the production
index runs English stemming and stopwords on French catalogs; column labels and a hidden synonym
field move the measured MRR from ~0.55 to ~0.9; column keys add nothing; enum values help on
categorical catalogs and add noise on code-heavy ones; Elasticsearch is level with a French Mongo
index at these catalog sizes and its one clear advantage (IDF) can be approximated in Mongo.

## 1. Scope and principles

Round 1, data-fair only:

1. Catalog text index in French (configurable), revised fields and weights.
2. `searchTerms`: a per-dataset hidden search field, editable, assistant-fillable.
3. `_searchText`: a calculated field from column titles/descriptions (default on) and enum values
   (default off), bounded in size, guarded by the dataset's own permissions, with organization-level
   switches and a disclaimer.
4. `set_dataset_metadata` writes `searchTerms`; a `search_terms_writer` subagent and an action
   button propose it.
5. `docs/architecture/data-catalog-exploration.md` rewritten to describe what ships.

Documented as options, not built (§9): query-time df stripping, an organization-level thesaurus,
the Elasticsearch phase.

Out of scope: agent/MCP graph exploration (spec B), portals rendering (a portals backlog note).

Engine-neutral by construction: every new piece of content is a field on the Mongo dataset
document; query building stays in one place (`findDatasets` / a small catalog-search module);
nothing outside it assumes the Mongo text index.

## 2. Data model

### `searchTerms` — dataset property

- `string`, max 1 000 characters, title "Termes de recherche associés".
- Written through the normal metadata PATCH (added to `api/doc/datasets/patch-req/schema.js`),
  returned to anyone with `readDescription`; it is metadata, not a secret.
- Never displayed by portals, never a facet. The reason it is not `keywords`: `keywords` is a
  facet and, on real catalogs, a thematic tag list; thirty synonyms per dataset would wreck it.
- Gated like `keywords` by `settings.datasetsMetadata.searchTerms.active`, **default true** — it
  exists without configuration. A missing setting means active (`isFieldAvailable` already reads
  `active !== false`; the form must do the same).
- Indexed at weight 3 (see §2.4): without IDF, a weight-1 synonym cannot outrank a generic word
  present in sixty titles at weight 3 (FINDINGS §4, "voiture électrique").

### `_searchText` — calculated field

- `string`, underscore-prefixed like `_modified`: stripped by `datasetUtils.clean`, excluded from
  `select` through `findUtils.project`'s hidden list, present only for the index.
- Content, computed by the pure `computeSearchText(dataset, catalogSearch)` in
  `api/src/datasets/operations.ts`:
  - columns = `schema` minus `x-calculated` (extension columns keep their labels — they are
    schema too); column keys are **not** included (measured: no value);
  - labels part: each column's `title` (whole, hard cap 200 chars) and the **first 200 characters
    of its `description`, cut at a word boundary** — the opening of a description carries the
    vocabulary, the rest is prose and only dilutes term weights; identical strings deduplicated
    (census datasets repeat a label across dozens of columns); included when
    `catalogSearch.indexSchemaLabels !== false`;
  - enum part: string `enum` values, ≤ 100 chars each, ≤ 500 values; included when
    `catalogSearch.indexEnumValues === true`;
  - caps: labels part ≤ 8 kB, enum part ≤ 8 kB, whole ≤ 16 kB; when a cap is hit, columns are
    taken in schema order and the rest dropped whole — no partial strings;
  - returns `undefined` when nothing remains (field unset, not empty).
- Size matters for ranking, not just storage: Mongo's per-term factor is
  `0.5 + 0.5 × freq / numTokens`, so a verbose field weakens its own terms.

### The automatic guard

Always on, inside `computeSearchText`. Expand `permissions[]` per grantee (the public entry, the
`user:*` entry, each user/organization entry) into operations with `permissionOperations`
(exported from `misc/utils/permissions.ts`). If any grantee holds `list` without `readSchema`, the
labels part is dropped; without `readLines`, the enum part is dropped. Owner members are not
grantees (they hold everything), so only explicit permissions can trigger it. Exact, cheap, no UI.

### Organization settings — `settings.catalogSearch`

```
catalogSearch: {
  indexSchemaLabels: boolean  // default true  — "Libellés et descriptions de colonnes"
  indexEnumValues:   boolean  // default false — "Valeurs distinctes des colonnes"
}
```

Disclaimer shown under both: a search match can reveal that a column or a value exists to anyone
who can list the dataset, even without access to its schema or its lines; datasets with such
viewers are excluded automatically by the guard.

### The index

`api/src/mongo.ts`, `datasets.fulltext`:

```
{ title: 'text', searchTerms: 'text', summary: 'text', description: 'text', keywords: 'text',
  'topics.title': 'text', 'owner.name': 'text', 'owner.departmentName': 'text', _searchText: 'text' }
{ weights: { title: 3, searchTerms: 3, summary: 2 }, default_language: config.catalogSearch.language }
```

New config `catalogSearch.language`, default `french` (any Mongo text-index language name, or
`none` for deployments that want no stemming). Applied to `applications.fulltext` as well
(language only). lib-node's `ensureIndex` catches the 85/86 conflict and rebuilds both indexes at
API start; no upgrade script for the index itself.

## 3. Computation and write paths

`_searchText` follows the `_modified` precedent: it lands in the same `$set` as the write that
changed its inputs, never as a second round-trip.

1. **Finalize** (`workers/short-processor/finalize.ts`, the `result` patch handed to
   `applyPatch`) — where `enum` and `x-cardinality` are stamped, so the enum part is always
   computed from settled values. Reads the owner's `catalogSearch` settings (one query).
2. **`applyPatch`** (`datasets/service.ts`) when `schema` is in the patch — column title and
   description edits are "innocuous" schema props (`data-schema.ts`, `innociousSchemaProps`)
   that trigger no reprocessing, so this is the only place that sees them. Skipped for drafts
   (`dataset.draftReason` or `patch.draftReason`), like the completeness score: the field
   describes the published dataset.
3. **PUT `/permissions`** (`misc/utils/permissions.ts`, the generic sub-router) — the guard's
   input. The sub-router gains an optional `afterUpdate(resource)` hook; the datasets router passes
   one that recomputes and writes `_searchText`; applications pass nothing.
4. **Settings write** (`settings/service.ts`, next to `updateDatasetsMetadata`) — when
   `catalogSearch` changes, recompute inline over the owner's datasets in chunks of a few hundred.
   Rare admin action; if a production owner proves too large, a `_needsSearchText` flag and a
   worker task are the fallback, not built in round 1.

**Backfill**: one upgrade script (next version folder, per the `upgrade-scripts` skill) stamping
`_searchText` on every existing non-draft dataset from stored schema, permissions and owner
settings (settings cached per owner). Mongo-only, as the no-ES-patching rule requires.

## 4. Search behaviour and API surface

- Query path unchanged: `findDatasets` keeps `$text: { $search: q }` sorted by `textScore`; no new
  parameters. The gain comes from the index.
- `_searchText` never leaves the API (project hidden list + `clean`). `searchTerms` is a normal
  metadata field: selectable, present in the catalog OpenAPI (built from the dataset schema),
  readable with `readDescription`.
- Existing tests asserting `q=` results are re-run under the French stemmer; expectations that
  flip are adjusted, the stemmer is not.
- Portals: not displayed, by not adding it to any template — a one-line note in the portals
  backlog, no code here.

## 5. UI

**Metadata form** (`ui/src/components/dataset/metadata/dataset-metadata-form.vue`), no new tab:

- `searchTerms` as a 3-row `v-textarea` directly under `keywords`, shown when
  `datasetsMetadata?.searchTerms?.active !== false`, disabled without `writeDescription`, label
  "Termes de recherche associés", help tooltip: *not displayed anywhere, only used by the catalog
  search; synonyms, acronyms and their expansions, everyday wording; free text.* `fieldColor`
  highlighting applies when the assistant fills it.
- A `df-agent-chat-action` beside it, same shape as the summarize/describe buttons:
  `action-id="suggest-search-terms"`, hidden context: run the `search_terms_writer` subagent,
  present the list, ask for approval, apply with `set_dataset_metadata (searchTerms)`.

**Settings** (`ui/src/pages/settings.vue`, inside the existing *datasetsMetadata* tab):

- `searchTerms` joins the generated list of activatable metadata fields (schema entry with
  `active` default true and the usual custom-label field).
- Below it, a "Recherche du catalogue" section bound to `settings.catalogSearch`: the two
  switches and a tonal alert with the disclaimer, including one sentence on the automatic guard.

## 6. Assistant

- `set_dataset_metadata` gains `searchTerms` (string; in `OPTIONAL_FIELDS` so the
  `datasetsMetadata` gate applies); `read_dataset_metadata` reports its value and that readers
  never see it. Same patch/outcome plumbing in `agent-metadata-tools-logic.ts`.
- New subagent `search_terms_writer`, registered next to `dataset_summarizer` in
  `agent-metadata-tools.ts`: reads title, summary, description, keywords, topics, column
  titles/descriptions and, for low-cardinality columns, the enum values; writes 10–40 French
  terms, newline-separated, under explicit rules — no repetition of words already in the
  title/summary, acronyms **with** their expansion, everyday and administrative variants,
  related concepts a person would type, no sentences. Returns text only; the form fill goes
  through `set_dataset_metadata`, nothing is saved before Enregistrer.
- `docs/architecture/agent-integration.md` updated (tool parameter, subagent, action button).

## 7. Testing

- **Unit** (pure functions, `tests/features/datasets/*.unit.spec.ts`): `computeSearchText` —
  labels vs enums parts, the guard (grantee with `list` only; `list`+`readSchema`; org entries
  with role/department; public entry), description truncation at a word boundary, dedup, the
  8/8/16 kB caps with whole-column drops, `undefined` when empty; `buildMetadataPatch` with
  `searchTerms` and its gate.
- **API** (`tests/features/datasets/catalog-search.api.spec.ts`): a phrased French query no longer
  matches the whole catalog; a term present only in a column title finds the dataset with labels
  on and not with labels off; enum values only with the org switch on; `_searchText` absent from
  list, get and `select`; `searchTerms` written by PATCH, matched by `q`, returned with
  `readDescription`; PUT `/permissions` granting `list` alone strips the schema part; a settings
  change recomputes existing datasets; the upgrade script backfills.
- **Existing `q=` assertions** re-run under the French stemmer.
- **Simulation** (`/agents-sim`, one case): a maintainer asks for search terms, the assistant
  proposes, the field lights up, nothing is saved before Enregistrer. Run once at the end.
- `benchmark/catalog-search` stays as the evidence record; it can be re-run against the API to
  confirm the index change reproduces the A/B. Not part of any test script.

## 8. Architecture document

`docs/architecture/data-catalog-exploration.md` rewritten for the same audience (positioning for
humans and agents) with every mechanism true:

1. status header (date, scope, what is implemented);
2. indexation: fields, weights, French analysis, the honest scoring model (TF + field weights,
   no IDF) and what it implies;
3. "termes de recherche associés" replacing the shadow-content section: the assistant workflow,
   why it is not `keywords`;
4. `_searchText`: content, size policy, the guard, the switches and the disclaimer;
5. distinct-values preview: automatic, ≤ 50 values, sparsity guards — limits an agent must know;
6. the graph section (relatedDatasets / topics / concepts) with the note that agent exposure is
   spec B;
7. the two interfaces: the real MCP server (`@data-fair/mcp`) named, the current parity gap
   stated, spec B referenced;
8. "Perspectives" carrying §9 with trigger conditions;
9. the stale metadata-completion entry in `agent-integration-gaps.md` closed.

## 9. Perspectives (documented, not built)

- **Query-time df stripping**: drop query terms matching more than 30% of the catalog when a rarer
  term remains, one cached count per term, ignore one-character terms. Measured in FINDINGS §4b
  (Mongo reaches the ES numbers on the generic-word class). Trigger: the HTTP logs showing
  queries of the "liste de X en France" shape.
- **Organization-level thesaurus**: an acronym/synonym table expanded into `q`. Trigger: the same
  acronyms recurring across many datasets' `searchTerms`.
- **Elasticsearch catalog index**: per ES-EVALUATION.md — dirty-flag sync at ~14 write sites,
  `_listProfiles` tokens with Mongo hydration as the permission safety net, circuit-breaker
  fallback to the Mongo index. Triggers: multi-resource centralized search coming back, or
  catalogs an order of magnitude larger than the ones measured.

The HTTP logs of the live catalogs are the evidence source for all three triggers.
