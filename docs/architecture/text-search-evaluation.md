# Text search — design discussion & evaluation

> **Scope.** This document is the persisted brainstorm + empirical trace for a *future*
> text-search redesign. **No `api/src` change is made in this worktree** — implementation
> decisions land elsewhere. The point of the file is to capture: (1) the current shape,
> (2) the design threads we discussed, (3) the harness evidence that informs each, and
> (4) open questions / recommended directions. Companion: `benchmark/INVESTIGATIONS.md`
> (the executable backlog) and `load-management.md` (the broader load picture).

> **Status (2026-08-06) — shipped, supersedes T3 and T9 below.** The single-field
> `keyword_repeat` shape landed (design: `2026-08-06-text-indexing-repeat-design.md`):
> one analyzed `.text` per column (index analyzer `custom_french_repeat`, `search_analyzer:
> custom_french`), not T3/T13's "drop `.text_standard`" shape — `.text_standard` is now
> **legacy-only**, still served but only via union routing (`[.text, .text_standard]`) so
> old indexes keep today's behavior untouched. T9's premise (SAYT / `index_prefixes` buys
> real ranked-prefix improvement) measured **dead**: prefix matching stays constant-score
> regardless (`_explain`-verified) at +220..336% store cost — see
> `benchmark/INVESTIGATIONS.md` §15. `q_mode=complete`'s prefix clause is unchanged, just
> routed through the union. Release notes appended at the bottom of this file.

## Contents

