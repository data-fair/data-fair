# Reusable text-search util — design (2026-09-18)

**Status:** approved design, not implemented.

Replaces the MongoDB `$text` index behind `q=` on **datasets** and **applications** with an
owned inverted index and a dis_max BM25 scorer generated into the aggregation pipeline.

**Why:** `$text` has no inverse document frequency at all, and no query-time lever can add one
(query terms are deduplicated, only one `$text` expression is allowed per query, and
`$meta:'textScore'` is a single opaque scalar). Measured on 170 mechanically generated hard
queries over three live catalogs, `$text` scores **140/170 hit@1**. The design below scores
**168/170, MRR 0.994 — identical to Elasticsearch**.

Evidence for every number: [`benchmark/catalog-search/ENGINE-OPTIONS.md`](../../benchmark/catalog-search/ENGINE-OPTIONS.md)
and the harness scripts beside it.

---

## 1. Scope

| in | out |
|---|---|
| `datasets` and `applications` `q=` search | `remote-services`, `base-applications`, `catalogs` — they keep `$text`, untouched |
| dis_max BM25 ranking, phrase search, `-negation` | fuzzy matching, synonyms, autocomplete, cross-collection search |
| a collection-agnostic util, shaped for extraction to `~/data-fair/lib` | actually extracting it |

The util is built inside data-fair but must be **extractable verbatim**: its pure modules import
nothing at all, and its single I/O module takes a `Collection` as a parameter. Nothing under
`text-search/` may import `#config`, `#mongo`, `#types` or Express. On extraction the pure
modules match `@data-fair/lib-utils` (dependency-less) and the stats module matches
`@data-fair/lib-node` (mongodb as an optional peer dependency).

## 2. Module layout

```
api/src/misc/utils/text-search/
  analysis.ts     pure, zero deps — language → { tokenize(text): Token[] }
  definition.ts   pure — the TextSearchDefinition type and its validation
  indexing.ts     pure — document + definition → { _terms, _pos, _len } | null
  query.ts        pure — query string + stats → QueryPlan | null
  pipeline.ts     pure — QueryPlan → mongo filter, score expression, sort spec
  stats.ts        I/O — memoized corpus statistics; takes a Collection as a parameter
  index.ts        defineTextSearch(definition) → the bound façade used by call sites
```

Dependency direction is one-way: `index.ts → {stats, pipeline, query, indexing, analysis}`, and
`analysis.ts` depends on nothing. Only `stats.ts` performs I/O.

### The definition

```ts
interface TextSearchDefinition {
  /** dotted path → weight. Paths may traverse arrays, e.g. 'topics.title'. */
  fields: Record<string, number>
  /** default language, used when a document declares none */
  language: string
  /** bump when fields, weights, language or the analyzer change — drives re-indexing */
  version: number
  /** candidate gate size: the rarest K query terms. Minimum 2. Default 3. */
  gateSize?: number
  /** dis_max tie_breaker. Default 0.3. */
  tieBreaker?: number
  /** deterministic secondary sort key. Default 'id'. */
  tieBreakField?: string
}
```

`definition.ts` throws on construction if `gateSize < 2`, if any weight is `<= 0`, or if
`fields` is empty. `gateSize < 2` is a correctness bug, not a tuning choice — see §5.

Configured instances live in `api/src/misc/utils/text-search/collections.ts` (which *may*
import `#config`, being data-fair wiring rather than util code):

```ts
export const datasetsTextSearch = defineTextSearch({
  fields: { title: 3, searchTerms: 3, summary: 2, description: 1, keywords: 1,
            'topics.title': 1, 'owner.name': 1, 'owner.departmentName': 1, _searchText: 1 },
  language: config.catalogSearch.language,
  version: 1
})
export const applicationsTextSearch = defineTextSearch({
  fields: { title: 3, summary: 2, description: 1, 'owner.name': 1, 'owner.departmentName': 1 },
  language: config.catalogSearch.language,
  version: 1
})
```

These mirror the `fulltext` index weights they replace (`api/src/mongo.ts`).

## 3. Stored index fields

