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
>
> **Round 2 (2026-05-28).** A second round of investigations (E1–E5, items 6–10 below)
> explored text-search simplification + bounded-complexity threads — findings recorded in
> the new `docs/architecture/text-search-evaluation.md`, which is the single trace doc for
> that whole design discussion. This worktree (`perf-es-optims`) holds the benchmark and
> the discussion only; implementation lands in other worktrees later.

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

## Round 2 — text-search simplification & bounded-complexity (2026-05-28)

Brainstorm-derived investigations exploring how `q` query construction could be simplified
and bounded. The 13 design threads (T1–T13) are catalogued in
`docs/architecture/text-search-evaluation.md`; the §5 "Recommendations" there is the
durable artifact this worktree leaves for the implementation worktrees.

## 6. Search-catchall cost curve vs field count

Targets thread **T2** (always materialise `_search`).

**Hypothesis.** The current threshold `Q_SEARCH_FIELDS_THRESHOLD = 30` is conservative;
`_search` becomes a clear win at far fewer fields. The per-column path's cost grows
roughly linearly with the field-list length.

**Run.**
```sh
npm run benchmark -- experiment --name=search-catchall-curve --profile --runs=20
```

**Outcome (2026-05-28).** Per-column `took` and profile time grow roughly linearly with
sub-field count (8 cols / 16 sub-fields = 23 ms, 40 cols / 80 sub-fields = 354 ms);
`_search` is constant at ~5 ms (profile ~58 ms). Crossover at ~2 cols; `_search` wins
decisively from 4 cols up. Caveat: the `_search` field measured held the full 40-column
content, so a real narrow-`_search` is likely faster still. Recorded in
`docs/architecture/text-search-evaluation.md` (§2 T2 and §5 R2). Result:
`benchmark/results/experiment-2026-05-28T07-29-45-080Z.json`.

## 7. Cost vs recall of keyword mains in `q`

Targets thread **T1** (drop keyword mains from `qSearchFields`?).

**Hypothesis.** A multi-term `q` can only hit a keyword main on whole-token equality, so
the mains are dead weight for free-text queries — drop them.

**Run.**
```sh
npm run benchmark -- experiment --name=keyword-main-in-q --profile --runs=20
```

**Outcome (2026-05-28).** Hypothesis **refuted**. Three query shapes on `bench-wide-text`
with `track_total_hits: 1_000_000` for exact totals: a free-text query (`"analyse
population"`) shows zero cost difference and identical totals (the kw postings are empty
for text vocab; ES short-circuits); a mixed query (`"analyse cat-alpha"`) drops 189 hits
without kw mains; a bare keyword (`"cat-alpha"`) drops to 0 hits — total recall loss.
**Keep keyword mains in `qSearchFields`.** Recorded in §5 R1. Result:
`experiment-2026-05-28T07-31-39-045Z.json`.

## 8. msm on a query with genuine match-set skew

Targets thread **T6** (does msm earn its cost when it filters heavily?).

**Hypothesis.** Inv 4 used a uniformly-distributed vocabulary so msm couldn't filter
anything; this experiment constructs skew (one common analyzed term + 5 keyword
categories) so msm genuinely drops matches at higher thresholds.

**Run.**
```sh
npm run benchmark -- experiment --name=msm-skewed --profile --runs=20
```

**Outcome (2026-05-28).** Hypothesis **confirmed**. As msm rises and the match set
shrinks, `took` drops monotonically: msm=4 (1.25× filter) –7.9 %, msm=5 (2.5×) –22.8 %,
msm=6 (13× filter, the extreme) **–57 %**. Top-20 changes from msm=5 upward (expected —
different pool). Combined with E4 and Inv 4 the position is: msm is a *conditional*
tool — useful when the query has real IDF skew, harmful when uniform; must be opt-in;
must run on `_search`. Recorded in §5 R5. Result:
`experiment-2026-05-28T07-39-25-618Z.json`.

## 9. msm on `_search` vs on per-column

Targets thread **T7** (which surface should msm run on?).

