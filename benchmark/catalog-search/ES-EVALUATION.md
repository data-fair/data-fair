# Catalog search on Elasticsearch — evaluation (2026-09-16)

Companion to [FINDINGS.md](./FINDINGS.md). Question: should the catalog search move from the
MongoDB text index to an Elasticsearch mirror (Mongo kept as fallback), and what does that cost.
`es-ab.mjs` runs the same judged queries on real ES indices built with data-fair's own
`custom_french` analyzer (copied from `api/src/datasets/es/manage-indices.ts`).

## 1. Measured gain

Same corpus, same 56 queries, same content per variant. MRR / hit@5 / median count.

| content | engine | koumoul | ademe | enedis |
|---|---|---|---|---|
| production fields | Mongo (english, = prod) | 0.59 / 16 / 2 | 0.51 / 11 / 17 | 0.68 / 11 / 5 |
| production fields | Mongo french | 0.69 / 17 / 3 | 0.55 / 12 / 17 | 0.68 / 10 / 5 |
| production fields | **ES** best_fields | 0.68 / 18 / 3 | 0.53 / 11 / 19 | 0.69 / 11 / 5 |
| production fields | ES cross_fields | 0.65 / 18 / 3 | 0.47 / 10 / 19 | 0.63 / 10 / 5 |
| + column labels | Mongo french | 0.86 / 20 / 5 | 0.67 / 14 / 19 | 0.68 / 10 / 5 |
| + column labels | **ES** | 0.83 / 22 / 5 | 0.60 / 13 / 20 | 0.66 / 11 / 5 |
| + labels + shadow (w3) | Mongo french | 0.92 / 21 / 5 | **0.96** / 18 / 19 | 0.91 / 14 / 5 |
| + labels + shadow (^3) | **ES** | **0.94** / 23 / 5 | 0.85 / 17 / 21 | 0.88 / **15** / 5 |

Reading: on catalogs of 100–200 datasets with short metadata, **the engine matters far less than
the content and the language**. Once the Mongo index is French, ES with a plain `multi_match` is
level with it overall; it is slightly better at hit@5 (recall into the top 5), slightly worse at
hit@1 on a few queries, and the differences are within the noise of a 56-query set.

Where ES wins is exactly the class the findings flagged as the Mongo ceiling — queries whose
content words are generic in the catalog:

| query | Mongo french | ES | why |
|---|---|---|---|
| la liste des maires de France | #5 | **#1** | IDF: *liste*, *France* stop outweighing *maires* |
| quels sont les établissements scolaires | #7 | **#2** | same |
| raccordements | #7 | **#1** | BM25 length norm on the stem broadening |

Where Mongo wins are cases where its per-document quirks happened to help ("classe énergétique"
#3 vs unranked: *énergétique* is so common on ADEME that BM25 discounts it; "bac S": the lone `S`
token). Neither side's losses are structural.

**What this A/B does not show:** the ES query here is naive (OR, `tie_breaker` 0.3, query-time
boosts mirroring the Mongo weights). Everything below is headroom the Mongo engine does not have at
all, and none of it was exercised.

## 2. Headroom that only the ES engine offers

- **Query-time synonyms** (`synonym_graph` filter): an organization-level acronym/synonym table
  applied without re-indexing anything. In Mongo the same thing is either query expansion in code or
  materialized per dataset (the shadow field). Both engines still need the *per-dataset* shadow
  field for dataset-specific wording.
- **Ranking controls**: `minimum_should_match`, phrase and proximity boosts, per-field analyzers
  (an exact-form boost as the data search already does), `function_score` — including boosting by
  the metadata completeness score from the parked `feat-metadata-completeness` branch, or a mild
  recency decay on `dataUpdatedAt`.
- **Highlighting** of why a dataset matched — the "recherche explicable" promise of the
  architecture doc, made visible.
- **Autocomplete** on titles (`search_as_you_type`), which Mongo cannot do.
- **`more_like_this`** on the mirrored document: automatic "voir aussi" suggestions for the 87–97%
  of datasets whose `relatedDatasets` is empty on two of the three catalogs.
- **One index for several resource types**: datasets, applications and portal pages in one ranked
  list — the goal of the abandoned search-pages experiment (removed in `f609ab890`).

## 3. What it costs

### 3a. Permissions — the crux, and it is tractable

