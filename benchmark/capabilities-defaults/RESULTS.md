# A/B bench: store size & indexing time impact of default capabilities (this branch)

Measures the disk/indexing impact of `NEW_INDEX_SHAPE`'s `noNumericText` flag (this branch)
and the Task 5 sniffer's `{ text: false, insensitive: false }` capability injection on
code-like string columns, against the current production mapping shape.

**Revision note:** this file was rewritten after a methodology review found the first pass's
headline PAC number (-92.3%) was a stale-read measurement artifact, and that the code-heavy
dataset's A→B delta conflated two independent effects (a schema-width classification flip,
and the actual `noNumericText` change). Both are fixed below: see "Measurement fix" and
"Decomposition" sections. All corrected figures were independently cross-checked by the
reviewer's own re-run and matched within 0.12% (see task-6-report.md's fix log for every
figure's diff).

**Protocol note (deviates from the original task brief):** rather than uploading through the
data-fair API and diffing `master` vs this branch via dev-process restarts, this bench runs
directly against dev Elasticsearch (`localhost:27528`) using the **real branch mapping code**
(`buildIndexMappings` / `textAnalyzers` / `NEW_INDEX_SHAPE` imported straight from
`api/src/datasets/es/operations.ts`), with index *settings* (analyzers/normalizers) copied
verbatim from `indexBase` in `api/src/datasets/es/manage-indices.ts` — that function is
exported specifically so standalone fixtures can derive real index settings without
hand-copying the analyzer/filter definitions (see its own comment at
`manage-indices.ts:220-222`); this bench keeps its own copy in sync by hand rather than
importing it directly, to stay independent of `#config`. This was a controller decision (the
plan's own sanctioned fallback) to avoid coordinating dev-process restarts and API uploads.
See `benchmark/capabilities-defaults/bench.mjs`.

- **Shape A ("before", current production behavior):** `{ singleTextField: true, wordAggField: true }`
- **Shape B ("after", this branch):** `NEW_INDEX_SHAPE` = `{ singleTextField: true, wordAggField: true, noNumericText: true }`
- **Shape B2 (code-heavy dataset only):** shape B + the sniffer's capability injection
  (`x-capabilities: { text: false, insensitive: false }`) applied to every string column whose
  values are all "code-like" (ASCII letters/digits/`_./-`, at least one digit — the same
  regexp as `sniff()` in `api/src/datasets/utils/operations.ts`)
- **A-narrow (code-heavy dataset only, decomposition variant, not a real shape):** shape A's
  mapping with the `_search` catch-all field and every `copy_to` annotation stripped
  afterwards — isolates the schema-width effect from the `noNumericText` effect (see
  "Decomposition" below).

## Measurement fix (why the first pass's PAC number was wrong)

The first pass read `_cat/indices` store.size immediately after `_refresh` +
`_forcemerge?max_num_segments=1` + `_refresh`, and got **32,886,017 → 2,543,001 (-92.3%)**
for PAC. That B figure was a stale read: `_cat/indices` store.size lags the actual merged
segment's committed size for several seconds after a forcemerge. Verified directly on a
fresh rebuild of the same index with no further writes: the store.size read
7,619,736 through refresh/forcemerge/+5s, then settled at ~29,788,033 roughly 10 seconds
later with nothing else happening.

Fix applied in `bench.mjs`'s `measureIndex`: `_forcemerge` → `_flush` (forces an fsync'd
commit) → `_refresh` → poll `_cat/indices` at 1s intervals until the same store.size value is
read twice in a row (60s timeout) → cross-check against `POST /<idx>/_disk_usage
?run_expensive_tasks=true`'s `store_size_in_bytes`, which reads the actual committed Lucene
segment files rather than a shard-level stat and also gives a per-field-category breakdown
(used in the PAC interpretation below).