Written onto the document itself — not a sibling collection — because composing the permission
filter into the *same* `$match` is the core architectural advantage over Elasticsearch, and a
sibling collection would force a `$lookup` or a two-phase query.

| field | shape | purpose |
|---|---|---|
| `_terms` | `string[]` — unique stems across all fields | the multikey-indexed candidate gate |
| `_pos` | `{ [field]: { [stem]: number[] } }` — raw token positions | term frequency (`$size`) **and** phrase adjacency |
| `_len` | `{ [field]: number }` — indexed token count | BM25 length normalisation |
| `_searchIndex` | `{ v: number, at: string }` | which definition version produced this |
| `_needsSearchIndex` | `true`, or absent | the deferred-recompute flag (§8) |

There is no `_tf`: term frequency is `$size($_pos.<field>.<stem>)`, measured at 236 ms vs 241 ms
for a stored count at 200k documents — within noise. Positions cost **~2.3 KB per document**,
taking index fields from ~3.7 KB to ~6 KB.

**`_len` and `_pos` count different things and must not be conflated.** `_len` is the number of
*indexed* tokens in a field (post-stopword), which is what BM25 normalises by. Positions are
*raw* indices into the pre-stopword token stream, which is what makes adjacency survive stopword
removal: "courbe de charge" indexes as `courb@0, charg@2`, so it does not match "courbe et
charge" at delta 1.

**Stems are used as object keys in `_pos`**, so the analyzer must guarantee they contain no `.`
and no leading `$`. The `[a-z0-9]+` split gives this by construction; `indexing.ts` asserts it
rather than trusting it, because a future analyzer change would otherwise corrupt writes silently.

### MongoDB indexes

In `api/src/mongo.ts`, for both `datasets` and `applications`:

```ts
terms:        { _terms: 1 },
'owner-terms': { 'owner.type': 1, 'owner.id': 1, _terms: 1 },
_needsSearchIndex_1: [{ _needsSearchIndex: 1 }, { sparse: true }],
```

Both term indexes are required. The compound one cannot serve a query without an owner, and the
back-office permission filter is an `$or` across own / shared / public with no single owner.

The compound index is the single largest scaling lever in this design. On 200k datasets across
200 tenants, a portal query:

| | documents examined | wall |
|---|---|---|
| global gate, then filter by owner | 62,360 | 82 ms |
| owner-scoped gate (compound index) | **321** | **7 ms** |

MongoDB's planner selects the compound index unaided; no query hints are needed.

The existing `fulltext` text index declarations **stay in this release** — see §9.

## 4. Analysis

`analysis.ts` has **zero runtime dependencies**. Stemmers are hand-written and injectable.

Pipeline, applied identically at index time and query time: deaccent (NFD, strip combining
marks) → lowercase → strip French elision (`l'`, `d'`, `j'`, `m'`, `t'`, `s'`, `n'`, `c'`,
`qu'`) → split on `[^a-z0-9]+` → drop tokens shorter than 2 characters → drop stopwords → stem.
Each surviving token keeps its index in the **pre-filter** stream as its position.

Built-in stemmers: a **light French stemmer** (a port of the Savoy algorithm that Lucene ships as
`light_french`: strips plurals and feminine endings, normalises common suffixes, collapses
doubled consonants — Apache-2.0, attributed in the file header) and a trivial English one.
An unknown language degrades to deaccent + lowercase + stopwords with no stemming.

**Why light rather than Snowball, corrected.** An earlier reading of the evidence claimed light
stemming was *measurably better*. That result (light_french beating snowball by 4–6 hit@1) belongs
to Elasticsearch's `best_fields` query, not to this design's dis_max scorer. Measured on our exact
scorer, the two are within one query — snowball 167/170 (MRR 0.990), light_french 166/170 (0.987).

So the choice is made on **implementation cost and dependencies, not quality**: a light stemmer is
~60–80 hand-writable lines with zero dependencies, whereas Snowball French is a large algorithm
with region logic that is error-prone to port, and `@orama/stemmers` would add 3.9 MB to get the
same result. Light stemming also leaves tokens closer to their surface form, which helps the
deferred typeahead (§12). If a future measurement shows the one-query gap matters, the `stemmers`
override is the supported way to swap it.