`filterCan` (`api/src/misc/utils/permissions.ts:251`) builds a Mongo `$or` over embedded
`permissions[]` from a closed set of session shapes: public, `user:*`, the user id, the user email,
owner-user, owner-org (admins, plus contribs when `list` is in the contrib class, with or without
department), and org permissions filtered by role and department (with `*` wildcards). That set is
finite, so each dataset can carry a precomputed `_listProfiles: string[]` and the search becomes a
`terms` filter on the tokens the session holds (`adminMode` → `match_all`). The abandoned
experiment already wrote the dataset side of this (`getPrivateAccess`, `isPublic`, visible in
`git show f609ab890^:api/src/misc/utils/permissions.ts`).

The risk is divergence between the two implementations: a token bug is a permission bug. Two
mitigations make it safe:

1. **ES only ranks and filters; Mongo still serves.** The search returns ids and scores, the API
   then reads those ids from Mongo *with the real `filterCan` filter* and keeps the ES order. A
   token that is too generous cannot leak a document (Mongo drops it); a token that is too strict
   only hides one. Two queries per search instead of one, both cheap.
2. **A property test** that generates random permission arrays and sessions and asserts
   `mongoMatches(filterCan) === tokensMatch(_listProfiles)`. Half a day, and it pins the
   equivalence for good.

### 3b. Keeping the mirror in sync

58 write sites hit the `datasets` collection, but only ~14 in 9 files touch catalog-visible fields
(metadata patch, finalize, REST count/dates, slug, topics rename, publication sites, owner
rename, master-data flags) plus 1 delete site. Three of those are `updateMany` renames that do
not bump `updatedAt`, so a pure watermark sync would miss them. The fit with the codebase is the
existing flag-and-poll pattern (`_needsIndexing`, `_partialRestStatus`): mark the document dirty at
those sites (`_catalogIndex: 'dirty'`), let a light worker task flush dirty documents to ES in
bulk, add a periodic full reconciliation to heal drift and an admin "rebuild catalog index"
action. Mongo change streams would be simpler code but require a replica set — to be checked on
production before choosing.

### 3c. Fallback

Config flag `catalog.searchEngine: 'mongo' | 'elasticsearch'`, and at runtime a circuit breaker:
any ES error on the search path answers from the Mongo text index for the next N seconds and logs
it. Since the Mongo path is today's code, the fallback costs nothing to write and stays exercised
by the test suite. The Mongo index should still be switched to French — it is the fallback's
quality floor.

### 3d. Maintenance

A second index family to version (the datasets indices already have a shape/version scheme to copy),
ES upgrades now touch the catalog, the test suite already needs ES so no new infra. Facets: ES
aggregations under the `_listProfiles` filter (counts trust the tokens — a wrong count is not a
leak) or keep the Mongo facet machinery on the same query; count comes from ES.

### 3e. Effort

| block | size |
|---|---|
| mirror document + `_listProfiles` + property test | 2–3 days |
| dirty flag at ~14 sites + flush worker + reconciliation + rebuild action | 2–3 days |
| search route: ES query, Mongo hydration, ordering, pagination, count, circuit breaker | 2 days |
| facets on ES, highlighting, tuned query (msm, exact boost) | 1–2 days |
| tests (search parity with Mongo on the judged set, fallback, sync) + docs | 2 days |
| **total** | **~2–3 weeks** |

The content work (French index, shadow field + assistant tool, `_searchText` from schema labels,
settings, agent tools) is needed **in both worlds** and is what moves the numbers: ES replaces the
engine, not the content. Designing `_searchText` and the shadow field as fields stored on the
Mongo document (mirrored to ES later) keeps the two phases independent.

## 4. Recommendation

1. **Now, engine-neutral:** French Mongo index, shadow field (weight 3, assistant-filled),
   `_searchText` from column labels, enum inclusion opt-in, agent tools exposing topics /
   concepts / relatedDatasets. This is the measured 0.5 → 0.9 MRR and it is a 1–2 week block.
2. **Then, ES as a second phase**, decided on three inputs rather than on quality alone: (a) whether
   the "la liste des X de France" ranking class matters to real users — it is the one class where
   ES is clearly better; (b) whether the centralized search ambition (datasets + applications +
   pages, several owners) is back on the table — that is the feature only ES gives; (c) the
   production Mongo topology, which picks the sync mechanism. If (a) or (b) is yes, the 2–3 weeks
   are justified and the design above is the plan; if not, the Mongo path is sufficient for the
   catalog sizes measured here.
