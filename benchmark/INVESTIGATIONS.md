# ES query optimization — investigation backlog

Follow-up work that builds on the evaluation harness (see
`docs/superpowers/specs/2026-05-22-es-query-evaluation-harness-design.md`). Each item
below is a self-contained investigation: run the named experiment on a large seeded
dataset, read the A/B comparison, and write the finding where indicated.

The goal throughout is **guardrails that protect the infrastructure and quality of
service while keeping queries as powerful and as API-compatible as possible** — not
restricting consumers more than the evidence justifies.

> Status: investigations 2–5 ran on 2026-05-22 (commit `f0c210acc`) — see the **Outcome**
> note under each. Findings are recorded in `docs/architecture/load-management.md` (§6 and
> the new §9 "Unbounded-complexity read paths"); raw harness results are under
> `benchmark/results/`. The only follow-up still open is a dedicated spec for the
> `track_total_hits` cap (investigation 2) — the one finding that implies a behaviour change.

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

**Outcome (2026-05-22, commit `f0c210acc`).** Confirmed — with one correction. On `bench-tall`
(2M rows) capping `track_total_hits` to `10000` cut a heavy scoring disjunction's `took` ~38 %
(warm + cold) and ~2× its profile query time; high-cardinality term/filter predicates collapsed
from ~15–27 ms to <1 ms of profile time; a low-cardinality conjunction (~5k matches) was
unaffected. `cap-100k` did not help the heavy queries — `10000` is the useful cap. The premise
that *filter-only* is unaffected did **not** hold: exact counting forces a full match enumeration
even without scoring. Recorded in `load-management.md` §6/§9. The cap is a behaviour change and
still needs its own spec before implementation. Raw results:
`benchmark/results/experiment-2026-05-22T14-44-43-724Z.json` (warm),
`experiment-2026-05-22T14-45-25-052Z.json` (cold).

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

**Outcome (2026-05-22, commit `f0c210acc`).** Confirmed decisively. On `bench-wide-text` (300k
rows, 40 text columns) a `q` over the 80 per-column analyzed fields took ~384 ms (`took` p50;
profile ~968 ms) vs ~5 ms (profile ~61 ms) over the `_search` pair — **~77× cheaper**. Top-k
ranking differs (merged term statistics) but recall is comparable. Recorded in
`load-management.md` §6. Raw result:
`benchmark/results/experiment-2026-05-22T14-46-19-391Z.json`.

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

**Outcome (2026-05-22, commit `f0c210acc`).** Hypothesis **refuted** — no default
`minimum_should_match` should be added. On `bench-wide-text` adding `minimum_should_match` to a
5-term `q` made it 1.3–2.5× *slower* (none 15.5 ms → msm-2/3/4 ~37–39 ms → msm-5 20 ms) with no
change to the top-N hits: block-max-WAND skips a plain disjunction more aggressively than the
N-of-M scorer does. Recorded in `load-management.md` §6. Raw result:
`benchmark/results/experiment-2026-05-22T14-46-40-709Z.json`.

## 5. Audit & document unbounded-complexity requests

**Background.** Not a harness run — a code audit. `load-management.md` §6/§9 already
names several read paths with effectively unbounded ES work.

**Checklist (expand into `load-management.md` updates).**

- [x] `search.ts` / agg calls — **no `terminate_after`**: confirmed (zero occurrences in
      `api/src`); a single query can scan an unbounded number of docs per shard.
- [x] `values-agg.js` — combined fan-out `Π agg_size × size` is pre-checked before execution
      *only* when `size > 100` (`values-agg.js:85`); for `size ≤ 100` (incl. `size: 0`) it
      merely **logs a warning** past 100,000. The hard `400` fires only *after* ES returns
      >10,000 buckets (`values-agg.js:241`).
- [x] Deep offset pagination — bounded by `from + size ≤ maxPageSize` (10,000), but still
      does top-k collection over that depth. Confirmed (`commons.js:162-173`).
- [x] Exact `track_total_hits` on page 1 of very large datasets (→ investigation 2).
- [x] Streaming export paths — **claim was stale**: ODS `/exports` *is* wired for
      disconnect-abort (commit `56249d22a`); `/full` is a pre-computed file download (no ES
      query). Only `master-data/bulk-searchs` is genuinely unwired and unbilled.
- [x] No `index.search.slowlog` — confirmed (zero occurrences); no ES-side signal for which
      dataset is being hammered.

**Where it lands.** A consolidated "unbounded-complexity requests" section in
`docs/architecture/load-management.md`, each item with the harness evidence (where one
of investigations 2–4 produced it) and a proposed bound.

**Outcome (2026-05-22).** Audit complete. Five of the six items confirmed against current
source; the streaming-export item was stale (see above). Consolidated into a new
`load-management.md` §9 "Unbounded-complexity read paths", with the §4 and §8 streaming-export
descriptions corrected.

---

## Recording results

Harness runs save JSON to `benchmark/results/` tagged with the git commit. When an
investigation reaches a conclusion, summarise the numbers in
`docs/architecture/load-management.md` and, if it implies a behaviour change, open a
dedicated spec under `docs/superpowers/specs/`.