`defineTextSearch` accepts a `stemmers: Record<string, (word: string) => string>` override so a
deployment wanting broader language coverage can supply its own without changing the util.

**Per-document language is supported but latent.** Datasets and applications carry no language
metadata today, so data-fair passes `config.catalogSearch.language` everywhere. The util takes a
language per document and per query so that a future language field needs no util change. No
schema property, form field or migration is added for it now.

## 5. Query planning

`parseQuery(q)` is pure and synchronous. It produces:

- **positive terms** — ordinary words
- **negated terms** — words prefixed with `-`
- **phrases** — quoted groups, each carrying its terms *and their raw offsets*

`planQuery(parsed, stats)` then:

1. **Drops terms with `df = 0`.** They cannot match or contribute to any score. This is also
   what neutralises typos before they reach the gate.
2. **Returns `null` if no positive term survives.** The caller must render this as **no
   results** — never as "no text filter". A query of only negations also returns `null`, matching
   `$text`, whose `$search: "-foo"` likewise returns nothing.
3. **Builds the gate**: the rarest `gateSize` positive terms, plus **all** terms of every phrase.
4. **Precomputes the idf of every scored term.**

### The gate rule, and why `K ≥ 2` is mandatory

Gating on the single rarest term is ~4× faster and, on the benchmark as generated, costs nothing
— because those queries are built *from* each target's title, so the target always contains every
term including the rarest. It is a hidden AND, and the query set structurally cannot reveal it.
Injecting one word the target does not contain:

| gate | as generated | + a typo | + a rare real word the target lacks |
|---|---|---|---|
| OR all terms | 161/170, 0 lost | 161/170, **0 lost** | 161/170, **0 lost** |
| rarest 1 | 161/170, 0 lost | 0/170, **170 lost** | 17/170, **153 lost** |
| rarest 2 | 161/170, 0 lost | 161/170, **0 lost** | 161/170, **0 lost** |
| rarest 3 | 161/170, 0 lost | 161/170, **0 lost** | 161/170, **0 lost** |

**One mistyped word and rarest-1 returns an empty page** — not a degraded ranking, nothing —
because an unknown term is by definition the rarest and becomes the gate. `K` must exceed the
number of noise terms tolerated, since noise sorts to the rare end by construction. Default 3
(survives two), floor 2, enforced in `definition.ts`.

**Phrase terms are ANDed into the gate, not folded into the rarest-K union.** The phrase
predicate is an `$expr` and cannot use an index, so it is a post-filter over whatever the gate
returns; `$all` over a phrase's terms is far more selective than the rarest-K `$in`, and that is
what keeps the post-filter cheap.

### Negation

`-term` matches `$text`, Elasticsearch and common search convention, and is kept for that
familiarity. Negated terms are excluded from the gate and from scoring, and add one clause:
`{ _terms: { $nin: negatedTerms } }`.

Cost: **free inside the search pipeline** — 836 ms → 752 ms at 200k, because it removes documents
from the scoring work. The standalone `countDocuments` pays ~10× (28 ms → 300 ms at 200k),
inherent rather than a planning accident: every formulation tried (`$nor`, `$nin`, `$ne`,
`$not`/`$elemMatch`) costs the same and all use IXSCAN. Negligible at catalog scale.

**Known trap, accepted deliberately:** a `nanoid()`-generated tag can begin with `-`, so
`q=<tag>` parses as a negation and fails to match — the same pitfall the existing `$text` API
tests encode. The `null`-plan rule above at least makes it an empty result rather than an
unfiltered one. Document it in the API reference; update the affected fixtures.

## 6. Scoring

**dis_max over per-field BM25**, not a sum. This one line of arithmetic is worth the entire gap
to Elasticsearch:

| | fields summed | fields dis_max'd |
|---|---|---|
| this design, document-level idf | 161/170 (0.974) | **168/170 (0.994)** |
| this design, Lucene-style per-field idf | 161/170 (0.974) | **168/170 (0.994)** |
| Elasticsearch, `light_french` | 160/170 (0.971) | 168/170 (0.994) |