**Hypothesis.** The match set should be identical (per-term disjunction across fields, msm
counts terms); the per-column scorer coordinates 80 sub-iterators vs 2 for `_search`, so
the cost gap should be large.

**Run.**
```sh
npm run benchmark -- experiment --name=msm-search-vs-split --profile --runs=20
```

**Outcome (2026-05-28).** Match sets identical at every msm level (search-msm-5 and
split-msm-5 both return 298 673). msm on `_search` is **15× cheaper** than msm on
per-column (search-msm-3 41 ms vs split-msm-3 626 ms; profile 161 ms vs 1923 ms). msm
*hurts* on `_search` (slower than no-msm — Inv 4 again) but *helps* on per-column
(–60 % at msm-3) — the per-column win is incidental to its very-high baseline cost. If
ever exposed, msm must run on `_search`. Recorded in §5 R5 and §3 T7. Result:
`experiment-2026-05-28T07-34-56-465Z.json`.

## 10. `terminate_after` as a cost cap

Targets thread **T5** (right ceiling value and quality trade-off).

**Hypothesis.** `terminate_after` is the simplest hard latency cap; lower caps trade
correctness for cost. Find the smallest cap that doesn't drift top-N on representative
heavy queries.

**Run.**
```sh
npm run benchmark -- experiment --name=terminate-after --profile --runs=20
```

**Outcome (2026-05-28).** The framing shifts: `terminate_after` is a *visit-count* cap,
not a score-aware one. At `cap=1000` `took` falls 7 → 1 ms but top-20 drifts (the cap
stops collection in doc-id-within-block order, not by score). At `cap≥100 000` on this
2M-row corpus the cap doesn't kick in and top-20 matches the baseline exactly. **Use as
a HIGH ceiling** (cosmetic on normal traffic; bounds pathological queries with accepted
drift), not a low cap. Recorded in §5 R4 (and reframes the load-management.md §9
`terminate_after` proposal). Result:
`experiment-2026-05-28T07-36-25-089Z.json`.

> **Status update (2026-07-30):** the cap + `_rand`-sampled-total design below is
> **implemented** on this branch (see `docs/superpowers/plans/2026-07-30-approx-count-ranked-search.md`
> Tasks 1–5 and `load-management.md` §9); the `q_mode=or|and|adapt` extension (§12-C)
> is the remaining planned work (Tasks 6–8).

## 11. Split hits/count — transparent alternative to capping `track_total_hits`

Follow-up to investigation 2. Capping `track_total_hits` restores block-max-WAND but
degrades `hits.total` to a `10000 (gte)` floor — a visible regression for API consumers.
The alternative: keep the total, but stop computing it in the scored request. Page-1 `q`
becomes two legs (in production, one `_msearch`): a scored top-k leg with
`track_total_hits: false` (full WAND) plus a non-scored count leg — either an exact count
in filter context (`size: 0`, request-cacheable) or a `random_sampler` estimate.

**Run.**
```sh
npm run benchmark -- experiment --name=count-split --profile --runs=20 --no-seed
npm run benchmark -- experiment --name=count-split --runs=20 --cold --no-seed
```

**Outcome (2026-07-30).** Measured — with a load-focused correction. Judged on **ES work**
(not wall-clock), the split with an *exact* count leg is roughly **load-neutral**: on the
heavy disjunction (~839k matches, cold) scored-exact 12–15.5 ms vs wand-hits 6–7 ms +
filter-count 8–9 ms — the same enumeration, just unscored and moved to a second request.
Exact counting is inherently O(matches); only three things genuinely shed load:

- **The cap** (`capped-hits`, `track_total_hits: 10000`): 12 → 7 ms (−42 %), top-20 identical
  — the max load reduction, at the price of the `10 000 (gte)` floor.
- **The sampler** (`random_sampler`): visits ~p·M docs instead of M. Cold: 3 ms at p=0.01
  (est. +0.7 %), 2 ms at p=0.001. On this small corpus fixed overheads dominate; the ratio
  vs full enumeration grows with match count, and sampling error *shrinks* (∝ 1/√(p·M)).
- **The shard request cache** on repeats: both count legs are `size: 0` (sampler is
  deterministic via fixed `seed`) → ~1 ms warm, a cache the scored request can never use.