**A second, more subtle artifact surfaced while re-running with this fix**: on the code-heavy
dataset's 'A' variant, the settle-poll's two-consecutive-equal-reads criterion was satisfied
by a value (3,506,615) that was *itself* still wrong — a mid-merge plateau that happened to
hold for slightly over 1 second before moving again — while `_disk_usage` on the same,
unchanged index reported the correct 24,461,193 (confirmed against the reviewer's independent
cross-check of ≈24,413,137, 0.2% apart). `bench.mjs` now treats `_disk_usage`'s
`store_size_in_bytes` as authoritative whenever it succeeds, keeps the settled `_cat/indices`
read only as `catStoreBytes` for transparency, and logs a loud warning whenever the two
disagree by more than 1%. The re-run below produced `catStoreBytes === diskUsageTotal` for
every one of the 8 measured indices (no warnings), so the numbers in this file are not
affected by either artifact.

## Wide/narrow classification (recorded per variant, was previously discarded)

`buildIndexMappings` returns a `wide` flag (schema classifies "many analyzed text fields" per
`hasManyQSearchFields`, threshold-dependent on shape) alongside `properties`; when `wide` is
true the mapping adds a `_search` catch-all field and `copy_to` annotations on eligible
columns. The bench now records and logs this flag for every variant:

| dataset | A | A-narrow | B | B2 |
|---|---|---|---|---|
| PAC (numeric-heavy) | `wide=false` | — | `wide=false` | — |
| Compétences (code-heavy) | `wide=true` | `wide=false` (forced) | `wide=false` | `wide=false` |
| REFASHION (string control) | `wide=true` | — | `wide=true` | — |

The code-heavy dataset **flips** wide→narrow between shape A and shape B: under shape A it
has 16 analyzed inner fields (13 string `.text` + 3 numeric `.text_standard`, one above
`hasManyQSearchFields`' 15-field threshold for `singleTextField` shapes), so shape A
classifies it `wide`; under shape B, `noNumericText` removes the 3 numeric `.text_standard`
fields, dropping it to 13 — below the threshold — so shape B classifies it `narrow`. This
flip means the code-heavy dataset's raw A→B delta conflates two independent effects: losing
the `_search`/`copy_to` catch-all machinery, and losing numeric columns' `.text_standard`.
See the decomposition below for the split. PAC (15 columns, well under any threshold either
way) and REFASHION (34 columns, wide under both shapes) don't flip, so their A→B deltas are
clean single-effect reads.

## Results

### 1. `PAC - Campagne de mesures 100 PACs` — numeric-heavy

Heat-pump measurement campaign: 1 date-time column (`time`) + 14 numeric columns
(temperatures, resistances, calorimetric counters). `wide=false` under both shapes — a clean
read of `noNumericText` alone, no catch-all effect involved.

| | A (before) | B (after) | delta |
|---|---|---|---|
| store bytes | 32,944,785 | 29,792,537 | **-9.6%** |
| bulk wall time | 3,851 ms | 2,855 ms | **-25.9%** |
| docs | 200,000 | 200,000 | — |

#### Component breakdown (`_disk_usage`'s per-field-category totals, summed across all fields)

| component | A | B | delta | shape-dependent? |
|---|---|---|---|---|
| stored_fields | 10,153,276 | 10,152,120 | ~flat | no |
| doc_values | 12,000,355 | 12,000,355 | flat | no |
| points | 5,586,166 | 5,586,165 | flat | no |
| **inverted_index** | 4,864,494 | 2,006,860 | **-58.7%** | **yes** |
| **norms** | 291,646 | 0 | **-100%** | **yes** |

Only `inverted_index` and `norms` move between A and B — together they're the entire
`.text_standard` inner field's storage cost on the 14 numeric columns (an analyzed `text`
field has no `doc_values` by default, so it contributes nothing there). `stored_fields` +
`doc_values` + `points` — the shape-invariant floor — is **84.2%** of A's total store and
**93.1%** of B's: this is the honest ceiling on numeric-heavy savings from this branch's
mapping change alone. It cannot go lower without also touching `values`/`index` capabilities
(sortability, exact-match filtering), which this branch does not change.