Told to sum its fields, Elasticsearch scores **below** this design at the same setting.
Per-field idf is worth nothing on this corpus, so a single document-level `df` is used.

Per field: sum each term's BM25 contribution, then multiply by the field weight. Across fields:
`max(fieldScores) + tieBreaker × (sum(fieldScores) − max(fieldScores))`.

Constants: `K1 = 1.2`, `B = 0.75`, `tieBreaker = 0.3`,
`idf(t) = ln(1 + (N − df + 0.5) / (df + 0.5))`.

Generated as an `$addFields` expression with the idf values baked in as literals. Verified
against a node reference implementation on all 170 queries: identical top-3, zero mismatches.

**Sort on `{ _score: -1, <tieBreakField>: 1 }`.** Near-duplicate datasets produce *exact* score
ties — Enedis has whole families of them — and MongoDB leaves ties in an undefined order. Without
the secondary key, 34 of 170 queries returned a different top-3 than the reference *with
identical scores*, and repeated identical calls can reorder.

> **On 168/170 vs 167/170.** The headline 168 is measured with insertion-order tie-breaking, which
> is what Elasticsearch and the node reference both happened to do. Imposing a deterministic
> `id`/`slug` tie-break costs exactly one query, where the expected target was winning a tie by
> position rather than by score — so this design scores **167/170 as specified**, and 168/170 only
> in the unreproducible ordering. §7's figures use the deterministic tie-break throughout, which is
> why they read 167. Determinism is worth more than the point: without it, identical calls can
> return different pages.

### Phrases

A phrase matches when its terms appear at the query's own relative offsets **within a single
field**. Per field, intersect each term's position array shifted by its offset; OR across fields:

```
$setIntersection over { $map: { input: $_pos.<field>.<stem>, in: { $subtract: ['$$this', delta] } } }
```

non-empty for some field. This rides in the ordinary filter object as an `$expr` clause, so
`countDocuments`, `find()`, the facets pipeline and the sums pipeline all keep working unchanged
— verified: `countDocuments(filter)` agrees exactly with the aggregation (921 = 921), the plan
stays IXSCAN (7,275 keys examined → 921 returned), and sampled matches really do have adjacent
positions. Cost at 50k: 108 ms vs 39 ms for the gate alone.

**Phrase matching is over stemmed tokens**, so `"courbe de charge"` matches "courbes de charges".
Elasticsearch behaves identically. It is not literal string matching.

Phrase support ships in v1 rather than later specifically because the *index* shape is what is
expensive to retrofit: changing `_tf` → `_pos` afterwards would leave a mixed-shape corpus during
the worker drain, forcing the scoring expression to handle both shapes at once.

## 7. Corpus statistics

Counted at query time and memoized with `memoizee` (already a dependency, already used in
`misc/utils`). **No stored statistics, no precomputation, no background rebuild.**

| statistic | source | cost at 200k |
|---|---|---|
| `df(term)` | `countDocuments({ ...ownerScope, _terms: t })` | 2 ms owner-scoped / 63 ms global, per 4-term query |
| `N` | `estimatedDocumentCount()`, or a count when owner-scoped | sub-ms |
| `avgLen(field)` | `$group` with `$avg` over `_len` | 246 ms global — long TTL |

`avgLen` is the only one needing a full pass, so it gets a longer TTL than `df`; it is cheap
whenever the query is owner-scoped.

**Scope follows the query.** When the search is owner-scoped — a portal via `publicationSite`, or
`?owner=` — statistics are counted within that owner. Otherwise they are global. Cache keys carry
the scope. Quality is unaffected either way (measured: 167/170 and MRR 0.990 for all four
combinations of scope × corpus), because BM25 ranking depends on the *relative* idf between a
query's terms, and global counting compresses the contrast without reordering it. The choice is
therefore operational, and owner-scoping wins on cost: 31× cheaper counting, and the corpus it
describes is the corpus actually being searched.

Consequence to accept knowingly: a dataset can rank slightly differently in its portal than in
the back-office, because those are genuinely different corpora.

