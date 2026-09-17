# Catalog search: what to do about the missing IDF (2026-09-17)

Companion to [FINDINGS.md](./FINDINGS.md) (content levers) and
[ES-EVALUATION.md](./ES-EVALUATION.md) (the first, shallower ES look). This one answers a
different question: **MongoDB `$text` has no inverse document frequency at all — what are the real
options, and what does each actually buy?**

Every number below is reproducible from the scripts committed beside this document. They need a
stemmer that is deliberately not a data-fair dependency:

```sh
npm i --no-save @orama/stemmers
node benchmark/catalog-search/gen-hard-queries.mjs                      # the 170-query set
node benchmark/catalog-search/retrieval-safety.mjs                      # which candidates to retrieve
node benchmark/catalog-search/text-query-levers.mjs      <mongo-url>    # why $text cannot be fixed at query time
node benchmark/catalog-search/scale-fixtures.mjs         <mongo-url>    # builds ss_10000 / ss_50000 / ss_200000
node benchmark/catalog-search/scoring-placement.mjs      <mongo-url>    # where the scoring should run
```

`<mongo-url>` must be a scratch database, never the data-fair one.

## The headline

**Recall was never the problem. Ranking is.** On every variant tested, including production
today, `hit@5` is **170/170** — the right dataset is always in the top five. The entire quality
gap is *ordering within the candidate set*. That reframes the decision: this does not require a
different search engine, it requires a different sort.

## Method, and a correction to the earlier one

The 56 hand-written queries in FINDINGS.md **had saturated**: against the content this branch now
indexes (`searchTerms` + `_searchText`), production already scores 50/56 hit@1 / 0.918 MRR, so
the set could not discriminate between engines at all. Every option looked the same or worse.

So the queries were regenerated mechanically, with no hand-picking:

- for each of the 433 datasets in the three real catalogs, form the query a person would type from
  its title (stopwords dropped);
- keep it only if it contains **at least one generic term** — present in ≥8% of that catalog's
  titles — so the engine must discriminate rather than merely match;
- and only if exactly one dataset has that term set, so the target is unambiguous.

**170 queries.** Enedis contributes 91 of them, averaging 3.9 generic terms per query with the
commonest term in 30% of titles (`charge` appears in 44% of its titles, `courbe`/`fictive`/
`expérimentale` in 39%) — near-duplicate titles where a single token such as `naf8790` vs
`naf8413` carries all the signal. That is precisely the class an IDF-less scorer mis-ranks.

## Results

433 datasets, 170 queries, same content fed to every engine (title, searchTerms, summary,
description, keywords, topics, `_searchText`) with the same production weights (title ×3,
searchTerms ×3, summary ×2).