### 2. `Compétences des acteurs par année` — code-heavy

Waste-management actor competences by year: SIRET + INSEE region/department codes + 3
integer columns (`annee`, `code_acteur`, `nb_service`) + a handful of French label columns.

#### Decomposition: catch-all removal vs `noNumericText` alone

| | store bytes | delta | wall time | delta |
|---|---|---|---|---|
| A (before, `wide=true`) | 24,412,681 | — | 5,516 ms | — |
| A-narrow (A's mapping, `_search`/`copy_to` manually stripped) | 17,643,964 | **-27.7%** vs A | 3,805 ms | -31.0% vs A |
| B (after, `wide=false`, `noNumericText`) | 17,232,431 | -2.3% vs A-narrow (**-29.4%** vs A) | 3,625 ms | -4.7% vs A-narrow (-34.3% vs A) |
| B2 (B + code-like capability injection) | 16,329,770 | -5.2% vs B (**-33.1%** vs A) | 3,281 ms | -9.5% vs B |

**Attribution: on this dataset, losing the `_search` catch-all + `copy_to` annotations
(-27.7%) accounts for roughly 12x more of the A→B store delta than `noNumericText` itself
(-2.3% further)** — the opposite of what the raw A→B number (-29.4%) suggests taken at face
value, since it makes `noNumericText` look like the dominant effect when it's actually the
minor one here. This is schema-width-dependent, not a general property of `noNumericText`:
this dataset happens to sit exactly one analyzed field above the 15-field
`hasManyQSearchFields` threshold under shape A, so it's the specific dataset where the
threshold-crossing effect is visible at all. PAC and REFASHION below don't cross the
threshold in either direction, so their deltas aren't subject to this conflation.

B2 (the Task 5 sniffer's capability injection on top of B) adds a further, genuinely separate
-5.2%: see "B2's actual mechanism" below for what specifically changes.

B2 code-like columns detected (sniffer heuristic applied to the actual downloaded values):
`code_region`, `code_departement`, `code_type_acteur`, `siret`, `code_competence`.
(`code_valideur` was NOT flagged — its values include a `" | "`-separated multi-value form,
e.g. `"62957 | 100000"`, which fails the code regexp's no-whitespace/no-pipe rule.)

#### B2's actual mechanism (corrected)

`x-capabilities: { text: false, insensitive: false }` does **not** leave a column
analysis-free. Per `esProperty` (`operations.ts`): when `capabilities.text === false` but
`textStandard` is still at its default (`true`), the single-text-field branch falls back to
`innerFields.text_standard = { type: 'text', analyzer: 'standard' }` instead of
`innerFields.text = { type: 'text', analyzer: analyzers.index, ... }`. Verified directly in
this bench's B2 mapping: `siret` (and the other 4 code-like columns) carry a plain `keyword`
main field plus a `fields.text_standard` (standard analyzer, no French stemming/elision) —
not a bare unanalyzed keyword. So **B→B2 is: swap the French-analyzed `.text` field for a
standard-analyzed `.text_standard` field (still an analyzed text field, just a lighter,
non-French analyzer with no stemming pipeline) AND drop the `.keyword_insensitive` sub-field
entirely.** The measured -5.2% is the net of both: one analyzed-field swap (standard analysis
tokenizes/stores marginally less than the French pipeline's elision+stemming+asciifolding
chain) plus one field's outright removal (`.keyword_insensitive`, a `KEYWORD_IGNORE_ABOVE`-len
keyword with a normalizer — cheap per-doc but non-zero at 106k rows).

### 3. `Données EO-REFASHION` — string/prose control

Textile take-back point directory: 34 columns, mostly strings (addresses, opening hours,
SIRET/SIREN, phone/email, labels) + 7 booleans + 4 numeric geocoordinate columns
(`latitudewgs84`, `longitudewgs84`, `latitudemercator`, `longitudemercator`). `wide=true`
under both shapes — no threshold-flip conflation here, this is a clean `noNumericText`-alone
read like PAC, just diluted across far fewer numeric columns.

| | A (before) | B (after) | delta |
|---|---|---|---|
| store bytes | 22,626,858 | 20,759,134 | **-8.3%** |
| bulk wall time | 3,003 ms | 2,777 ms | **-7.5%** |
| docs | 44,708 | 44,708 | — |

## Interpretation

- **Numeric-heavy's real ceiling is -9.6% store, not -92.3%.** The first pass's headline
  number was a measurement artifact (see "Measurement fix" above). The corrected component
  breakdown shows exactly why -9.6% is the honest number: `noNumericText` only ever removes
  the `inverted_index` + `norms` cost of the numeric columns' `.text_standard` field (-58.7%
  and -100% respectively on those two components alone) — it cannot touch `stored_fields` /
  `doc_values` / `points`, which together are 84-93% of the total store regardless of shape.
  Indexing wall time drops more (-25.9%) than store size, because writing an analyzed text
  field costs CPU (tokenizing, position tracking) independently of how much it ultimately
  compresses to on disk.
- **Code-heavy's headline number needs the decomposition to be honest about what's driving
  it.** Read naively, A→B (-29.4%) looks like `noNumericText` is doing most of the work on a
  code-heavy dataset — but the A-narrow variant shows the opposite: -27.7% of that comes from
  crossing the `hasManyQSearchFields` wide/narrow threshold (losing the `_search` catch-all +
  `copy_to`), and only -2.3% (on top of A-narrow) is `noNumericText` itself. This dataset
  happens to sit exactly one field over the 15-field threshold under shape A — a somewhat
  fragile position to draw a general conclusion from. B2's -5.2% further is the part that
  actually generalizes to "code-heavy datasets": dropping the French-analyzer inner field in
  favor of a lighter standard-analyzer one, plus dropping `.keyword_insensitive`, on columns
  the sniffer correctly identifies as codes.
- **The string/prose control shows the smallest delta of the three (-8.3%), and it's a clean
  read (no threshold flip — `wide=true` under both shapes)**, driven entirely by its 4 numeric
  geocoordinate columns' near-unique float values losing their `.text_standard`
  `inverted_index`/`norms` cost, exactly the same mechanism as PAC, just diluted across 34
  mostly non-numeric columns. A dataset with genuinely zero numeric columns would show a true
  ≈0% delta at the A→B step; this dataset isn't quite that, but it isolates the same
  mechanism PAC does, at smaller scale.

## Query-side cost of the wide→narrow flip (out of scope for this bench, flagged explicitly)

This bench measures **only store size and bulk-indexing wall time**. It does not measure the
query-side cost of the code-heavy dataset's wide→narrow flip. Losing the `_search` catch-all
field means `q` search on that dataset moves from matching against **1** field (`_search`) to
a `simple_query_string` fanout across **13+** per-column analyzed fields (`getFilterableFields`
in `operations.ts` builds this fanout at query time). That is a real query-time cost — more
fields for Lucene to visit per query, more term-dictionary lookups — and it is not captured
anywhere in this bench's numbers. Anyone using these results to reason about the branch's
full production impact on this class of dataset (one that crosses the wide/narrow threshold)
needs a separate query-latency bench to complete the picture; this document does not claim to
provide one.

## Runtime caveats (read before citing these numbers)

- **Single run, not a median of several.** The task brief's "three runs, keep the median"
  step was dropped to keep total bench runtime reasonable; wall-time deltas in particular
  should be read as directional (indexing fewer analyzed fields is reliably faster) rather
  than precise percentages — expect run-to-run noise on the order of ±10-20% on a shared dev
  box. Store-size deltas are far more reliable (see next point).
- **Ordering bias:** variants run in a fixed order (A, [A-narrow,] B, [B2]) within each
  dataset, so 'A' always hits a colder ES (JIT warmup, filesystem page cache) than the
  variants that follow it, and earlier variants' indices are still resident on disk/in cache
  when later ones are created and bulk-indexed. This biases wall-time comparisons in A's
  disfavor (A should, if anything, look slightly slower than a truly isolated measurement
  would show) — noted here rather than randomizing run order, since the store-size numbers
  (this bench's primary metric) are unaffected by ordering once forcemerge+flush+settle-poll
  brings every index to the same committed-segment state.
- **Shared dev Elasticsearch**, not an isolated/dedicated node — the dev stack's other
  services (API, UI, mock server) were running concurrently throughout.
- **Store-size deltas are the reliable metric**: `_forcemerge?max_num_segments=1` + `_flush`
  + settle-poll + `_disk_usage` cross-check (see "Measurement fix" above) eliminates both
  segment-count noise and the two stale-read artifacts found during this review; the numbers
  reported are deterministic given the same input docs and mapping, and matched the
  reviewer's independent cross-check within 0.12% on every one of the 8 measured indices (see
  task-6-report.md for the full diff table).
- `refresh_interval: -1` was set during bulk load and only refreshed once at the end, so wall
  time reflects pure indexing throughput, not periodic-refresh overhead (matches production,
  which uses a similar bulk-then-refresh pattern during dataset finalization).
- 1 shard / 0 replicas throughout, to isolate the mapping-shape effect from
  sharding/replication overhead. Production sizing (shard count scales with `indexed.size`)
  is orthogonal to what's measured here.
- Calculated columns (`_id`, `_i`, `_rand`, `_bytes`, `_score`, `_geopoint`, `_updatedAt`,
  etc.) are excluded from every indexed doc (see `projectRow` in `bench.mjs`) — only the
  dataset's own schema columns are indexed. Production datasets carry these calculated
  columns too, so real-world relative savings (as a % of a production index's total store)
  are slightly smaller than the percentages in this file, which measure only the schema-owned
  portion.
- `results.json` (the full raw per-run output, including every `componentBreakdown`) is
  gitignored and not committed — this file's tables are the only in-repo record of the
  measured numbers. Re-run `bench.mjs` to regenerate it.

## Reproducibility / provenance

All three datasets are public, from the `data.ademe.fr` catalog
(`GET https://data.ademe.fr/data-fair/api/v1/datasets?select=id,slug,count,schema&q=...`).
Row data was pulled via each dataset's public `/lines` JSON API (already typed — numbers as
JS numbers, booleans as booleans, ISO date strings), capped at 200,000 rows per dataset. Full
search/selection log is in `.superpowers/sdd/2026-08-07-default-capabilities/task-6-report.md`.

| dataset | ademe id | slug | rows used | ademe total count | fetched |
|---|---|---|---|---|---|
| PAC - Campagne de mesures 100 PACs | `-p3qp8b8xestyz3f35ns-j1h` | `pac-campagne-de-mesures-100-pacs` | 200,000 | 527,040 | 2026-08-07 |
| Compétences des acteurs par année | `pljxb0la63vv9iyp5848xioa` | `competences-des-acteurs-par-annee` | 106,092 | 106,092 | 2026-08-07 |
| Données EO-REFASHION | `zkt20z09p8jl6oix18a5kcte` | `donnees-eo-refashion` | 44,708 | 44,940 | 2026-08-07 |

Raw run output and per-index numbers, including the `_disk_usage` component breakdown for
every variant: `benchmark/capabilities-defaults/results.json` (not committed — see caveats
above; regenerate with `node --experimental-strip-types
--disable-warning=ExperimentalWarning bench.mjs`; requires network access to `data.ademe.fr`
and a reachable dev Elasticsearch at `$ES_ORIGIN` / `http://localhost:27528`).

To re-run: `cd benchmark/capabilities-defaults && node --experimental-strip-types
--disable-warning=ExperimentalWarning bench.mjs`. Downloaded row dumps are cached under
`./data/` (gitignored); delete that directory to force a fresh download. The script creates
and deletes only indices prefixed `bench-capdefaults-`.