Staleness is safe by a wide margin — a **10% df error moves idf by under 10%**, far inside the
noise separating 161 from 168.

`StatsProvider` is an injected interface. A deployment that outgrows on-demand counting can
supply a different implementation without touching any call site.

## 8. Integration

### The three `find.ts` seams

`query()`, `facetsQuery()` and `sumsQuery()` (via `basePipeline`) each inject
`{ $text: { $search: q } }`. Each gains **one optional `textFilter` parameter** that replaces that
clause when supplied. Datasets and applications supply it; every other collection keeps `$text`
and is untouched.

Rejected alternative: threading it through the existing `extraFilters` and deleting `q` from the
`reqQuery` copy so `find.ts` does not see it. No signature change, but invisible to the next
reader, and `$text` inside `$and` has its own index-selection quirks.

### The results query

`findUtils.sort()` swaps `_score: { $meta: 'textScore' }` for `_score: -1` plus the tie-break.

The services run an **aggregation only when the score is actually used** — that is, when sorting
by relevance. With an explicit `sort` the score is never read, so the existing `find()` path
stays. `countDocuments`, facets and sums need the filter alone and are unchanged in shape.

```
[ { $match: query },
  { $addFields: { _score: <dis_max expression> } },
  { $sort: { _score: -1, id: 1 } },
  { $skip: skip }, { $limit: size },
  { $project: project } ]
```

with `collation: { locale: 'en' }` preserved from the current `find()` call.

### Response hygiene — required, not optional

`findUtils.project()` with no `select` returns an **exclusion** projection, so any field not
named is returned. `_terms`, `_pos` and `_len` must be added to the exclusion lists at both call
sites — datasets currently excludes `['_modified', '_searchText']`, applications only
`['configuration', 'configurationDraft']` — **and** deleted in the dataset `clean()` alongside
`_needsHistorizing`. Otherwise every list response ships ~6 KB of position arrays per document
and leaks corpus statistics.

### Write path

Two tiers.

**Inline**, for single-document writes that already know their new content: dataset create/patch
and application create/patch. The existing `searchTextPatch` becomes `searchIndexPatch`, returning
`{ _searchText, _terms, _pos, _len, _searchIndex }` from its four existing call sites —
`_searchText` is computed first and fed *in* as one of the indexed fields. Search is fresh
immediately.

**Deferred**, for everything else — bulk updates, upgrade scripts, direct `mongosh` surgery.
These mark and walk away:

```ts
textSearch.markStale(collection, filter)   // updateMany($set: { _needsSearchIndex: true })
```

`identities/service.ts` `renameIdentity` is the first caller: it bulk-`$set`s `owner.name` across
collections, which staleifies every owner-name token. It already iterates a cursor per collection
for permissions, so marking joins that loop.

This inverts the obligation. Writers declare staleness; reconciliation is the util's job. The
current `_searchText` invariant comment — which already documents two writers that leave it stale
— is promoted to cover the index fields as a whole.

**`markStale` is the documented contract**, and it is the one thing the design cannot enforce: a
direct database write by someone who does not call it goes undetected. There is no cheap detector
(a hash check costs the same read as recomputing), so the mitigations are the contract plus an
admin-triggerable full re-index using the same flag.

### The worker

A `computeSearchIndex` task, mirroring `_needsHistorizing` exactly: sparse-indexed flag, and
`mongoFilter: () => ({ _needsSearchIndex: true })`. Deliberately a single sparse-indexable
predicate rather than `$or`-ing in a version check, because an `$or` against a sparse index
selects badly.

Three small edits to machinery that already anticipates a second resource type
(`tasks.datasets` is already keyed by type, and the loop is already parameterised):

- `workers/tasks.ts`: `export const tasks = { datasets: datasetTasks, applications: applicationTasks }`
- `workers/index.ts`: `for (const type of ['datasets', 'applications'])`, and `tasks[type]` in `getFreeTasks()`
- `workers/short-processor/index.ts`: a `computeSearchIndex` export