The composite that follows: **hybrid** — one scored request with `track_total_hits: 10000`
(exact totals for the ≤10k-match majority, WAND active, nothing extra to run), and only on
overflow (`gte`) fire the sampler count leg. Load ≈ the pure cap plus a marginal p·M
enumeration on precisely the queries where an estimate is tightest; totals stay exact below
10k and ~1 % accurate above. Sampler accuracy measured: p=0.01 → +0.7 % (839k) / +1.1 %
(322k); p=0.001 → +5.9 % on 839k (too few samples below ~1M matches — pick p by corpus).
**ES 7.17 compatibility (2026-07-30).** Production runs ES 7.17.28; `random_sampler`
requires ES ≥ 8.2 and is NOT available there. The `rand-count` variant replaces it: every
data-fair line carries `_rand`, a uniform integer in [0, 1 000 000) assigned at index time
(`extensions.ts`), so an indexed BKD range filter `_rand < p·1e6` selects a stable p-sample
and leapfrogs the main query's iterator — works on any ES version. Measured equivalent to
`random_sampler`: 3 ms vs 3 ms cold on the heavy disjunction, estimate −1.6 % vs +0.7 % at
p=0.01. Bonus: deterministic per dataset (request-cacheable, estimates stable across pages);
corresponding caveat: one frozen sample per index, so per-dataset estimate bias is
correlated across queries (error still ∝ 1/√(p·M), re-drawn on each reindex). Numeric
`track_total_hits`, `hits.total.relation` and the `size: 0` request cache are all 7.0+.

**ES 7.17 validation run (2026-07-30, `es7-copy.ts` + `es7-check.ts`).** The 2M-row
bench-tall index was copied into a throwaway `ghcr.io/data-fair/elasticsearch:7.17.28`
container and the count-split variants re-run over plain HTTP (the v8 JS client refuses
7.x servers). Findings:

- ✓ `rand-count` works and returns the *identical* estimate as on ES 8 (same deterministic
  `_rand` slice): 1 ms warm (request cache) / 5 ms cold vs 15 ms for the cold exact count.
- ✓ `random_sampler` fails with `parsing_exception: Unknown aggregation` — as predicted.
- ✗ **Capping `track_total_hits` yields NO hits-leg speedup on 7.17**: heavy disjunction
  scored-exact 13.5–15 ms vs capped/wand 16 ms — Lucene 8.11's WANDScorer adds bookkeeping
  but skips nothing on this corpus, ending slightly SLOWER than the exhaustive scorer. A
  per-term-boost skew probe (`analyse population^4 transport^0.2`) confirms it's the engine,
  not just the corpus: ES 8.19 gains −58 % from the cap on that query (12 → 5 ms), ES 7.17
  gains nothing (16 → 17 ms). Lucene 9 (ES 8.x) substantially reworked disjunction WAND;
  Lucene 8.11 could not exploit even explicit score skew here. Caveat kept in view: the
  synthetic corpus (26 uniform words, tf 1–3, 3–6-word docs) has near-flat block-max
  impacts, the worst case for WAND; Elastic's own 7.0 benchmarks showed large disjunction
  gains on natural (Zipfian) corpora, so real prod data should sit somewhere between —
  unproven here.

**Scale run (2026-07-30, 6M rows / 2.5M-match disjunction, x3-duplicated indices on both
versions, cold `took` p50).** ES 8.19: scored-exact 21 ms → capped-hits 11 ms (−48 %) +
rand-count 5 ms ⇒ strategy 16 ms (−24 % cold, −41 % warm; hits leg alone −48 % once the
count is request-cached). ES 7.17: scored-exact 45 ms → capped-hits **51 ms (+13 %)** +
rand-count 10 ms ⇒ strategy 61 ms (**+36 % worse** cold, ~+18 % warm) — Lucene 8.11's
scorer-with-impacts path costs more than exhaustive scoring when nothing is skippable, and
the penalty grows with match count. Estimate accuracy at 2.5M matches: rand-count −1.6 %,
random_sampler −1.0 % (ES 8 only). Side-finding: on force-merged indices (0 deletes) both
versions answer *single-term* exact counts from `docFreq` metadata in ~0–1 ms
(`Weight#count` shortcut) — the counting problem is specific to multi-term/multi-field
disjunctions, which is exactly the production `q` shape.