1. [Current state — the text-search shape today](#1-current-state)
2. [Threads](#2-threads)
   - [A. Simplification / structural](#a-simplification--structural) — T1, T2, T3, T4, T13
   - [B. Bounded complexity](#b-bounded-complexity) — T5, T6, T7, T8
   - [C. Autocomplete](#c-autocomplete) — T9
   - [D. Niche / discussion-only](#d-niche--discussion-only) — T10, T11, T12
3. [Joint proposal — dual-analyzer collapse + dedicated autocomplete primitive](#3-joint-proposal-t13--t9)
4. [Experiment summary](#4-experiment-summary)
5. [Recommendations (for the implementation worktree)](#5-recommendations-for-the-implementation-worktree)
6. [Transition roadmap (sketch)](#6-transition-roadmap-sketch)
7. [The `q_mode=or|and|adapt|<n>` proposal](#7-the-q_modeorandadaptn-proposal-2026-07-30)
8. [Open questions](#8-open-questions)

---

## 1. Current state

Distilled from `api/src/datasets/es/operations.ts` and `commons.js`, plus the catch-all
rollout (`0bc454fb4`) and load-management.md §6.

**Per-column mapping** (`esProperty`). Each analyzed string column is a `keyword` (ignore_above
200) main type with inner fields:

| Inner field | Built when | Analyzer | Purpose |
|---|---|---|---|
| `.text` | `x-capabilities.text !== false` (default on) | `defaultAnalyzer` (e.g. `french`) | Main full-text matching — stemming, language stopwords |
| `.text_standard` | `x-capabilities.textStandard !== false` (default on) | `standard` | "Raw" matches — boost exact matches; used by `q_mode=complete`'s `q*` prefix |
| `.keyword_insensitive` | `x-capabilities.insensitive !== false` | `insensitive_normalizer` | Diacritic/case-insensitive sort, not search |
| `.wildcard` | `x-capabilities.wildcard === true` (opt-in) | (wildcard type) | `*q*` contains queries |

Date columns get a single `.text_standard` inner field so they can be matched textually.

> **Note (2026-08-07).** Numeric (`integer`/`number`) columns no longer get a `.text_standard`
> inner field on freshly built indexes (the `noNumericText` shape flag) — `q` now matches
> them whole-value via the main `long`/`double` field instead. Boolean columns never had a
> mapped `.text_standard` either (the old per-type capability toggle was a no-op for them).
> The `textStandard` capability itself stays in the contract (dates and strings still use
> it) and an explicit `x-capabilities: { textStandard: false }` set via the API on a numeric
> column is still honored — only the *offered* per-type capability lists (UI schema editor,
> agent property-config tools) dropped `textStandard` for `number`/`integer`/`boolean`.

**`q` regimes** (`getFilterableFields`). Three coexisting paths chosen by dataset state, no
explicit `q_fields`:

| Regime | When | `qSearchFields` |
|---|---|---|
| `copyToSearch` | `dataset._esCopyToSearch === true` (catch-all materialized) | `[_search, _search.text_standard]` + per-field entries for boost-eligible columns (`^3` / `^2`) |
| `reduced` | wide schema (`hasManyQSearchFields`, threshold 30 analyzed inner sub-fields) but pre-catch-all index | per-column `.text` + `.text_standard`, but **drops `.text_standard` from columns that also have `.text`** (string-fulltext analyzer dedup); `qStandardFields` kept for `complete` prefix |
| default | narrow schema | per-column `.text` + `.text_standard` (every analyzed inner field) |

Pure-keyword columns (text + textStandard both disabled) have their keyword main pushed
into `qSearchFields` in *every* regime — this is the only path that surfaces keyword mains
in `q` (analyzed columns never do). Their main entry is excluded from `searchFields`'s
analyzed surface and never participates in `copy_to '_search'`.

**`buildQClauses`** wraps a `bool.should` (`minimum_should_match: 1`):
- *simple* mode → 1–2 `simple_query_string` clauses: `q` over `qSearchFields`, then `q` over
  `qStandardFields` (the second is skipped in `reduced` mode — `.text_standard` already
  inlined where it matters).
- *complete* mode → up to 4 clauses: `q*` prefix over `qStandardFields`, `*q*` over
  `qWildcardFields`, quoted phrase `"q"` over `qSearchFields` (only when `q` has spaces and
  no quotes), plain `q` over `qSearchFields`.

**Boost** is a hardcoded set in `operations.ts`:
- `^3` for `rdfs:label`
- `^2` for `schema.org/description`, `schema.org/DefinedTermSet`

Boost-eligible columns are queried per-field in *every* regime — they're never `copy_to`'d
into `_search` (the per-field boost is the whole point of keeping them out).

**Width threshold**: `Q_SEARCH_FIELDS_THRESHOLD = 30` analyzed inner sub-fields (the *count
of `.text`/`.text_standard` entries*, not columns; boost-eligible excluded). Crossing the
threshold (in either direction) or a change to a column's boost eligibility forces a full
reindex — `updateDatasetMapping` rejects in-place mapping updates whose `copy_to` shape
would change.

---

## 2. Threads

### A. Simplification / structural

#### T1. Keyword main in `qSearchFields`

**Today.** A pure-keyword column (`text` + `textStandard` both disabled via `x-capabilities`)
puts its keyword main into `qSearchFields`. Analyzed columns never do — `q` reaches them via
the `.text` / `.text_standard` inner fields.

**Question.** A multi-term `q` against a keyword main is whole-token match (the keyword is one
indexed token). So `q="hello world"` → matches docs whose keyword *equals* "hello world" (rare
unless the user typed the literal value), or where any of {"hello","world"} is itself a complete
keyword value. **Is this useful in practice, or is it dead weight that just inflates leaf-query
count?**

**Evidence.** [E2 — keyword-main-in-q](#e2-keyword-main-in-q), three query shapes, with vs
without `kw1..kw10` in `qSearchFields`, `track_total_hits: 1_000_000` so totals are exact:

| Query | shape | with-kw-mains | search-only | Δ |
|---|---|---|---|---|
| `"analyse population"` | free-text | 299 999 hits, 15 ms (profile 49 ms) | 299 999, 15 ms (49 ms) | **identical** |
| `"analyse cat-alpha"` | mixed | 299 906, 16 ms (73 ms) | 299 717, 14 ms (87 ms) | 189 hits dropped, perf noise |
| `"cat-alpha"` | pure-keyword | 195 485, 9 ms (35 ms) | **0 hits**, <1 ms | **total recall loss** |

**Direction** *(supported by E2)*: **keep** the keyword mains in `qSearchFields`. They are
*free when irrelevant* (free-text query: empty postings on text-vocabulary tokens cause ES
to short-circuit — zero cost, zero divergence) and *essential when relevant* (a user typing
a category value into the search box is a real workflow; dropping the mains drops recall to
0). The pure-keyword-column branching in `getFilterableFields` is the cost of this; it stays.
A speculative future refinement could detect single-token-equals-known-value at query time
and route differently, but the empirical evidence says today's behaviour is correct.

*Generalisation:* the "free when irrelevant" property comes from Lucene's empty-postings
short-circuit and is generic — adding theoretically-redundant fields to `qSearchFields` does
*not* automatically cost. This weakens cost-only arguments against inclusion elsewhere
(e.g. always-`_search` membership decisions in T3).

#### T2. Always apply `_search`

**Today.** `_search` only created when the schema crosses `Q_SEARCH_FIELDS_THRESHOLD = 30`
analyzed sub-fields. Three regimes (`copyToSearch`, `reduced`, default) coexist with
threshold-conditional branches.

**Proposal.** Always create `_search` on every dataset; always route `q` through `[_search,
_search.text_standard]` + per-field boost. Collapses 3 regimes → 1. Conditions threads 3
(capability control over `_search` membership), 7 (msm on the canonical field), and the joint
proposal §3.

**Cost.** Every dataset pays: one extra mapping entry; one extra analyzed copy per text-cell
in storage and index size. `_search` for a 5-column narrow dataset stores ~the same content
as the per-column fields combined (every doc's text is now duplicated once into `_search`).

**Evidence.** [E1 — search-catchall cost curve vs field count](#e1-search-catchall-cost-curve).

| columns queried | sub-fields | `took` p50 | profile `BooleanQuery` |
|---:|---:|---:|---:|
| 1 | 2 | 3 ms | 8.7 ms |
| 2 | 4 | 5 ms | 16.3 ms |
| 4 | 8 | 9 ms | 43.4 ms |
| 8 | 16 | 23 ms | 107.8 ms |
| 20 | 40 | 104 ms | 347.1 ms |
| 40 | 80 | 354 ms | 920.3 ms |
| `_search` pair | 2 | **5 ms** | **57.9 ms** |

Per-column cost scales roughly linearly with field count. `_search` is bounded by its
constant 2-field shape. **Crossover is at ~2 columns** — past that, `_search` wins
decisively, and from 8 columns up the per-column path is multiples-slower (8 cols: 23 ms
vs 5 ms). The current `Q_SEARCH_FIELDS_THRESHOLD = 30` is conservative; `_search` is
already faster at ~8-12 sub-fields.

⚠️ **Caveat**: the `_search` field measured here was built for a 40-column dataset, so its
per-doc content is the full 40-column merge. A truly narrow dataset's `_search` would store
less per-doc content (only the cols that exist) and likely be **faster**, not slower — so this
overstates `_search`'s narrow-dataset cost. A proper measurement needs a custom preset with a
real narrow-`_search` mapping (deferred to E1b in `INVESTIGATIONS.md`).

**Direction** *(supported by E1)*: eliminate the threshold; materialize `_search` on every
dataset. The performance "loss" at narrow widths is single-digit ms (and likely flips to a
*win* once the `_search` field is itself narrow). The simplification gain — three regimes
collapse to one — is worth that. Migration: re-finalize datasets to materialize `_search`;
the legacy code path coexists during the transition via the existing `_esCopyToSearch` flag.

#### T3. Field-capability control for `_search` membership

**Today.** `_search` includes *every* analyzed text column except boost-eligible ones (label /
description / DefinedTermSet). Users have no control.

**Proposal.** A new `x-capabilities.qSearch: boolean` (default `true` for analyzed string
columns; `false` excludes the column from `_search`). Adjacent: a `qBoost: number` capability
that replaces the hardcoded `refersTo`-based boost set — explicit boost values per column,
no hidden semantic-URL magic. Boost-eligible columns would then opt out of `copy_to '_search'`
just like today, but the criterion becomes explicit (`qBoost != null`).

**Cost.** Schema-surface: one (optional two) new capability. Default behaviour unchanged.
Index size shrinks for users who exclude noise columns. Connects to T2 — once `_search` is
universal, users want a way to keep specific columns out of it.

**Evidence.** Mostly design-only — no harness experiment needed. The cost claim ("smaller
`_search` = faster queries") is the same mechanism E1 measures.

**Direction**: see [R3](#r3--schema-capabilities-for-_search-membership-and-boost-t3) — add
`qSearch` (membership) and `qBoost` (explicit weight) capabilities, with finalize-time
back-compat emission of `qBoost: 3` for `rdfs:label` etc. so legacy datasets behave
identically until they re-finalize.

#### T4. Boost-value calibration

**Today.** `^3` for label, `^2` for description / DefinedTermSet — unverified.

**Question.** Are these the right ratios? They're not motivated in the code or docs.

**Evidence.** Relevance judgment, not perf. The harness can't answer this — it'd need labelled
result sets ("for query X, the right top-5 is …"). Out of scope for this worktree.

**Direction**: see [R8](#r8--out-of-scope-t4-t10t12) — out of harness scope. R3's `qBoost`
makes the current values reviewable per dataset, which is the necessary precondition for any
later relevance-judgment exercise.

#### T13. Collapse `.text` + `.text_standard` into a single analyzed field per column

**Today.** Every analyzed string column carries *both* a language-analyzed `.text` and a
standard-analyzed `.text_standard` inner field. The catch-all `_search` field follows the
same dual-analyzer pattern (`_search` + `_search.text_standard`). This is the single biggest
source of "n analyzed sub-fields" inflation — at 40 string columns we have 80 analyzed inner
fields, which is what makes the per-column query expensive (validated by Inv 3: 80→2 = ~77×).

**Proposal** *(your addition)*: one analyzed inner field per column, with the analyzer
selected per-column via an optional `language` capability (default = the configured
language analyzer; explicitly `null`/none = standard analyzer). The `_search` catch-all
would similarly carry a single analyzer.

**What `.text_standard` currently provides, and what replaces it.**

| Use today | Replacement under T13 |
|---|---|
| `q_mode=complete`'s `q*` prefix clause (stemming breaks prefix completion) | A dedicated autocomplete primitive — see T9 / §3 |
| Boost exact matches in default `q` (second `should` clause on `qStandardFields`) | Single analyzed clause loses the "raw boost" — but the dedup in `reduced` mode already removed it for fulltext columns, so its empirical contribution is bounded. R7 follow-up to measure if anyone misses it. |
| Numeric / date columns matched textually | Keep a `.text_standard` inner field on non-string columns specifically — it's narrow scope (one column-type), not the dual-analyzer-everywhere current behaviour |

**Transition.** Capability change → reindex (same constraint as the existing `_search`
rollout). The two regimes can coexist via a dataset flag (mirroring `_esCopyToSearch`).

**Direction**: see [R6](#r6--joint-redesign-collapse-the-dual-analyzer-replace-complete-with-a-sayt-primitive-t13--t9)
— paired with T9. One analyzed field per analyzed string column, no `.text_standard` mirror,
SAYT subfield for autocomplete. **This is the single largest simplification on the table.**

---

### B. Bounded complexity

#### T5. `terminate_after` cap

**Today.** `terminate_after` is not set (load-management.md §9). A single query can scan an
unbounded number of docs per shard.

**Question.** What's the right cap value, and how does it interact with result quality
(top-k drift)? Hard caps trade bounded latency for completeness — but with block-max-WAND
already selecting competitive blocks first, the top-k is usually found early.

**Evidence.** [E5 — terminate_after cost cap](#e5-terminate_after-cost-cap). Heavy scoring
disjunction on `bench-tall` (2M rows, ~839 k matches), `track_total_hits` default (10 000):

| `terminate_after` | `took` p50 | profile | `hits.total` | top-20 vs baseline |
|---:|---:|---:|---|---|
| (none) | 7 ms | 31.9 ms | 10 000 (gte) | — |
| 1 000 | 1 ms | 0.3 ms | **1 000 (eq)** | **DIFFERS** |
| 10 000 | 1 ms | 1.4 ms | **10 000 (eq)** | **DIFFERS** |
| 100 000 | 7 ms | 31.8 ms | 10 000 (gte) | same |
| 1 000 000 | 7 ms | 31.1 ms | 10 000 (gte) | same |

Two facts that reshape the recommendation:

1. **`terminate_after` is a hard *visit-count* cap, not a score-aware bound.** It stops
   collection after N docs, in (loosely) doc-id-within-block order — *not* by score. So at
   small caps the top-20 returned is "best 20 of the first N docs WAND yielded", which is
   **not** the true top-20 over the full match set. At cap-1k and cap-10k the top-20 drifts;
   at cap-100k it doesn't (the true top-20 lives inside the first 100k visited docs by WAND
   block ordering).
2. **`hits.total` becomes a lower bound that *looks like* an exact count.** cap-1k reports
   `1 000 (eq)` — the "(eq)" is the count of docs visited, not the count of matches. This is
   easy to misread downstream.

**Direction** *(supported by E5)*: `terminate_after` belongs as a **high ceiling** — set
large enough not to kick in on normal queries (e.g. 1 000 000 docs per shard, which here is
indistinguishable from no cap), used as a guardrail against pathological queries. The
"small-cap = big speedup" reading is a **bad** trade: the speedup costs correctness on the
exact queries (heavy disjunctions over large datasets) where we'd most want a guarantee.

Picking a value: the smallest cap that doesn't perturb the top-20 on representative heavy
queries. Here that's ~100 k for a single-shard 2 M-row index — production data should
scale similar with corpus size. The cap should be config'd, not hard-coded, since the
right value depends on dataset size and shard count.

Side note: this experiment used the default `_score` sort, where WAND drives block ordering.
For filter-only queries sorted by `_i` (data-fair's typical no-`q` shape) the iteration is
doc-id-ordered without WAND pruning — `terminate_after` there caps at "first N matches in
doc-id order" with no top-k semantics to preserve. That mode wouldn't drift the top-N
because there's no scoring to drift; it would just truncate the visible window.

#### T6. `minimum_should_match` when it actually filters

**Today.** Inv 4 showed `minimum_should_match` is *slower* on a uniformly-distributed
vocabulary (the wide-text generator's 26 French words appear in every doc). The msm scorer's
N-of-M bookkeeping beats nothing because there's nothing to filter.

**Question.** When the query terms have *real* IDF skew — some terms common, some rare —
does msm earn its cost? E.g. `q="commerce population rare-tag-xyz123"`: requiring 2-of-3 drops
matches by 1000× (only docs containing the rare tag). Does the saved enumeration outweigh the
scorer overhead?

**Evidence.** [E3 — msm-skewed](#e3-msm-skewed). Query mixes one analyzed term with 5
keyword-category values on `bench-wide-text` (each category appears in ~65 % of docs via
the 10 kw fields), so increasing msm genuinely drops matches:

| msm | matches | filter ratio | `took` p50 | profile | top-20 vs baseline |
|---:|---:|---:|---:|---:|---|
| (default 1) | 300 000 | 1.0× | 57 ms | 214 ms | — |
| 2 | 299 710 | 1.001× | 55 ms (–3.5 %) | 183 ms | same |
| 3 | 292 076 | 1.03× | 54 ms (–5.3 %) | 180 ms | same |
| 4 | 240 849 | 1.25× | 52.5 ms (–7.9 %) | 174 ms | same |
| 5 | 121 220 | 2.5× | 44 ms (–22.8 %) | 154 ms | DIFFERS |
| 6 (all required) | 22 918 | 13× | 24.5 ms (–57.0 %) | 81 ms | DIFFERS |

**Cost drops monotonically with filter ratio.** At msm=6 the match set shrinks 13× and
`took` halves — confirming the user's intuition that msm earns its cost *when it actually
filters*. The win is small at low-filter thresholds (a few percent) and meaningful only
once msm drops a significant fraction of matches. Top-20 changes from msm=5 upward —
expected, the match pool the top-N is drawn from has shifted.

Combined with E4 (msm on `_search` is 15× cheaper than msm on per-column) and Inv 4
(msm without filter is a pure cost), the picture is consistent:

- msm is **conditional**: useful when the query has IDF skew and the user wants the saved
  enumeration; harmful when the vocabulary is uniform.
- msm **must run on `_search`** (per-column amplifies the bookkeeping cost into a 15×
  penalty for nothing).
- msm **must be opt-in**, not a default — the user has to know their query benefits, and
  the top-N shift is part of the deal.

**Direction** *(supported by E3 + E4 + Inv 4)*: expose msm as an opt-in `q_msm` parameter
(absolute count or percentage). Route it on `_search`. Document the trade — semantics
("require N of the query terms") and the effect on the result set. Refuses to apply if
the resolved threshold drops to 0 or fails to filter (cheap pre-check).

#### T7. msm on `_search` vs on per-column

**Today.** The catch-all path runs `q` over `[_search, _search.text_standard]`; the per-column
path runs `q` over 80 entries. If msm becomes a tool we use, *which surface* it runs on matters
for both cost and scoring.

**Semantically.** In `simple_query_string` with multiple fields, each term becomes a
disjunction across fields — msm counts *terms* matched, not field-instances. So msm on `_search`
and msm on per-column should yield the **same match set** (assuming the column-set covered by
`_search` matches the per-column list). Scoring differs: `_search` is one merged field (term
frequencies merged), per-column uses dis_max (best field wins).

**Cost.** Per-column with msm coordinates 80 sub-iterators instead of 2 — much heavier scorer.

**Evidence.** [E4 — msm on `_search` vs per-column](#e4-msm-search-vs-split). Same 5-term
query as Inv 4 on `bench-wide-text`, `track_total_hits: 1_000_000`:

| Variant | `took` p50 | profile | `hits.total` |
|---|---:|---:|---:|
| split-none (per-col, 80 fields) | 1578 ms | 2697 ms | 300 000 |
| search-none (`_search` pair) | **24 ms** | 98 ms | 300 000 |
| search-msm-3 | 41 ms | 161 ms | 300 000 |
| search-msm-5 (all terms) | 33 ms | 320 ms | 298 673 |
| split-msm-3 (per-col + msm) | 626 ms | 1923 ms | 300 000 |
| split-msm-5 | 580 ms | 1776 ms | 298 673 |

Three things drop out:
1. **Match sets are identical across surfaces** (`_search` and per-col both find 300 000
   without msm and 298 673 with msm=5). `simple_query_string` disjoins per term across
   fields and msm counts terms — surface-independent semantics. Scoring differs (merged-field
   vs dis_max), so the top-N *ranking* differs.
2. **msm on `_search` is ~15× cheaper than msm on per-column** (search-msm-3 41 ms vs
   split-msm-3 626 ms). If msm is ever exposed, it must run on `_search`.
3. **msm hurts on `_search` but helps on per-column.** On `_search` (2 fields) WAND already
   skips effectively, and msm's coordination overhead is net-negative (search-msm-3 41 ms
   > search-none 24 ms — consistent with Inv 4). On per-column (80 fields) plain disjunction
   evaluates 400 leaf clauses per doc; msm pruning saves more than the bookkeeping costs
   (split-msm-3 626 ms < split-none 1578 ms, –60 %). This **rehabilitates msm conditionally**:
   useful when many high-fanout disjunctions need pruning, harmful when the surface is already
   narrow.

(Side observation: split-none at 1578 ms is ~4× the per-column figure in Inv 3 — 384 ms —
because `track_total_hits: 1_000_000` here forces full match enumeration on the per-column
surface, exactly the cost Inv 2 documented. The cleanest cross-surface comparisons use the
*capped* counts, but here we needed exact totals to assert match-set equivalence.)

**Direction** *(supported by E4)*: msm, if it ever becomes a curated parameter, lives on
`_search`. Reinforces **T2**: `_search` is the canonical surface for any future msm
plumbing. The per-column path is incidentally *helped* by msm but only because it was so
slow to begin with — not a reason to keep it as a default.

#### T8. Phrase + wildcard cost in `q_mode=complete`

**Today.** `complete` mode adds a quoted-phrase clause (`"q"`) and a `*q*` wildcard clause on
top of the plain `q` and prefix clauses. Phrase queries don't use block-max-WAND well; `*q*`
wildcards on `.wildcard` are expensive.

**Question.** Do these clauses earn their cost — i.e. do they meaningfully improve the top-N
or are they overhead?

**Evidence.** No dedicated experiment yet; could piggyback on E5's profile telemetry or design
a small dedicated one. Marked as a follow-up.

**Direction**: see [R7](#r7--phrase--wildcard-evaluation-t8--follow-up) — measure each
clause's top-N contribution in isolation after R6 lands the SAYT primitive; drop the ones
that don't move the result set.

---

### C. Autocomplete

#### T9. `search_as_you_type` vs `q_mode=complete`

**Today.** `q_mode=complete` runs up to 4 `should` clauses to handle prefix + wildcard +
phrase + plain. The prefix clause is on `qStandardFields` because language stemming breaks
prefix completion.

**Proposal.** ES's `search_as_you_type` field type is purpose-built — it auto-indexes the
column at multiple granularities (`._2gram`, `._3gram`, `._index_prefix`) and exposes a single
`multi_match` query that combines them. One query replaces four clauses.

**Trade-offs.**
- Index size grows (n-gram + edge-ngram subfields).
- Replaces the multi-clause complete with a single canonical query.
- No native wildcard, but `*q*` can stay as an opt-in for the rare cases that need it.
- Mapping change → reindex (consistent with T2 / T13 transition cost).

**Where it could apply.**
- Universally on analyzed string columns (largest impact on dataset size, biggest cleanup).
- Or *only* on a `qComplete: true` capability subset, keeping the autocomplete surface narrow
  (T3-style explicit control).

**Evidence.** Schema-heavy — a clean experiment needs a custom preset with a
`search_as_you_type` column. Deferred — can run if budget allows; otherwise lay out as a
design proposal and defer the empirical leg to the implementation worktree.

**Direction**: see [R6](#r6--joint-redesign-collapse-the-dual-analyzer-replace-complete-with-a-sayt-primitive-t13--t9)
— paired with T13. Replace `q_mode=complete` with an SAYT-backed `multi_match.bool_prefix`;
the current 4-clause flow becomes the deprecation target once parity is shown.

---

### D. Niche / discussion-only

#### T10. `combined_fields` query

ES 7.13+'s `combined_fields` does cross-field scoring at query time without `copy_to`. Same
idea as `_search` but pay the merge at query time instead of index time. Possibly redundant
with T2 (we'd materialize `_search` anyway for query cost). Worth a sentence: "considered,
rejected because copy_to is the cheaper path for our query patterns."

#### T11. Fuzzy matching

`simple_query_string` supports `term~N` syntax (the user types it). A dedicated `q_mode=fuzzy`
or `fuzziness: 'AUTO'` parameter would expose it as a curated knob. Out of scope for this
round; revisit if user requests surface.

#### T12. `max_clause_count` headroom

ES's `indices.query.bool.max_clause_count` default is 4096 (post-7.x). Extreme schemas — e.g.
40 columns × 2 sub-fields × N query terms — could approach it. With T2/T13 the per-column path
goes away and this becomes moot. Recommend: confirm we're nowhere near this on the largest
real-world schemas in a quick `find`-style measurement before the redesign, then move on.

---

## 3. Joint proposal (T13 + T9)

The two largest threads pair into a coherent simplification:

```
Today:  every analyzed string column      = .text + .text_standard
        complete mode                      = 4 should clauses incl. .text_standard prefix
        catch-all                          = _search + _search.text_standard

Tomorrow:
  every analyzed string column            = .text  (analyzer ∈ {french, …, standard})
  every analyzed string column (opt-in)   + ._search_as_you_type (purpose-built autocomplete)
  catch-all                                = _search   (single analyzer per dataset)
  default q                                = simple_query_string over qSearchFields
  q_mode=complete                          = multi_match.bool_prefix over the SAYT subfields
```

**Benefits**
- Halves the analyzed sub-field count per column → `_search` for everyone (T2) becomes cheap.
- Single canonical `q` shape — no `reduced` regime, no analyzer-dedup logic.
- Autocomplete uses an ES-native primitive rather than 4 hand-rolled clauses.

**Transition cost**
- Capability surface: one new `language` capability (or `analyzer`); one new `qComplete`
  capability (opt-in SAYT subfields).
- Reindex required (the existing `_search` rollout is the precedent).
- Two regimes coexist via dataset flag during rollout (mirroring `_esCopyToSearch`).

**API impact**
- `q_mode=complete` semantics change subtly (still prefix-completion, but via SAYT instead of
  `q*`). Top-N may differ — acceptable per the brief ("similar behaviours, not necessarily
  strictly identical").
- No URL/parameter break — same query string, different machinery.

---

## 4. Experiment summary

| ID | Targets | Status | Notes |
|---|---|---|---|
| <a id="e1-search-catchall-cost-curve"></a>**E1** search-catchall cost curve | T2 | **done** | per-col grows linearly with field count, `_search` constant; crossover at ~2 cols; `_search` decisively wins from 4 cols up. Caveat: `_search` here holds 40-col content — true narrow-`_search` likely faster still. Result: `experiment-2026-05-28T07-29-45-080Z.json` |
| <a id="e2-keyword-main-in-q"></a>**E2** keyword-main-in-q | T1 | **done** | free-text: zero cost, zero recall delta; mixed: 189 hits dropped; pure-keyword: total recall loss. Keep them. Result: `experiment-2026-05-28T07-31-39-045Z.json` |
| <a id="e3-msm-skewed"></a>**E3** msm-skewed | T6 | **done** | constructed skew via 1 analyzed term + 5 keyword categories; cost drops monotonically with filter ratio; –57 % `took` at 13× filter. Result: `experiment-2026-05-28T07-39-25-618Z.json` |
| <a id="e4-msm-search-vs-split"></a>**E4** msm on `_search` vs per-column | T7 | **done** | match sets identical; msm-on-`_search` 15× cheaper than msm-on-per-column; msm hurts on `_search` (Inv 4) but helps on per-column. Result: `experiment-2026-05-28T07-34-56-465Z.json` |
| <a id="e5-terminate_after-cost-cap"></a>**E5** terminate_after cost cap | T5 | **done** | small caps drift top-20 (visit-count bound, not score-aware); high caps (≥100k for 2M-row corpus) preserve correctness without affecting normal queries. Result: `experiment-2026-05-28T07-36-25-089Z.json` |

Raw results land in `benchmark/results/`; each experiment is added to
`benchmark/INVESTIGATIONS.md` with its own Outcome note (matching the convention from Inv 2-5).

---

## 5. Recommendations (for the implementation worktree)

Each entry: the thread, the evidence summary, the proposed direction, and what the
implementation needs to address. **Nothing here is code-changing this worktree** — these
are the conclusions to carry forward.

### R1 — Keep keyword mains in `qSearchFields` (T1, E2)

The existing inclusion rule (keyword mains in `qSearchFields` *only* when the column has no
analyzed sub-fields) is correct. E2 shows zero cost on free-text queries (empty postings
short-circuit in Lucene) and total recall loss without them on keyword-value queries. No
change. The branching in `getFilterableFields` for pure-keyword columns stays.

### R2 — Always materialize `_search`; retire the threshold (T2, E1)

The `Q_SEARCH_FIELDS_THRESHOLD = 30` heuristic is no longer earning its keep. E1 shows
per-column cost grows roughly linearly with field count while `_search` is constant; the
crossover where `_search` becomes a clear win is at ~4 sub-fields, well below 30. Even at
narrow widths the cost gap is single-digit ms, and a *real* narrow-`_search` (only the
narrow content per doc) is likely faster than the experiment showed.

**Implementation needs**:
- Drop the threshold in `hasManyQSearchFields`; `_search` is always created for analyzed
  string columns.
- Collapse `getFilterableFields`'s three regimes (`copyToSearch`, `reduced`, default) into
  one: `qSearchFields = [_search, _search.text_standard, …boost-eligible per-field]`,
  always. `qStandardFields` keeps the per-column entries for `complete`-mode's prefix
  clause until T9 replaces it.
- Rollout matches the existing `_esCopyToSearch` lazy flag — datasets re-finalize as they
  cross the gate naturally, no big-bang migration.
- A narrow-`_search` follow-up measurement (custom preset) sharpens the absolute numbers;
  not blocking.

### R3 — Schema capabilities for `_search` membership and boost (T3)

Once `_search` is universal, users want control over what goes in. Add:

- `qSearch: boolean` (default `true` for analyzed string columns) — `false` excludes from
  `copy_to '_search'` *and* drops the column from `qSearchFields` per-field entries.
  Useful for noise columns (internal IDs, low-relevance metadata).
- `qBoost: number` (optional) — explicit boost weight. Replaces the hardcoded `refersTo`
  → `^3`/`^2` set. Boost-eligible columns continue to be referenced per-field with their
  boost, never copied into `_search`.

**Migration**: on dataset finalize, the legacy `refersTo` URLs (`rdfs:label` etc.) emit
`qBoost: 3` / `qBoost: 2` defaults to preserve existing behaviour. The hardcoded set in
`operations.ts` becomes a fallback only for datasets that haven't re-finalized.

### R4 — `terminate_after` as a high ceiling, not a low cap (T5, E5)

E5 changes the framing: `terminate_after` is a *visit-count* bound, not a score-aware
bound. Small caps cut latency dramatically but drift the top-20 because WAND's block
ordering doesn't guarantee the best-scoring docs are visited first. Set it **high enough
not to kick in on representative heavy queries** — for the 2 M-row corpus tested here,
≥ 100 k docs per shard preserves top-20 fidelity.

**Implementation needs**:
- Make `terminate_after` config'd in `commons.js → prepareQuery` (mirrors `searchTimeout`
  / `maxPageSize`). One value per env, not per request.
- Recommend the deployment repos pick a value that's a small multiple of the largest
  reasonable working-set size on the heaviest dataset — explicitly accepting that
  pathological queries hit the cap and return drifted top-N. Document this trade in
  `load-management.md` §9 once the value lands.
- Tighter caps for anonymous/public traffic (the load-management §10 "tighter timeout for
  untrusted traffic" bullet generalises to `terminate_after`).

### R5 — `q_msm` as an opt-in parameter (T6, T7, E3, E4, Inv 4)

The combined evidence:

- Without filtering: msm is pure overhead (Inv 4, E3 at low thresholds).
- With filtering: cost drops proportionally; –57 % `took` at 13× match-set reduction (E3).
- On per-column: msm coordinates 80 sub-iterators → 15× more expensive than msm on
  `_search` for the same match set (E4).

So expose msm as a curated `q_msm` query parameter (absolute count or percentage), route
it on `_search` only, and document the trade.

**Implementation needs**:
- Parameter parsing in `commons.js`: `q_msm: number | string` (absolute, or `"N%"`).
- Wire into `buildQClauses`'s `simple_query_string` clause(s) — only the `qSearchFields`
  one in `simple` mode; the `complete` mode clauses already mix prefix/phrase semantics
  that msm doesn't compose with cleanly.
- API docs need a "when to use" guidance — the trade isn't intuitive.
- Reject if the resolved threshold ≤ 0 or ≥ term-count (no-op cases) with a `400`.

### R6 — Joint redesign: collapse the dual analyzer, replace `complete` with a SAYT primitive (T13 + T9)

The single largest structural simplification. Empirically grounded by E1 (always `_search`
is fine), E2 (extra fields are free when irrelevant), and the load-management §6 catch-all
prior. Not directly measured by an experiment in this round (needs a custom mapping with
`search_as_you_type` subfields) — implementation worktree to validate.

**Target shape**:

```
Per analyzed string column:
  <key>.text                            → single language-analyzed field
  <key>.search_as_you_type              → optional, opt-in via x-capabilities.qComplete
  <key>.keyword_insensitive             → unchanged (used for sorting)
  <key>.wildcard                        → unchanged (opt-in)
  (no .text_standard on string-fulltext columns)

For numeric / date columns:
  <key>.text_standard                   → kept (the only sane analyzer for these)

_search catch-all:
  Single analyzed field with the dataset's language analyzer.
```

> Note (2026-08-07): the "numeric / date columns keep `.text_standard`" premise below predates the
> default-capabilities change (`docs/superpowers/specs/2026-08-07-default-capabilities-design.md`),
> which retired `.text_standard` for `integer`/`number` columns (`noNumericText` index shape,
> whole-value `q` matching now goes through the main field via a `lenient: true` clause). Dates are
> unaffected and still keep it. Revisit this section's numeric assumptions if R6 is picked up.

**Why each piece**:
- Halving the analyzed sub-field count per column shrinks `_search`, the catch-all index
  size, and the leaf-clause count when per-column is still in play.
- `search_as_you_type` collapses the four `q_mode=complete` clauses into one
  `multi_match.bool_prefix` — a single canonical autocomplete query, ES-native.
- Numeric / date `.text_standard` stays because their values aren't language-analyzed and
  the standard analyzer is the right pick for textually matching numbers.

**Transition** (no API break):
1. Add `qComplete` capability (opt-in `search_as_you_type` subfields). New datasets get
   it; existing ones don't, and continue to use the legacy `complete` path.
2. Single-analyzer `.text` for new analyzed string columns; dual-analyzer kept on existing
   ones until they re-finalize. `getFilterableFields` already handles per-column inner
   field presence — no code branching beyond what reduced-mode dedup already does.
3. `q_mode=complete` checks for `qComplete`-enabled fields; if any, runs the SAYT query;
   otherwise falls back to the legacy 4-clause flow. The two regimes coexist by dataset.
4. Eventually retire the legacy `.text_standard` mirror on string-fulltext columns;
   numeric/date columns keep theirs.

**Caveat (the brief's "similar behaviours, not necessarily strictly identical")**: the
`complete`-mode top-N will differ subtly post-migration — `search_as_you_type` ranks
n-gram + edge-prefix matches differently than the current `q*` + `*q*` + `"q"` + `q`
disjunction. This is acceptable per the scope.

### R7 — Phrase + wildcard evaluation (T8) — follow-up

E5 did not measure these directly. The phrase clause (`"q"` over `qSearchFields`) and the
wildcard clause (`*q*` over `qWildcardFields`) are the parts of `complete` mode most
likely not to earn their cost. Recommended follow-up after R6 lands: measure the top-N
contribution of each clause in isolation, drop the ones that don't move the result set.

### R8 — Out-of-scope (T4, T10–T12)

- **T4 boost calibration**: relevance task, needs labelled data; out of harness scope.
- **T10 `combined_fields`**: superseded by R2 — `copy_to '_search'` is the materialized
  version of the same idea.
- **T11 fuzzy**: not requested; revisit when user demand surfaces.
- **T12 `max_clause_count`**: R6 collapses the per-column query path, making this moot
  for `q`. Confirm `qs=` (the raw `query_string`) doesn't trip the default 4096 on the
  widest production schema before R6 lands.

---

## 6. Transition roadmap (sketch)

A no-API-break sequence — implementation work happens in other worktrees; this is the
ordering that lets each step land independently.

1. **R4 `terminate_after` ceiling** (S, no schema change). Self-contained; ships immediately.
2. **R5 `q_msm` parameter** (S, no schema change). Opt-in; no default behaviour change.
3. **R2 always-`_search`** (M, schema change → re-finalize on next change). Existing
   `_esCopyToSearch` flag already gates the path per dataset. Three regimes → one as
   datasets re-finalize.
4. **R3 `qSearch` / `qBoost` capabilities** (S, schema extension). Defaults preserve
   behaviour. Boost capability migration runs at finalize.
5. **R6 part 1: single-analyzer collapse** (M, schema change → re-finalize on next change).
   New columns get single `.text`; old ones keep dual until re-finalize. `reduced`-mode
   dedup logic already handles the case where `.text_standard` is missing.
6. **R6 part 2: `qComplete` + `search_as_you_type`** (M, schema extension). Opt-in
   capability; `q_mode=complete` routes on presence.
7. **R7 phrase/wildcard pruning of `complete`** (S, code-only). After R6 lands enough to
   measure the contribution of each remaining clause.

Each step is independently revertible and never breaks an existing query URL.

---

## 7. The `q_mode=or|and|adapt|<n>` proposal (2026-07-30)

Follow-up to the real-corpus round recorded in `benchmark/INVESTIGATIONS.md` §12 (RNA,
3.3M rows, both ES 7.17 and 8.19). Proposal under evaluation: extend `q_mode` with
`or` (current behaviour, alias of `simple`), `and` (strict), `adapt` (one `_rand`-sampled
`_msearch` across msm levels picks the strictness and provides the total), `<n>` (explicit
msm); every mode runs capped totals + `_rand` sampling with API/UI disclaimers; **`adapt`
becomes the default**. `complete` keeps its current autocomplete meaning; adapt never
applies to it.

Measured basis (warm p50, prod-faithful `_search` surface): today's OR-exact 22.5–59 ms;
adapt end-to-end 2–8 ms (ES 8) / 2–24.5 ms (ES 7); plain cap 2–7.5 ms (ES 8) / 3–18 ms
(ES 7). Beyond page-1 latency, adapt (unlike the cap) shrinks the *match set itself*
(1.4 M → 512 on "rue baudelaire"), which is the only lever that helps aggregations/facets
with a `q` filter (aggs visit every match; WAND/cap cannot help there), search exports,
and deep `after=` pagination.

Where `adapt`-as-default is genuinely breaking (ranked by likelihood):
1. **Recall/integration traffic** that paginates or exports the *tail* of a fuzzy query —
   the tail is exactly what adapt removes. Needs `q_mode=or` and release-notes comms.
2. **Synonym/exploratory queries** ("vélo bicyclette"): user means OR; adapt's msm=2
   returns the tiny both-words intersection. Top-20 overlap measured 13–17/20 on strict
   levels — "almost always the same top results" only holds when the chosen level's match
   set stays large; a min-results floor in the decision rule (relax when est < F) trades
   totals-meaningfulness for page stability and is THE tunable.
3. **Facet counts shift** (consistently with the narrowed set — coherent but visible).
4. **Dashboards/monitoring reading totals** see step changes at deploy time.
Mitigations: `q_mode=or` one-param escape; the chosen level pinned in the `next` link
(after= pages must not re-decide); a transparency field returning the sampled spectrum
(`512 with all words · ~135k with ≥2 · ~1.4M total` — UI-grade); staged default flip.

Complexity: bounded — parameter parsing, one preflight `_msearch` builder + call site in
the `/lines` path (reuses the approx-count `_rand` machinery), and a pure decision rule
(spectrum → chosen msm + total + confidence), each unit-testable; the probe step (direct
execution of an unconfident-but-nonzero strict level, returns exact totals) can be v1.1.
The real cost is not code but *tuning the decision rule* to make "same top page as OR"
true in the aggregate — measurable with `rna-check.ts` overlap metrics; a batch of real
production query logs is the right calibration corpus.

> **Amendment (2026-08-01).** The shipped `adapt` (#528) filtered on the *conjunction* of
> the rarest words ("require the rarest, ignore the rest"). Re-benchmarked against the
> OR-of-retained reading — filter = union of the non-ignored words, i.e. the plain search
> minus docs that only matched ignored words — the OR form gives identical top-20 pages,
> is cheaper wherever both designs act, adapts in cases the conjunction lattice cannot,
> and matches the "some words were ignored" message users actually see. Filter semantics
> were switched accordingly and the pinned pagination param renamed `q_required` →
> `q_ignored` (a `min-bite` guard also keeps adapt a no-op on phrase-like queries whose
> words co-occur). Evidence and decision rule: `benchmark/INVESTIGATIONS.md` §14.

## 8. Open questions

- T4 boost-value calibration needs labelled relevance data — out of harness scope; flag for
  a dedicated relevance-judgment effort.
- T9 `search_as_you_type` needs an integration measurement against `complete` mode on a
  realistic autocomplete workload (typed-prefix streams) — also out of pure-harness scope.
- T2 always-`_search` storage cost: how much does a typical dataset grow? Index-size delta is
  worth measuring once we have a real narrow-with-`_search` preset.
- The `qs=` raw `query_string` path is parallel to `q` but barely audited here — needs its
  own pass to confirm it benefits (or doesn't) from the same simplifications.
- Any interaction with virtual datasets, particularly when descendants differ in width /
  catch-all status (`_esCopyToSearch` AND'd across children today).

## 9. Release notes — single-field `keyword_repeat` shape (2026-08-06)

No dedicated release-notes staging location exists in this repo; listed here per the shipped
design (`2026-08-06-text-indexing-repeat-design.md` §5) for whoever cuts the next changelog.

- **Ranking change.** Today's accidental exact-match boost (two analyzed fields both scoring
  the same term ⇒ roughly +153% weight) becomes a deliberate clause with a static boost
  (`EXACT_MATCH_BOOST = 0.5` in `api/src/datasets/es/operations.ts` — a code constant, not
  config; changing it is a code release, query-side only, no reindex) — and it is now
  fold-insensitive (`eleve` exact-boosts «élevé»). Applies to new-shape datasets only; legacy
  datasets keep today's ranking automatically.
- **Pure-stopword queries stop matching** (e.g. `q=les`) on new-shape datasets — they used to
  match via `.text_standard`; arguably a fix.
- **`analysis=standard` on `words_agg` is rejected (400)** on new-shape datasets — the field
  serving word aggregations follows the column's own analysis; legacy datasets are unaffected.
- **`words_agg` on a column that never declared the "word statistics" capability now 400s** with
  the standard capability message, where a legacy index answered with an elasticsearch "fielddata
  is disabled" error. The refusal had to become explicit: on a new-shape index the field serving
  the aggregation only exists on opt-in columns, and aggregating an unmapped field returns an
  empty result instead of failing. Same message for a column that disabled the capability and one
  that never declared it.
- **`words_agg` on a virtual dataset whose children mix old and new index shapes now 400s**
  explicitly instead of silently answering from a subset of children — resolves once every
  child is reindexed to the same shape.
- **A virtual dataset advertises an opt-in capability (word statistics, character-group filtering)
  only when EVERY child column declares it**, where it used to be enough for one child to. Same
  reason: the capability maps to an inner field the other children do not have, and querying it
  there returns nothing rather than failing. Enable the capability on the remaining children to
  get it back on the parent.
- **`qs=` references to `col.text_standard` go inert on new indexes** (the field is no longer
  mapped there); no known local ecosystem users at time of writing.