No `eventsPrefix`, so no journal entries — this is bookkeeping, not user-visible activity.
Locking, fair allocation by owner, metrics and error handling all come from the existing loop.

Accepted characteristics: a marked document is stale until the worker reaches it (harmless for a
rename), and the loop processes one resource per iteration, so a rename across a large
organisation is many lock/recompute cycles. Renames are rare; batching would break the lock
discipline and is a follow-up if it ever bites.

## 9. Migration

**Index creation** via `mongo.ts` `configure()`, which runs at startup before the backfill.

**Backfill runs inline in an upgrade script, not lazily.** A document without `_terms` is
invisible to search, so marking everything stale and letting the worker drain would leave search
substantially broken for the whole drain. Upgrade scripts run before the HTTP server accepts
traffic, so an inline backfill guarantees correctness from the first request.

`api/upgrade/6.20.0/02-backfill-search-index.ts` — the numeric prefix orders it after the
existing `backfill-search-text.ts` in the same folder. Folder `6.20.0` is the last released
version, which is `package.json`'s current value.

```
mark   updateMany({ '_searchIndex.v': { $ne: V } }, { $set: { _needsSearchIndex: true } })
drain  cursor over { _needsSearchIndex: true } → bulkWrite in batches:
       set _terms/_pos/_len + _searchIndex {v, at}, unset the flag
```

Idempotent and crash-safe: re-running is a no-op once everything is stamped, and a partial run
leaves the flag set so both a re-run and the worker finish the remainder. Cost is proportional to
corpus size — seconds for thousands of datasets, minutes for hundreds of thousands. Say so in the
release notes rather than surprising an operator with a long first start.

**The `fulltext` text index is NOT dropped in this release.** During a rolling deploy, old pods
still issue `$text` queries, and dropping the index under them makes those queries error. Since
`configure` drops an index only when it is declared `null` and leaves undeclared indexes alone,
keeping the declaration is the safe default. A follow-up release sets `fulltext: null`. The
redundant index costs write time and disk in the interim.

**Definition versioning.** `version` is hand-bumped when fields, weights, language or the
analyzer change. The accompanying upgrade script is then a single
`markStale(collection, { '_searchIndex.v': { $ne: V } })` and the worker drains it — so "we
improved the French stemmer" is a one-line migration rather than a bespoke backfill.

## 10. Testing

Unit tests carry the real coverage, per the house rule that pure logic is the unit-test surface:

- **analysis** — stemming, elision, stopwords, and raw positions surviving stopword removal
- **indexing** — dotted paths traversing arrays (`topics.title`), the no-`.`/no-`$` key assertion,
  `null` for a document with no indexable content
- **query** — `df = 0` dropping, gate selection, the `K ≥ 2` floor, negation split, phrase
  extraction with offsets, `null` when no positive term survives
- **pipeline** — filter shape, score expression shape, phrase `$expr` shape, sort spec

Five API tests matter most, each covering a failure that is otherwise **silent**:

1. **An all-unknown query returns nothing, not everything.** The catastrophic one.
2. **`_terms`/`_pos`/`_len` never appear in a response** — both collections, with and without
   `select`.
3. **A renamed owner becomes searchable under the new name** once the worker drains — the only
   coverage of the deferred path.
4. **`count` agrees with the results length**, including for a phrase query.
5. **Tied scores return a stable order** across repeated identical calls.

Plus updates to the existing `tests/features/datasets/catalog-search.api.spec.ts`, and to the
fixtures encoding the `nanoid`-leading-dash pitfall.

## 11. Rejected alternatives