Consequence for the strategy on prod 7.17: **superseded by §12** — the real-corpus run
showed the 7.17 regression above was corpus pathology (the synthetic uniform vocabulary is
WAND's worst case; on natural text the cap wins on both versions). Keep the synthetic
corpus as a stress test, not as the rollout verdict.

Caveats: 2M-row in-RAM single-shard corpus (ms-scale, run-to-run variance ±30 %; the
scored-vs-unscored gap should widen with real multi-field dis_max `q`); a 10M+ seed would
show the sampler asymptote honestly; the harness ran on ES 8.19 (Lucene 9) — Lucene 8.11's
WAND is the same design but absolute numbers on 7.17 will differ. Recorded in
`load-management.md` §9. Raw results:
`benchmark/results/experiment-2026-07-30T09-12-50-274Z.json` (warm + profile),
`experiment-2026-07-30T09-13-19-388Z.json` (cold), `experiment-2026-07-30T09-23-56-439Z.json`
(cold, incl. `capped-hits`).

---

## 12. Real-corpus validation — RNA, 3.3M rows of natural French text (2026-07-30)

Loaded `repertoire-national-des-associations` (opendata.koumoul.com, 3 289 936 rows —
`titre` / `objet` / `adresse_siege` / `nom_commune_siege`) into BOTH local ES versions via
`rna-load.ts`, with a prod-faithful mapping: keyword mains + `.text` (custom_french) +
`.text_standard`, `copy_to` `_search` catch-all, and the SAME per-row `_rand` on both
versions. Measured with `rna-check.ts`: `simple_query_string` over
`[_search, _search.text_standard]`, `size: 20` — exactly the production `q` shape.

**A. The `track_total_hits` cap works on both versions on natural text** (cold `took` p50;
top-20 identical to the exact baseline in every single case, on both versions):

| query | matches | ES 8.19 exact→capped | ES 7.17 exact→capped |
|---|---:|---|---|
| rue baudelaire | 1.43 M | 29 → 1 (−97 %) | 43.5 → 3 (−93 %) |
| association sportive | 1.26 M | 25.5 → 3 (−88 %) | 37.5 → 18 (−52 %) |
| club de football marseille | 2.81 M | 38 → 2 (−95 %) | 58 → 5 (−91 %) |
| comité des fêtes saint pierre | 2.25 M | 38.5 → 5 (−87 %) | 55 → 10 (−82 %) |
| association (single term) | 1.06 M | 20.5 → 2 (−90 %) | 30 → 4.5 (−85 %) |

This **reverses §11's hold-off recommendation for 7.17**: real Zipfian text gives WAND the
block-level score skew the synthetic corpus lacked. The weakest case (two very common
terms, "association sportive") still halves on 7.17. Absolute costs on the real corpus are
also ~3× the synthetic bench (multi-field `_search`, longer docs) — the strategy's
absolute savings grow accordingly.

**B. `_rand` sampled counts on the real corpus**: −1.36 % / −0.56 % error at p=0.01 on
1.4 M / 2.8 M-match queries; count leg 8–12 ms cold on both versions (vs 30–35 ms exact on
7.17); estimates byte-identical across versions (shared `_rand`).

**C. `minimum_should_match` family as a load knob** (the "rue baudelaire" idea — require
more terms so both scoring AND counting shrink, independently of engine optimizations):

- **Plain default msm=2: refuted again on real data.** With exact counting it helped only
  when it filtered hard (club-de-football 38 → 18 ms ES 8) and *hurt* otherwise
  (comité-des-fêtes 38.5 → 41 ms ES 8, 55 → 62 ms ES 7) — consistent with Inv 4/E3: the
  N-of-M scorer only earns its bookkeeping when the match set actually collapses.
- **Hard AND (`default_operator: and`)**: 1–5 ms everywhere (vs 29–58 ms OR-exact), totals
  become small and *meaningful* (512 instead of 1.43 M for "rue baudelaire"), but the
  visible page changes: 13–17 of OR's top-20 remain (the dropped docs are single-term
  matches — arguably noise, but it IS a semantics change).
