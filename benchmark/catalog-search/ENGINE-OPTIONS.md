# Catalog search: what to do about the missing IDF (2026-09-17)

Companion to [FINDINGS.md](./FINDINGS.md) (content levers) and
[ES-EVALUATION.md](./ES-EVALUATION.md) (the first, shallower ES look). This one answers a
different question: **MongoDB `$text` has no inverse document frequency at all — what are the real
options, and what does each actually buy?**

Scripts are throwaway and lived outside the repo; every number below is reproducible from the
method described in each section.

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
with BM25F in node.**

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
pass measured in milliseconds. At 50k documents a common query returns ~13.8k candidates, so
scoring must either cap candidates or run as an aggregation rather than in node.

**Rung 2.5 is the cheap intermediate** if that is too much to own at once: it changes no index and
no document, only the sort, and already delivers 160/170. It is a strictly smaller step that can
ship first and be replaced by rung 4 later without either being wasted.

**Elasticsearch remains the ceiling and remains unjustified** on quality alone — +7 hit@1 over
rung 4, paid for with a sync pipeline, a permission-token scheme, an availability dependency on
the catalog read path, and a recipe no ES-less deployment can reuse. The case for it is
multi-resource centralized search (datasets + applications + pages), which is a different feature,
not this one.