| # | option | hit@1 | MRR | p50 query | notes |
|---|---|---|---|---|---|
| 1 | **MongoDB `$text`, french — shipped today** | 140/170 | 0.912 | 1.1 ms | TF × field weight × length norm, no IDF |
| 2 | + query-time df stripping (>30% terms dropped) | 145/170 | 0.921 | 2.0 ms | cheap, modest |
| 3 | + index-time IDF simulation (rare terms repeated in a hidden field) | 154/170 | 0.953 | 1.2 ms | needs recompute as the corpus shifts |
| 2.5 | **`$text` for candidates + BM25F re-rank in node** | 160/170 | 0.970 | 1.3 ms | no index change at all |
| 4 | **node tokenisation + plain multikey index + BM25F in node** | **161/170** | **0.974** | 3.0 ms | no `$text` at all; 0.5 MB index /433 docs |
| — | MiniSearch 7.2 in-process | 158/170 | 0.964 | 0.1 ms | |
| — | Orama 3.1 in-process | 162/170 | 0.975 | 0.2 ms | BM25 + stemmers for 30 languages |
| 5 | **Elasticsearch** (data-fair's own french analyzer) | **168/170** | **0.994** | 3.9 ms | the ceiling |

Read it as three tiers, not a ladder: **no-IDF (140)**, **IDF by any means (154–162)**, **ES (168)**.
Everything that computes a real IDF lands within a few points of everything else that does. The
choice between them is therefore an *operational* one, not a quality one.

## Why there is no query-time fix

The cheapest imaginable repair would leave the index alone and boost the query's rare terms at
search time. It is not available, and it is worth recording exactly why, because the three things
one would try fail for three different reasons (`text-query-levers.mjs`):

| attempt | result |
|---|---|
| repeat the rare term: `commune` vs `commune commune commune` | identical scores — **query terms are deduplicated** |
| score terms separately: `$and` / `$or` of two `$text` expressions | `ERROR: Too many text expressions` — **one `$text` per query** |
| correct the score afterwards from `$meta: 'textScore'` | a single opaque scalar — **no per-term breakdown** |

`weights` are per-**field** and frozen at index creation; never per-term, never per-query. So the
only query-time lever on a plain `$text` index is *which terms you include* — dropping generic
ones, which is rung 2 and worth +5 hit@1. Negation (`-term`) and quoted phrases change the match
set, not the weighting.

The useful way to hold this: **repetition counts on the document side, not the query side.** That
is exactly why rung 3 works — repeating rare terms into a hidden field inflates their `tf` per
document and reaches 154/170 — while the mirror-image trick at query time does nothing at all.
Query-time you can only *delete* common terms, a binary approximation of boosting rather than a
graded one, which is why it recovers 5 points of a 28-point gap.

## The operational differences, which is where the decision actually lives

| | rung 2.5 re-rank | rung 4 own index | in-process (Orama/MiniSearch) | Elasticsearch |
|---|---|---|---|---|
| IDF | yes | yes | yes | yes |
| Per-document language | no (one `$text` analyzer) | **yes** — you pick the stemmer per doc in node | one analyzer per index | per-field analyzers |
| Permission filter | native (same `$text` query) | **native** — compound `{owner, _terms}` index, IXSCAN verified | must re-filter after retrieval | needs `_listProfiles` tokens + mongo hydration |
| Sync surface | none | the index IS the document | rebuild per tenant on every write | ~14 write sites + reconciliation |
| Extra infrastructure | none | none | none | ES cluster on the read path |
| Reusable in services with no ES | yes | yes | yes | no |
| Memory | server | 69 MB index @ 50k docs (server) | **897 MB Orama / 347 MB MiniSearch @ 50k — in node heap, per tenant** | server |
| Degrades if the engine is down | n/a | n/a | n/a | catalog search unavailable |

### The multi-language finding

MongoDB **does** support a per-document `language` field, verified directly: a doc marked
`french` is found by a french-stemmed query, an `english` one by `$language: 'english'`. But **the
query carries one language**, so a french query never reaches english-stemmed documents. A mixed
catalog on `$text` therefore needs one query per language and a merge.

Rung 4 removes this constraint entirely: tokenisation and stemming happen in node, so each
document is stemmed in *its own* language at write time, and the query can be expanded into
whatever languages the catalog contains — because `$in` over a term array has no analyzer.

### The in-process trap

Orama and MiniSearch score well and answer in microseconds, and they need no extra service — which
is genuinely attractive. But the index lives in the node heap, and data-fair is multi-tenant: that
897 MB (Orama) or 347 MB (MiniSearch) at 50k documents is **per catalog held in memory**, plus a
rebuild on every write. They are an excellent fit for a single-tenant portal and a poor one for a
shared API process. (Measured on a synthetic corpus with low term diversity, so those figures are
optimistic.)

## Recommendation

**Rung 4 — tokenise in node, store a term array, index it as an ordinary multikey index, score
with BM25F.** (Where that scoring runs is settled further down, and the answer is *not* in node:
generating the BM25F expression into the aggregation costs 1–2 ms of API CPU instead of ~190 ms.)

It reaches 161/170 against ES's 168, i.e. it closes about three quarters of the gap between today
and the ceiling, and it is the only option that simultaneously:

- computes a real IDF;
- makes the catalog **multi-language per document**, which `$text` cannot be;
- lets the existing permission filter compose **into the same query** (verified IXSCAN on a
  compound index) — no second retrieval phase, no permission tokens to keep in sync, and therefore
  none of the leak surface the ES design had to engineer around;
- adds no infrastructure, so the recipe is reusable by any data-fair service that has MongoDB;
- keeps the index small and server-side (0.5 MB per 433 documents; 69 MB at 50k).

Cost to be honest about: it is a real inverted index that we own — term extraction, stats
maintenance and scoring become our code, and corpus statistics (`df`, average field lengths) have
to be recomputed as the catalog changes, though for catalogs of this size that is a periodic full
pass measured in milliseconds.

**Rung 2.5 is the cheap intermediate** if that is too much to own at once: it changes no index and
no document, only the sort, and already delivers 160/170. It is a strictly smaller step that can
ship first and be replaced by rung 4 later without either being wasted.

**Elasticsearch remains the ceiling and remains unjustified** on quality alone — +7 hit@1 over
rung 4, paid for with a sync pipeline, a permission-token scheme, an availability dependency on
the catalog read path, and a recipe no ES-less deployment can reuse. The case for it is
multi-resource centralized search (datasets + applications + pages), which is a different feature,
not this one.

Two questions this recommendation leaves open — which documents become candidates, and where the
scoring runs — turned out to matter more than the choice of rung. One of them hides a trap that
silently empties the result page. Both are settled below.

---

# Making rung 4 real: what to retrieve, and where to score it

Rung 4 must score every **candidate** to know the top N, so two questions decide whether it is
shippable: which documents become candidates, and where the scoring runs. Both turned out to
matter more than the choice of rung, and the first one hides a trap.

## Retrieval: the rarest-term trap

Narrowing candidates to the query's single rarest term is ~4× faster and, on the 170 hard queries,
costs **nothing** — 161/170 hit@1, identical to retrieving on an OR of every term, with median
candidates falling from 82 to 4. It is also unshippable, and the query set structurally cannot
show why: those queries are built *from* each target's title, so the target always contains every
term, including the rarest. Rarest-term-only is therefore a hidden **AND** on that one term.

`retrieval-safety.mjs` injects the thing real queries have and generated ones do not — one word
the target does not contain:

| candidate policy | as generated | + a typo (word absent from the corpus) | + a rare REAL word the target lacks |
|---|---|---|---|
| OR all terms (`$in`) | 161/170, 0 lost | 161/170, **0 lost** | 161/170, **0 lost** |
| rarest term only | 161/170, 0 lost | 0/170, **170 lost** | 17/170, **153 lost** |
| rarest 2 terms | 161/170, 0 lost | 161/170, **0 lost** | 161/170, **0 lost** |
| rarest 3 terms | 161/170, 0 lost | 161/170, **0 lost** | 161/170, **0 lost** |

**One mistyped word and rarest-term-only returns an empty page** — not a degraded ranking, nothing
at all — because an unknown term is by definition the rarest and becomes the gate. Two independent
fixes are needed, because they cover different cases:

- **drop query terms with `df = 0`.** They cannot match or contribute to any score, and removing
  them stops a typo from ever becoming the gate. This fixes the typo column at its root.
- **gate on the rarest K terms, K ≥ 2.** This covers what the `df` filter cannot: a rare *real*
  word that the target happens not to use. K must exceed the number of noise terms tolerated,
  since noise sorts to the rare end by construction.

Quality is flat across every safe policy, so K is purely a cost knob — and as the next section
shows, for the recommended placement it is not even that.

## Where the scoring runs

Three placements, measured by `scoring-placement.mjs` on synthetic catalogs of 10k–200k documents.
Real catalogs are hundreds of datasets; these scales exist to find the breaking point, and to test
the recipe for other entity types that could reuse it at tens of thousands.

Three metrics that answer different questions and do not agree:

- **wall** — what the user waits for.
- **process CPU** — what the API pod costs. The throughput bill, and the scarce resource on a busy
  server.
- **block** — the longest *contiguous* synchronous main-thread run. The latency blast radius: how
  long every other request is frozen out.

CPU and block must not be conflated. At 200k the node-scoring variant burns ~188 ms of CPU but
blocks for only ~21 ms, because the MongoDB driver deserialises incrementally and yields between
batches.

### First, where the node-side cost actually is

At 200k documents, 29,102 candidates, 8.2 MB of raw BSON (297 B/doc):

| stage | wall | node CPU |
|---|---|---|
| raw buffers, never decoded (driver + socket floor) | 172 ms | 74 ms |
| + BSON → V8 materialisation + BM25F scoring | 276 ms | 221 ms |

The floor is unavoidable. Of the ~147 ms above it, **materialisation is ~126 ms and the arithmetic
only ~21 ms.** This is the single most decision-relevant number here: "make the maths faster"
attacks the smaller half.

### The three placements

| docs | placement | wall | process CPU | block |
|---|---|---|---|---|
| 10,000 | B node scores (the shipped shape) | 17 ms | 10 ms | 2 ms |
| | **D mongo scores in the aggregation** | 20 ms | **2 ms** | **0 ms** |
| | E worker thread over raw BSON | 16 ms | 26 ms | 0 ms |
| 50,000 | B | 57 ms | 39 ms | 4 ms |
| | **D** | 89 ms | **1 ms** | **0 ms** |
| | E | 62 ms | 51 ms | 1 ms |
| 200,000 | B | 244 ms | 188 ms | 21 ms |
| | **D** | 352 ms | **2 ms** | **0 ms** |
| | E | 242 ms | 147 ms | 4 ms |

(E's process CPU includes its worker thread; its main-thread cost is the block column.)

### The safe gate changes B's bill and not D's

| docs | gate | candidates | B wall / CPU / block | D wall / CPU / block |
|---|---|---|---|---|
| 50,000 | rarest 1 *(unsafe)* | 7,275 | 62 / 32 / 9 ms | 92 / 2 / 0 ms |
| | **rarest 2** | 15,582 | 121 / 89 / 13 ms | 186 / **1** / 0 ms |
| | rarest 3 | 19,159 | 163 / 121 / 14 ms | 230 / **1** / 0 ms |
| | all terms (OR) | 30,505 | 274 / 186 / 23 ms | 366 / **2** / 0 ms |
| 200,000 | rarest 1 *(unsafe)* | 29,102 | 255 / 187 / 21 ms | 359 / **1** / 0 ms |
| | **rarest 2** | 62,360 | 523 / 382 / 41 ms | 734 / **1** / 0 ms |
| | rarest 3 | 76,670 | 647 / 470 / 51 ms | 908 / **5** / 0 ms |
| | all terms (OR) | 121,946 | 1028 / 737 / 74 ms | 1451 / **2** / 0 ms |

**D's node cost is essentially independent of the candidate count**, because node only ever
receives the page. Widening the gate for safety roughly doubles B's bill and leaves D's untouched.
D trades ~1.5–2× wall time for ~20–40× less API-process CPU, at every scale and every gate size —
and it moves that work to mongod, which on a shared replica set is a real trade-off to weigh, even
though at the scale that actually exists it is 20 ms of wall and 2 ms of CPU.

## Was a Rust native module worth evaluating?

Yes — data-fair already ships one (`parquet-writer`, napi 3, built by a dedicated Dockerfile stage
and by CI), so the instinct to reach for it is sound. The answer is still no, on four grounds.

**Variant E is the Rust plan, in JavaScript.** It has deliberately the same boundary shape a napi
module would use: raw BSON in as one transferred `ArrayBuffer` (zero copy, no structured clone, no
V8 materialisation on the main thread), top-N ids out. Its numbers are therefore the *ceiling* of
the Rust option. Rust would improve only the decode-and-score work inside the worker — which E has
already moved off the critical path — and could not touch E's residual block, because that is the
driver materialising Buffers *upstream* of the boundary. Removing that would mean Rust owning the
cursor and its own connection pool, a different and much larger proposition.

**D already solves the stated problem, for free.** The concern was CPU on a busy API server. D
costs 1–2 ms of node CPU and zero block at every scale measured, with no new language, no new
dependency and no second code path.

**There is no tantivy to reach for.** On npm, `tantivy` is a 19 KB placeholder, `@strangerlabs/
tantivy` is 4.6 KB last touched in 2022, and the two GitHub bindings were never published. Using
tantivy means authoring and maintaining our own napi binding. Architecturally it is also embedded
ES: a second index with all the sync burden, and unlike ES it is *per-pod*, so every API replica
needs its own copy.

**A native module on a core read path needs a JS fallback anyway.** `parquet-writer` gets away
with being linux-x64/musl-only because a lazy `await import()` reaches it from a single ODS export
path. Catalog search runs on every request, so a Rust scorer would need a JS scorer beside it for
dev machines and non-linux builds — two BM25F implementations obliged to agree, which is how
ranking silently diverges. The existing bindings are also all synchronous (`#[napi]`, no
`AsyncTask`), so this would be the first one needing off-thread execution.

Worth weighing against the repo's own precedent: the flag-gated Rust layer for the `/lines` read
hotpath came out **~2.3× slower than JS**, because it crossed the boundary with document-shaped
data and `serde_json::Value` could not beat V8. An index-owning module would have had a genuinely
small boundary and been a different bet. The measurement simply says the cheap option gets there
first.

## The resulting shape

**Index time (node, on dataset write).** Tokenise and stem each indexed field in *that dataset's
own* language; store `_terms` (unique stems), `_tf` (per-field term → count) and `_len` (per-field
token count). Multikey index on `_terms`, compound with the owner/permission key so the `$match`
is a single IXSCAN.

**Background, periodic.** Corpus statistics per owner: `df` per term, `N`, and average length per
field.

**Query time (node, sub-millisecond).** Tokenise and stem the query with the same function →
**drop terms with `df = 0`** → look up `df` and compute the `idf` constants → pick the gate
(rarest K, **K ≥ 2**) → generate the pipeline with the idf constants baked in as literals.

**Query time (mongo).** `$match {permission, _terms: {$in: gate}}` → `$addFields` BM25F →
`$sort` → `$skip` / `$limit` → `$project`. Node receives only the page.

Two things to size when building it: the generated pipeline grows as terms × fields (4 × 7 = 28
`$let` blocks for the query benchmarked here), so cap the query's term count; and `$sort` on a
computed field is an in-memory sort, so it needs `allowDiskUse` and a candidate ceiling.
