# ES query optimization — investigation backlog

Follow-up work that builds on the evaluation harness (see
`docs/superpowers/specs/2026-05-22-es-query-evaluation-harness-design.md`). Each item
below is a self-contained investigation: run the named experiment on a large seeded
dataset, read the A/B comparison, and write the finding where indicated.

The goal throughout is **guardrails that protect the infrastructure and quality of
service while keeping queries as powerful and as API-compatible as possible** — not
restricting consumers more than the evidence justifies.

> Status: the harness ships executable *definitions* for experiments 2–4. Running them
> at scale and recording the findings is the work tracked here. Experiment 5 is a code
> audit, not a harness run.

## Prerequisites

```sh
npm run test-deps        # mongo, elasticsearch, simple-directory, …
npm run dev-benchmark    # API server + worker, benchmark config
npm run benchmark -- seed --preset=tall        # ~2M rows, slow one-time seed
npm run benchmark -- seed --preset=wide-text   # ~40 string columns
```

---

## 2. Cost of unbounded `track_total_hits` & block-max-WAND

Reference: [Faster retrieval of top hits in Elasticsearch with block-max
WAND](https://www.elastic.co/blog/faster-retrieval-of-top-hits-in-elasticsearch-with-block-max-wand).

**Background.** On page 1 data-fair sets `track_total_hits: true` — an *exact* hit count
(`commons.js → prepareQuery`). Lucene's block-max-WAND optimization speeds up retrieval
of the top-k *scoring* hits: it records a max impact score per block of postings and
skips blocks that cannot beat the current top-k threshold (term queries, disjunctions
and conjunctions saw 3–15× speedups in the Elastic benchmark). The catch — an **exact**
count requires collecting *every* match, which **disables** the skipping:

- `track_total_hits: true` — forfeits block-max-WAND (visits all matches).
- `track_total_hits: <n>` — counts exactly up to `n`, then returns a `gte` lower bound
  and lets WAND resume. "The lower the value, the faster the query."
- `track_total_hits: false` — full optimization.
- Aggregations also disable WAND — they must visit all matches regardless.

**Consequence for data-fair.** Every page-1 request with a `q` parameter is a scoring
`simple_query_string`, so `track_total_hits: true` makes it forfeit block-max-WAND on
exactly the largest, most expensive datasets.

**Hypothesis.** Capping `track_total_hits` (to a number, or `false`) restores a large
speedup — comparable to the 3–15× in the Elastic benchmark — for scoring queries
(`simple_query_string`, disjunctions, conjunctions), and little or nothing for
filter-only queries (WAND never applied) or requests with aggregations (all matches
visited regardless).

**Run.**
```sh
npm run benchmark -- seed --preset=tall --rows=5000000
npm run benchmark -- experiment --name=track-total-hits --profile
npm run benchmark -- experiment --name=track-total-hits --cold   # cold-cache picture
```

**Look for.** Per query shape, the Δ% on `took` between `track_total_hits: true` and the
`10000` / `100000` / `false` variants. Expect a large Δ for the scoring shapes
(disjunction, conjunction, scored `term`) and a small one for the filter-only shape. The
queries run with `size: 20` so top-k retrieval actually happens — WAND has nothing to
skip at `size: 0`. Confirm `hits.total.relation` flips to `gte` once the cap is
exceeded, while the top-20 hit ids stay identical to the baseline (same results, cheaper).
Check the `_profile` summary and compare warm vs. `--cold`.

**Decision & where it lands.** If the hypothesis holds, cap `track_total_hits` for
scoring requests (those with `q`) — the UI already handles estimated `gte` totals via
`count=estimate`. Filter-only requests can keep the exact count (cheap, and no WAND to
lose). Record numbers + recommendation in `docs/architecture/load-management.md` §6/§9;
a behaviour change gets its own spec.

## 3. Validate the `_search` catch-all optimization

**Background.** Commit `0bc454fb4` added a `_search` catch-all field for wide datasets:
on a schema with many text columns, `q` targets the constant-size pair
`['_search', '_search.text_standard']` instead of a `fields` array that grows linearly
with schema width (`load-management.md` §6, "Wide-dataset `q` catch-all").

**Hypothesis.** Querying the constant-size `_search` pair is materially cheaper than
querying ~40 per-column analyzed fields, and the gap widens with schema width.

**Run.**
```sh
npm run benchmark -- seed --preset=wide-text
npm run benchmark -- experiment --name=search-catchall --profile
```

**Look for.** Δ% on `took` between the wide per-column `fields` array and the `_search`
pair (same index — both field sets exist in the mapping). The `_profile` summary should
show the per-column variant spending more time in query rewrite / more leaf query nodes.
Confirm `hits.total` matches closely (the two should be near-equivalent in recall).

**Where it lands.** Confirmation (or correction) of the released optimization's effect,
recorded in `load-management.md` §6.

## 4. `minimum_should_match` on `simple_query_string`

**Background.** A `q` full-text search becomes a `simple_query_string` whose terms are
all optional (`OR`) — ES's default is that 1 term must match. Adding a
`minimum_should_match` makes ES require more terms, which lets it skip documents that
match too few — potentially simplifying some heavy queries — *if* the threshold is small
enough not to change results for typical queries.

**Hypothesis.** Requiring a few more terms speeds up multi-term `q` queries on wide
datasets, with the result set drifting further as the threshold rises — so there may be
a low threshold that gives a worthwhile speedup with acceptable divergence.

**Run.**
```sh
npm run benchmark -- experiment --name=min-should-match --profile
```

**Look for.** The experiment uses a fixed 5-term `q`; the variants set absolute
`minimum_should_match` thresholds (`"2"`, `"3"`, `"4"`, `"5"`) so each is a distinct,
unambiguous required-term count (the ES default is 1 of 5). For each: Δ% on `took`
**and** the result-divergence flag — how far `hits.total` and the top-N hit ids move
from the baseline. The useful threshold is the one with a real speedup and minimal
divergence.

**Decision & where it lands.** A data-fair default would be expressed as a *percentage*
(it must work for queries of any length); translate the best absolute threshold from
this 5-term experiment into a percentage. If a small percentage gives a worthwhile
speedup with acceptable divergence, propose it as a default in `prepareQuery`; otherwise
document why not. Record in `load-management.md` §6.

## 5. Audit & document unbounded-complexity requests

**Background.** Not a harness run — a code audit. `load-management.md` §6/§9 already
names several read paths with effectively unbounded ES work.

**Checklist (expand into `load-management.md` updates).**

- [ ] `search.ts` / agg calls — **no `terminate_after`**: a single query can scan an
      unbounded number of docs per shard.
- [ ] `values-agg.js` — combined fan-out `Π agg_size × size` only **logs a warning** at
      100,000; a `400` is thrown only *after* ES returns >10,000 buckets. It does not
      block before execution.
- [ ] Deep offset pagination — bounded by `from + size ≤ maxPageSize` (10,000), but
      still scans up to that depth.
- [ ] Exact `track_total_hits` on page 1 of very large datasets (→ investigation 2).
- [ ] Streaming export paths (`/full`, ODS `/exports`, `master-data/bulk-searchs`) — not
      wired for disconnect-abort and bill 0 against the compute budget.
- [ ] No `index.search.slowlog` — no ES-side signal for which dataset is being hammered.

**Where it lands.** A consolidated "unbounded-complexity requests" section in
`docs/architecture/load-management.md`, each item with the harness evidence (where one
of investigations 2–4 produced it) and a proposed bound.

---

## Recording results

Harness runs save JSON to `benchmark/results/` tagged with the git commit. When an
investigation reaches a conclusion, summarise the numbers in
`docs/architecture/load-management.md` and, if it implies a behaviour change, open a
dedicated spec under `docs/superpowers/specs/`.