- **rare-must (the retired `common_terms` / `cutoff_frequency` semantics, client-side)**:
  require the terms whose match count ≤ 2 % of the corpus, keep frequent terms
  scoring-only. Best quality/cost point when a clear rare pivot exists: 1–3 ms with
  **20/20** page overlap on club-de-football-marseille and 18/20 on rue-baudelaire.
  Degrades when no good pivot exists (comité-des-fêtes: only "pierre" qualifies → 14/20,
  10–18 ms). Preflight per-term counts cost 15–30 ms sequential — must be parallelized
  (`_msearch`) and/or cached per dataset (term counts are `docFreq`-shortcut cheap on
  merged segments).
- **Adaptive cascade (strict → relax while the page is short)**: on all five real queries
  the strictest level already fills 20 hits, so it settles in ONE pass at AND cost
  (1–5.5 ms). The relax pass only triggers on genuinely narrow queries, where the relaxed
  rerun is the query the user would have paid anyway. Quality = AND quality (13–17/20).
- **Reverse-adaptive (sample first, then tune msm, then execute)**: ONE `_msearch` of
  `_rand`-sampled counts at every msm level (all `size: 0`, request-cacheable) yields the
  full strictness spectrum — e.g. `[1, 59, 589, 4289, 22356]` for the 5-term query — which
  both PICKS the level and IS the display total. The sampler's blind spot (a level with
  < ~500 true matches samples 0–4 docs at p=0.01) is resolved by directly probing that
  level, cheap precisely because it's selective — and the probe returns an *exact* total
  (512, 261, 245 on the test queries). Measured end-to-end (preflight + probe + final,
  warm p50): 2–8 ms on ES 8 and 2–24.5 ms on ES 7 vs 22.5–59 ms baselines, with identical
  decisions, sampled arrays and totals on both versions (shared `_rand`). Estimate
  accuracy at the chosen level: −4.1 % (134 900 est vs 140 645 true from 1 349 sampled).
  Weak spot: when every term is common ("association sportive"), the chosen msm=2 final
  query itself is the cost (24.5 ms ES 7 — better than the 39.5 ms baseline but worse
  than plain or-capped at 17 ms); the spectrum itself provides the signal to detect this
  case (strictest-level estimate still ≫ cap) and fall back to or-capped. Side product:
  the spectrum is UI-grade information ("512 résultats avec tous les mots · ~135 000 avec
  au moins deux · ~1,4 M au total").

- **Cap-floor variant of adapt (the retained design)**: never tighten below the
  `track_total_hits` cap — pick the strictest level whose estimate ≥ cap; if none
  qualifies, keep plain OR (capped + estimate). Invariant: any search totalling < cap is
  byte-identical to today. Floor-chosen levels on the RNA queries: club-de-football →
  msm=3 (~14 900), comité-des-fêtes → msm=3 (~58 900), association-sportive → msm=2
  (~134 900), rue-baudelaire → unrestricted (msm=2 is only ~500). Decisions are always
  statistically confident (≥ ~cap×p ≈ 100 samples) → the probe step becomes unnecessary.
- **Query shape matters for the tightened final query**: `minimum_should_match` in
  scoring position weakens WAND (comité msm=3 capped: 12 ms ES 8 / **30 ms ES 7** vs
  plain or-capped 5 / 10.5). The right shape is **score broad, match strict**:
  `bool { must: [OR-scored clauses], filter: [same clauses with msm] }` — the non-scoring
  msm filter leads the conjunction, scores stay pure OR BM25 (page = OR's page restricted
  to the tightened set, maximal overlap by construction). Measured: comité 9 ms ES 8 /
  12 ms ES 7, club 5 / 10 ms — parity or better with plain or-capped on ES 7.

ES history note: ES *had* exactly this mechanism (`common_terms` query / `cutoff_frequency`),
deprecated in 7.3 and removed in 8.x on the grounds that BM25 + WAND made it unnecessary —
true for *scoring* but not for *counting*: WAND cannot cap an exact count, while msm-family
semantics shrink the counted set itself. The two levers are complementary, not competing:
cap+sample keeps today's OR semantics bit-identical (20/20 pages everywhere); msm-family
changes the result-set contract in exchange for meaningful totals and even lower cost.

Tools: `rna-load.ts` (loader), `rna-check.ts --node=… [--cold]` (measurement).

---

## 13. Implementation-cost audit — do the design benchmarks cover the shipped code? (2026-07-31)

The design benchmarks (§11–12) measured *design-shaped* bodies; the shipped implementation
differs in three ways that were re-measured with implementation-faithful shapes
(`buildQClauses`-like clauses, filters-agg probe, conjunction `_msearch`,
score-broad-match-strict main query) on the reloaded `bench-rna` corpus (3.29M rows),
with `request_cache=false` — the earlier warm probe numbers (0–1 ms) were shard-request-cache
flattery, and the config-derived sampling probability (sampleTarget/count, clamped) produced a
100k-doc slice where the benchmarks had measured 33k (p=0.01).

Uncached probe1 (filters agg, per-word counts + OR total), real corpus, by slice size:

| words | slice 100k | 33k | 20k | 10k |
|---|---:|---:|---:|---:|
| 2 | 4 ms | 2 | 2 | 1 |
| 4 | 6 ms | 3 | 2 | 1 |
| 8 | 16 ms | 8 | 6 | 4 |

probe2 (conjunction `_msearch`) is ~0 ms at every size (leapfrog on the rarest word); the
main query adds 1–15 ms. Even at the 100k slice the feature stays net-positive everywhere
(worst case 31 ms total vs 64 ms or-exact baseline). End-to-end through the real API at the
worst clamp (150k-row dataset → p=0.5, slice 75k, true default config): adapt 11.8 ms vs
count=exact 10.1 ms — roughly neutral, confirming the win is thinnest near the
minDatasetSize gate where exact counting is already cheap.

**Consequence — `sampleTarget` lowered 100000 → 20000**: probe1 drops to 1–6 ms across the
board, and the clamp zone disappears (p=0.5 would need a ≤40k-row dataset, below
minDatasetSize). Cost of the change: totalMarginPct ~doubles (mid-size result sets ±6→±10 %,
large ones ±1→±2 %) — honestly reported by the field either way; the boundary worst case is
governed by MIN_BOUNDARY_SAMPLES and unchanged. Raising sampleTarget back buys narrower
margins at linear probe cost.

---

## 14. `q_mode=adapt` filter semantics — AND-of-required vs OR-of-retained (2026-08-01)

The shipped adapt (#528) tightens the match set to a *conjunction* of the rarest words
("require the rarest, ignore the rest"), which is stronger than what we tell users ("some
words were ignored") and stronger than the plan's own wording ("excludes from filtering the
most common query words"). Re-evaluated against the natural reading — filter = **OR of the
retained words**, i.e. the plain search minus the docs that match *only* ignored words —
on the reloaded `bench-rna` corpus (3 289 936 docs, ES 8.19.9 + ES 7.17.28, shared
`_rand`), implementation-faithful shapes, request cache cleared before every measured run
(§13 methodology), shipped config on this corpus (p = 0.01, cap = 10 000,
floorSample = 120). Tool: `rna-adapt-or.ts`. Variants:

- **shipped-and** — faithful port of the merged design (filters-agg probe, conjunction
  `_msearch` of rarest-prefix candidates, strictest above the cap floor).
- **or-capfloor** — same strictest-first cap-floor rule transplanted to OR-land: ignore
  the most frequent words, as many as possible while the *retained union* stays ≥ floor.
  Union counts are needed only when bounds can't decide: union ≥ max(solo) qualifies a
  candidate outright, sum(solo) < floor disqualifies — probe2 vanishes in most cases.
- **or-noise2pct / or-noisecap** — fixed noise thresholds (solo count > 2 % of corpus /
  > cap) instead of the cap-floor rule; retained union may fall below the cap.

Decisions and end-to-end cost (probe1+probe2+main `took`, warm p50; cold runs and ES 8
agree in ranking — full tables in the script output):

| query | shipped-and | or-capfloor | e2e ES 7 (and → or) | e2e ES 8 (and → or) |
|---|---|---|---|---|
| rue baudelaire | unrestricted (~1.44 M) | nothing ignorable (~1.44 M) | 16 → 25 | 11.5 → 15 |
| association sportive | require **both** (~140 k) | ignore `association` (~328 k) | 54 → 35 | 31 → 18.5 |
| club de football marseille | require `football` (~44 k) | retain `football` (~44 k) | 32 → 22.5 | 15.5 → 11 |
| comité des fêtes saint pierre | require `pierre` (~64 k) | retain `pierre` (~64 k) | 73.5 → 32 | 28 → 16 |
| les amis de la bibliothèque | **unrestricted** (~3 M) | ignore `de,la,les` (~88 k) | 30 → 47 | 14.5 → 19.5 |

Findings (decisions identical across ES versions in every case):

1. **Fidelity: top-20 identical to or-exact in every cell, both designs, both versions.**
   §12-C's rare-must degradation (14–18/20) came from putting requirements in scoring
   position (`must`), not from the tightening itself — score-broad-match-strict restores
   the full page. Page-1 fidelity therefore does NOT discriminate the two designs; the
   difference is the *enumerable set* (pagination, exports, aggregations).
2. **When the chosen candidate is a single word the two designs coincide exactly** (3 of
   5 queries, incl. the no-op). They diverge in both remaining cases, both times in OR's
   favour: on association-sportive AND silently intersects (140 k — excludes 188 k
   single-word matches from the enumerable set, contradicting the "ignored" message)
   where OR ignores the corpus's own noise word and keeps all `sportive` matches; on
   les-amis AND finds **no qualifying conjunction and gives up** (unrestricted, ~3 M)
   where OR's richer candidate lattice still shrinks the set 34× (~88 k).
3. **Cost: OR is cheaper wherever the designs coincide or AND over-tightens** (73.5 → 32
   on comité ES 7 — the conjunction `_msearch` alone cost 39 ms; the OR bounds shortcut
   eliminated probe2 in 3 of 5 queries). OR pays more only where it works harder
   (les-amis 30 → 47 but delivers ~88 k vs nothing; baudelaire 16 → 25 to *conclude*
   no-op, bounded by one extra `_msearch`). Everything stays well under the or-exact
   baselines (28–89 ms ES 7).
4. **The OR filter is never slower than the AND filter in the main query** — association
   sportive ES 7: 22–25 ms vs 36–38 ms. A short disjunction over mid-frequency postings
   beats leapfrogging two ~1 M-doc iterators.
5. **Fixed noise thresholds refuted.** solo > cap (0.3 % of this corpus) declares every
   word noise on 4/5 queries → no relief at all; 2 %-of-corpus misses the
   association-sportive relief and can tighten below the cap on sampling noise: les-amis
   retained `bibliothèque` sampled 101 < floor while the TRUE count is 10 097 ≥ cap —
   exactly the boundary noise ADAPT_FLOOR_SAFETY exists to absorb. The cap-floor
   strictest-first rule transplants to OR unchanged and keeps the never-below-cap
   invariant intact.

**Consequence: reimplement `q_mode=adapt` with OR-of-retained filtering** — same probe1,
bounds-guided union counts instead of conjunction counts, filter = single non-scoring
`should` over the retained words, pagination pinned by a `q_ignored` param (the ignored
words — the complement of today's `q_required`, whose name stops being accurate once
nothing is conjunctively required). Semantics finally match the user-facing message: the
result set is the plain OR search minus the docs that only matched ignored words, scores
and page 1 unchanged.

---

## Recording results

Harness runs save JSON to `benchmark/results/` tagged with the git commit. When an
investigation reaches a conclusion, summarise the numbers in
`docs/architecture/load-management.md` and, if it implies a behaviour change, open a
dedicated spec under `docs/superpowers/specs/`.
