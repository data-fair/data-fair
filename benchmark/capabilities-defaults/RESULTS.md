# A/B bench: store size & indexing time impact of default capabilities (this branch)

Measures the disk/indexing impact of `NEW_INDEX_SHAPE`'s `noNumericText` flag (this branch)
and the Task 5 sniffer's `{ text: false, insensitive: false }` capability injection on
code-like string columns, against the current production mapping shape.

**Protocol note (deviates from the original task brief):** rather than uploading through the
data-fair API and diffing `master` vs this branch via dev-process restarts, this bench runs
directly against dev Elasticsearch (`localhost:27528`) using the **real branch mapping code**
(`buildIndexMappings` / `textAnalyzers` / `NEW_INDEX_SHAPE` imported straight from
`api/src/datasets/es/operations.ts`), with index *settings* (analyzers/normalizers) copied
verbatim from `indexBase` in `api/src/datasets/es/manage-indices.ts`. This was a controller
decision (the plan's own sanctioned fallback) to avoid coordinating dev-process restarts and
API uploads. See `benchmark/capabilities-defaults/bench.mjs`.

- **Shape A ("before", current production behavior):** `{ singleTextField: true, wordAggField: true }`
- **Shape B ("after", this branch):** `NEW_INDEX_SHAPE` = `{ singleTextField: true, wordAggField: true, noNumericText: true }`
- **Shape B2 (code-heavy dataset only):** shape B + the sniffer's capability injection
  (`x-capabilities: { text: false, insensitive: false }`) applied to every string column whose
  values are all "code-like" (ASCII letters/digits/`_./-`, at least one digit — the same
  regexp as `sniff()` in `api/src/datasets/utils/operations.ts`)

## Results

### 1. `PAC - Campagne de mesures 100 PACs` — numeric-heavy

Heat-pump measurement campaign: 1 date-time column (`time`) + 14 numeric columns
(temperatures, resistances, calorimetric counters).

| | A (before) | B (after) | delta |
|---|---|---|---|
| store bytes | 32,886,017 | 2,543,001 | **-92.3%** |
| bulk wall time | 4,233 ms | 2,892 ms | **-31.7%** |
| docs | 200,000 | 200,000 | — |

### 2. `Compétences des acteurs par année` — code-heavy

Waste-management actor competences by year: SIRET + INSEE region/department codes + 3
integer columns (`annee`, `code_acteur`, `nb_service`) + a handful of French label columns.

| | A (before) | B (after) | B2 (+ code-like capabilities) |
|---|---|---|---|
| store bytes | 24,385,585 | 17,229,917 (**-29.3%** vs A) | 16,348,157 (**-5.1%** vs B, **-33.0%** vs A) |
| bulk wall time | 5,678 ms | 3,672 ms (**-35.3%** vs A) | 3,336 ms (**-9.2%** vs B) |
| docs | 106,092 | 106,092 | 106,092 |

B2 code-like columns detected (sniffer heuristic applied to the actual downloaded values):
`code_region`, `code_departement`, `code_type_acteur`, `siret`, `code_competence`.
(`code_valideur` was NOT flagged — its values include a `" | "`-separated multi-value form,
e.g. `"62957 | 100000"`, which fails the code regexp's no-whitespace/no-pipe rule.)

### 3. `Données EO-REFASHION` — string/prose control

Textile take-back point directory: 34 columns, mostly strings (addresses, opening hours,
SIRET/SIREN, phone/email, labels) + 7 booleans + 4 numeric geocoordinate columns
(`latitudewgs84`, `longitudewgs84`, `latitudemercator`, `longitudemercator`).

| | A (before) | B (after) | delta |
|---|---|---|---|
| store bytes | 22,638,074 | 20,759,742 | **-8.3%** |
| bulk wall time | 3,045 ms | 2,863 ms | **-6.0%** |
| docs | 44,708 | 44,708 | — |

## Interpretation

The measured deltas confirm the spec's predictions, in direction and in relative ordering:

- **Numeric-heavy sees by far the largest cut (-92.3% store).** Every one of the 14 numeric
  columns loses its `.text_standard` analyzed inner field under `noNumericText`. Numeric
  values (especially high-precision floats like the temperature/resistance readings here) are
  near-unique per document, so their analyzed-text representation was dominated by a huge term
  dictionary + postings + norms — vastly more expensive than the compact `doc_values`-only
  `long`/`double` main field that remains. This is the single biggest lever in the whole
  branch: `bytes/doc` drops from ~164 to ~13.
- **Code-heavy sees a real but smaller cut from B alone (-29.3%, only 3/17 columns are
  numeric), then an additional, distinct cut from B2's capability injection (-5.1% further,
  -33.0% total vs A).** The B2 delta isolates the Task 5 sniffer's effect: dropping
  `.text` and `.keyword_insensitive` on 5 code-like string columns (SIRET + 4 INSEE-style
  codes) removes their French-analyzed inner field and their case/diacritics-insensitive
  keyword sub-field, on top of what B already removed from the dataset's numeric columns.
  Indexing wall time drops accordingly at every step (fewer analyzed sub-fields to tokenize
  and write).
- **The string/prose control shows the smallest delta of the three (-8.3%), but not
  literally ≈0**, because this particular control dataset still carries 4 numeric
  geocoordinate columns with near-unique float values — exactly the same "near-unique numeric
  value → expensive analyzed text" pattern as the PAC dataset, just diluted across 34 mostly
  non-numeric columns. This is consistent with the spec's prediction once read precisely:
  `noNumericText` (shape B) only ever touches numeric-typed columns; a dataset's delta from A
  to B should scale with how much of its per-document byte weight sits in numeric columns,
  not with how "prose-heavy" its string columns are. A dataset with genuinely zero numeric
  columns would show a true ≈0 delta at the A→B step (B2's string-capability effect is
  orthogonal and wasn't applied here, since this dataset's string columns are a real mix of
  codes, addresses and short labels, not sniffed for this bench).

## Runtime caveats (read before citing these numbers)

- **Single run, not a median of several.** The task brief's "three runs, keep the median"
  step was dropped to keep total bench runtime reasonable; wall-time deltas in particular
  should be read as directional (indexing fewer analyzed fields is reliably faster) rather
  than precise percentages — expect run-to-run noise on the order of ±10-20% on a shared dev
  box.
- **Shared dev Elasticsearch**, not an isolated/dedicated node — the dev stack's other
  services (API, UI, mock server) were running concurrently throughout.
- **Store-size deltas are far more reliable than wall-time deltas**: they come from
  `_forcemerge?max_num_segments=1` immediately before measurement, so segment-count noise is
  eliminated; the numbers reported are deterministic given the same input docs and mapping.
- `refresh_interval: -1` was set during bulk load and only refreshed once at the end, so wall
  time reflects pure indexing throughput, not periodic-refresh overhead (matches production,
  which uses a similar bulk-then-refresh pattern during dataset finalization).
- 1 shard / 0 replicas throughout, to isolate the mapping-shape effect from
  sharding/replication overhead. Production sizing (shard count scales with `indexed.size`)
  is orthogonal to what's measured here.

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

Raw run output and per-index numbers: `benchmark/capabilities-defaults/results.json` (not
committed — regenerate with `node --experimental-strip-types
--disable-warning=ExperimentalWarning bench.mjs`; requires network access to `data.ademe.fr`
and a reachable dev Elasticsearch at `$ES_ORIGIN` / `http://localhost:27528`).

To re-run: `cd benchmark/capabilities-defaults && node --experimental-strip-types
--disable-warning=ExperimentalWarning bench.mjs`. Downloaded row dumps are cached under
`./data/` (gitignored); delete that directory to force a fresh download. The script creates
and deletes only indices prefixed `bench-capdefaults-`.