| rejected | why |
|---|---|
| Elasticsearch | Its apparent +7 hit@1 was a scoring-shape difference, not an engine one; told to sum fields it scores *below* this design. Would cost a sync pipeline, a permission-token scheme, an availability dependency on the catalog read path and a recipe no ES-less deployment can reuse. |
| A Rust napi module | A worker thread over transferred raw BSON is the same boundary shape and measures the ceiling: Rust could only speed work already off the critical path, and cannot touch the residual block, which is the driver materialising Buffers *upstream* of the boundary. No usable tantivy binding exists on npm; a native module on a core read path would need a JS fallback beside it — two BM25 implementations obliged to agree. |
| In-process engines (Orama, MiniSearch) | 897 MB / 347 MB of node heap at 50k documents, **per tenant**, plus a rebuild on every write. Fine for a single-tenant portal, wrong for a shared API process. |
| A sibling index collection | Destroys the core advantage — the permission filter composing into the same `$match`. |
| Capping `countDocuments` to bound df cost | Bounds cost to O(cap) independent of N (50 ms → 4 ms), but undercounting df *over*-weights common terms: `consomm`/`electr`/`annuel`/`commun` all collapse to idf 4.60 when their true values are 1.00–1.93. Destroys exactly the discrimination being built. |
| Precomputed df table | Small (tens of KB) and cheap to build (4 s at 200k), but unnecessary: owner-scoped counting is 2 ms, and `StatsProvider` is an injected interface if a deployment ever needs it. |
| Bigrams for phrase search | +116% storage against positions' +62%, inexact beyond two words, and cannot distinguish "courbe de charge" from "courbe et charge" once stopwords are stripped. |
| `@orama/stemmers` | 3.9 MB for *worse* ranking than a hand-written light stemmer. |

## 12. Deferred: search-as-you-type (`q_mode=complete`)

Evaluated and **deliberately deferred**, with the costs measured so they need not be re-derived.
Deferred rather than dropped: the equivalent already exists for dataset lines
(`api/src/datasets/es/operations.ts`, `qMode === 'complete'`), so the catalog is the odd one out.

### It is viable, but only owner-scoped

Measured on 200k datasets across 200 tenants of 1,000:

| | owner-scoped tenant | global |
|---|---|---|
| prefix gate (`{ _terms: { $gte: p, $lt: p⁺ } }`) | 10–12 ms | 2,712–4,244 ms |
| gate + prefix ranking | **68–76 ms** | **13,363 ms** |

A prefix like `cons` matches a term in *every* document, so globally the gate degenerates to the
whole collection. **`q_mode=complete` must therefore require an owner scope and refuse otherwise.**
That is a correctness and denial-of-service constraint, not a tuning preference: a 13-second
unauthenticated query is an availability vector.

### What it would need

1. **Raw unstemmed forms in `_terms`, beside the stems.** A prefix does not prefix-match a stem —
   `chevau` vs `cheval` — and typing past the stem breaks it too. This is exactly why the ES path
   runs its prefix clause on `.text_standard` rather than the stemmed field, with the comment
   "language stemming doesn't work well in this case". Cost: **+1,663 B/doc (+83% on `_terms`)**,
   68% more terms, taking index fields from ~6 KB to ~7.7 KB — about +170 MB at 100k datasets.
2. **A prefix term-frequency in the scorer**: `$objectToArray` over the per-field term map, then
   `$filter` on the key prefix, summing `$size` of the matching position arrays. No vocabulary
   needed. This is what the 68–76 ms above measures.
3. **The owner-scope guard**, and ~60–80 lines of planner and expression code.

### Why a vocabulary is not an option

`distinct('_terms', { _terms: <range> })` cannot enumerate index keys in a range: a range filter
on a multikey array selects *documents*, so it returns every element of every matching document's
array. Measured: **11–12 s**, 5.9M keys and all 200,000 documents examined, returning all 205,130
distinct terms to find the 36 in range. Prefix expansion is therefore off the table without a
separately maintained vocabulary collection, which this design deliberately avoids.

### Why this is safe to defer, when phrases were not

The distinction is **additive versus replacement**, and it is the whole reason these two features
are treated differently.

Positions had to ship in v1 because `_tf` → `_pos` *replaces* a field: during the worker drain the
corpus is mixed-shape, and the scoring expression would have to read both shapes at once.

Raw forms are *additive*. The scorer never reads them, so a document that lacks them still ranks
correctly under normal search and merely fails to prefix-match. Adding them later is a `version`
bump plus `markStale` — machinery this design already provides — and the degradation during the
drain is partial typeahead, not broken search.

So the storage is not pre-paid for a feature that may never ship, and nothing is lost by waiting.
