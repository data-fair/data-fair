# Catalog search — evidence from three live catalogs (2026-09-16)

Spike run before designing the catalog-search work on `feat-better-catalog-search`. The question:
which of the proposed levers (index language, calculated `_searchText` from the schema, a shadow
content field, agent/MCP graph exploration) actually move catalog search, and by how much.

Scripts in this directory are throwaway but reproducible: `pull-corpus.mjs` → `stats.mjs`,
`locate-terms.mjs`, `live-queries.mjs`, `mongo-ab.mjs` (needs a Mongo, uses its own scratch
database), `mcp-probe.mjs`. `queries.json` is the judged query set, `shadow.json` the simulated
shadow content.

## Setup

- Corpus: the full public catalogs of **opendata.koumoul.com** (103 datasets), **data.ademe.fr**
  (195) and **opendata.enedis.fr** (135), pulled through `/data-fair/api/v1/catalog/datasets`.
- Query set: 56 French queries (23 / 18 / 15) with expected datasets, written by hand after locating
  where each term lives in the corpus (`locate-terms.mjs`). Each query tests one thing:
  `prose` (control), `stopwords` (natural phrasing), `stemming`, `colText` (only in column
  titles/descriptions), `enum` (only in enum values), `gap` (nowhere in existing content).
- Engine: the real MongoDB `$text` index, rebuilt in a scratch database per variant, with the
  production field list and weights (`api/src/mongo.ts:67`, owner names left out as they are constant
  within a catalog). Variants: index language × extra indexed content × simulated shadow field.
- Metrics: hit@1, hit@5, MRR over the top 10, and the median result count (how much of the catalog a
  query drags in).

**Validation:** the `base_en` variant reproduces the live production numbers exactly on all three
catalogs (same hit@1 / hit@5 / MRR / median count), so the other variants measure real engine
behaviour, not an approximation.

## Caveats

- No query logs exist; the query set is authored, not observed. 56 queries on catalogs of 100–200
  datasets: differences of one or two hits are noise, the trends across three catalogs are not.
- The shadow content is hand-written (`shadow.json`, ~10 datasets per catalog): an upper bound on
  what an assistant would generate, and a *partial* rollout, which is what a real catalog will look
  like.
- Low fill rates below are a completeness signal, not a verdict on the lever: the target is a fully
  curated catalog, with decent behaviour on a barebones one.

## 1. The index language is wrong, and it is the cheapest fix

`api/src/mongo.ts:67` declares no `default_language`, so the catalog index runs MongoDB's
**English** stemmer and stopword list. Live, on all three catalogs:

| bare query | koumoul (103) | ademe (195) | enedis (135) |
|---|---|---|---|
| `q=de` | 103 | 192 | 135 |
| `q=à` | 88 | 174 | 126 |
| `q=les` | 101 | 180 | 122 |
| `q=the` | 0 | 0 | 0 |

With `default_language: 'french'` those four go to 0 (scratch index, koumoul). On phrased queries the
result count collapses while the expected dataset stays on top: "prix des carburants" 102 → 5,
"les lignes à moyenne tension" 135 → 29, "la composition des ordures ménagères" unranked/190 → #3/32,
"pompes à chaleur" #2/174 → #1/35. The French stemmer also rescues derivations ("hôpital" →
"hôpitaux", 0 → 1 result). One mild regression: "raccordements" broadens to "raccordé(es)" and
drops from #5 to #7.

An index option change rebuilds the index at next start (lib-node `ensureIndex` drops and recreates on
conflict). The switch changes tokenization for every catalog, so existing `q=` tests may need
adjusting.

## 2. Mongo has no IDF — the ceiling of this engine

`$text` scores by term frequency and field weight only. On "la liste des maires de France" (French
index) `rne-maire` ranks #5 behind four datasets that merely have *liste* or *France* in their title
(weight 3). No amount of indexed content fixes this; only an engine with IDF (Elasticsearch) or
query-side heuristics would. Every lever below works *within* this ceiling: they add the right
tokens to the right documents, they cannot make generic title words count less.

## 3. What the corpus carries today (coverage)

| | koumoul | ademe | enedis |
|---|---|---|---|
| summary | 100% | 20% | 100% |
| description | 100% | 100% | 100% |
| keywords | 31% | 100% | 100% |
| topics | 99% | 99% | 100% |
| relatedDatasets | 13% | 3% | **90%** |
| ≥1 column with enum | 92% | 97% | 55% |
| ≥1 column title ≠ key | 82% | 33% | 24% |
| ≥1 column description | 56% | 39% | 10% |
| ≥1 column concept | 96% | 62% | 34% |

Two readings. ADEME uses `keywords` as thematic tags ("Bâtiment", "Transports - Mobilité"): it is a
facet, not a synonym bag, which is why synonyms cannot live there. Enedis fills `relatedDatasets` on
90% of its datasets: the graph exists on a curated catalog and is invisible to agents today.

Vocabulary gain, on datasets carrying the content: column titles/descriptions bring 72–78% terms
absent from the prose; enum values bring 93–95% novel terms but 54–68% of them are numeric or
code-like (`true`/`false`, codes, thresholds) and one ADEME dataset carries 2 908 enum values.

## 4. Real-engine A/B — the judged queries

MRR / hit@5 / median result count. `cols` = column titles + descriptions in `_searchText`,
`keys` = column keys added, `enums` = string enum values added, `shadow` = simulated shadow field
(weight 1, or 3 for `shadow3`), `_fr` / `_en` = index language.

| variant | koumoul (23 q) | ademe (18 q) | enedis (15 q) |
|---|---|---|---|
| **base_en** (= production) | 0.59 / 16 / 2 | 0.51 / 11 / 17 | 0.68 / 11 / 5 |
| base_fr | 0.69 / 17 / 3 | 0.55 / 12 / 17 | 0.68 / 10 / 5 |
| cols_en | 0.73 / 19 / 4 | 0.62 / 13 / 19 | 0.68 / 11 / 5 |
| cols_fr | 0.86 / 20 / 5 | 0.67 / 14 / 19 | 0.68 / 10 / 5 |
| colskeys_fr | 0.86 / 20 / 5 | 0.67 / 14 / 19 | 0.68 / 10 / 5 |
| enums_fr | 0.82 / 21 / 4 | 0.73 / 15 / 21 | 0.69 / 11 / **16** |
| all_fr (cols+keys+enums) | 0.91 / 22 / 6 | 0.82 / 17 / 22 | 0.66 / 11 / **16** |
| shadow_fr | 0.91 / 22 / 3 | 0.87 / 18 / 17 | 0.83 / 13 / 5 |
| shadowcols_fr | 0.92 / 21 / 5 | 0.90 / 18 / 19 | 0.83 / 13 / 5 |
| **shadow3cols_fr** | 0.92 / 21 / 5 | **0.96** / 18 / 19 | **0.91** / 14 / 5 |

By kind, the levers behave as designed and do not interfere much:

- `colText` queries (HLM, fauteuil roulant, pharmacie, médecin, artisan): 1/5 → 5/5 on koumoul and
  0/1 → 1/1 on ADEME as soon as column labels are indexed, at rank 1 almost every time.
- `enum` queries (bénévole, hôtel, camping, compost, solaire): only enum indexing finds them
  (ADEME 1/4 → 4/4). The precision traps mostly held (`artisan` drops to #6 with enums alone but is
  back to #1 once column labels are there too; `bac S` stays #1). The cost is elsewhere: on Enedis,
  where enums are filière/segment codes repeated across dozens of datasets, the median result count
  triples (5 → 16) for one extra hit, and `haute tension` goes from 11 to 37 results.
- `keys` add nothing anywhere (`colskeys_fr` ≡ `cols_fr`): titles already carry the vocabulary,
  keys are slugs of them. Drop.
- `gap` queries (élections, panne, transformateur, passoire thermique, panneaux solaires,
  voiture électrique): no indexing of existing content finds them; the shadow field does
  (Enedis 1/4 → 3/4, ADEME 1/3 → 3/3), with the result count unchanged because it only adds tokens
  where it is filled.
- Shadow weight 3 vs 1: four queries improve, none regress, counts identical. The case for a title-
  like weight is the missing IDF: "voiture électrique" on Enedis is lost at weight 1 because
  *électrique* sits in 60 titles at weight 3, and found at #1 at weight 3.

### 4b. Closing the IDF gap inside Mongo: query-time df stripping

Catalogs are small enough to ask the engine itself how common each query term is (one
`countDocuments` per term, cacheable per catalog). Variant `shadow3cols_fr_df` drops a term from
the query when it matches more than 30% of the catalog and at least one rarer term remains.

| | shadow3cols_fr | + df strip | ES shadowcols |
|---|---|---|---|
| koumoul | 0.92 / 21 / 5 | **0.94 / 23 / 4** | 0.94 / 23 / 5 |
| ademe | 0.96 / 18 / 19 | 0.96 / 18 / 19 | 0.85 / 17 / 21 |
| enedis | 0.91 / 14 / 5 | 0.91 / 14 / 5 | 0.88 / 15 / 5 |

It fixes precisely the generic-word class ES was winning: "la liste des maires de France" #8 → #1
(91 → 38 results), "quels sont les établissements scolaires" #10 → #3 (32 → 4), and it shrinks the
result sets of phrased queries everywhere ("le nombre de points de charge par département" 112 →
58, "voiture électrique" on Enedis 60 → 2). One regression, "bac S" #1 → #3: *bac* is frequent in
census column titles and the lone *S* is left; ignoring one-character terms would avoid it.
Cost: ~30 lines and one cached count per distinct term.

## 5. The MCP surface today

`opendata.koumoul.com/mcp-server/datasets/mcp` runs `@data-fair/mcp` 0.7.6 (ADEME and Enedis expose
no MCP endpoint). Tools: `list_datasets(q, page, size)`, `describe_dataset`, `search_data`,
`aggregate_data`, `get_field_values`, `calculate_metric`, `geocode_address`. No facets, no
topic/concept filter, no `relatedDatasets`. Through it, "les entreprises de la région" returns all
103 datasets with unrelated top hits — the stopword problem lands directly in the agent's context.

## Recommendations

1. **Switch the catalog index to French now.** One line, rebuilds itself, removes the most visible
   defect (whole-catalog matches on any phrased query) and helps the agents immediately. Ship
   independently of the rest.
2. **Shadow content field, indexed at weight 3, assistant-filled.** The largest measured lift and the
   only lever for vocabulary gaps. Free text, not displayed, not a facet — which is exactly why it
   cannot be `keywords`. Weight 3 rather than 1, because Mongo has no IDF.
3. **`_searchText` from column titles + descriptions, on by default.** Second-largest lift on the two
   catalogs that annotate their schema; harmless on the one that doesn't. Skip column keys (no
   measured value). It is what the AI schema annotator already produces, so it compounds with
   completeness work.
4. **Enum values: opt-in, not default.** Real recall on categorical catalogs, real noise on
   code-heavy ones, plus the permission exposure (enum values are data). A per-organization switch
   with a disclaimer, off by default, matches the evidence.
5. **Agents: expose what the curated catalogs already have.** `relatedDatasets` (90% filled on
   Enedis), `topics`/concept filters and facets on `list_datasets`, in the shared `agent-tools` so the
   in-app assistant and the MCP server both get them.
6. **Say the ceiling out loud in the architecture doc.** Without IDF, generic title words will keep
   outranking topical matches. That is the honest boundary of the Mongo approach and the concrete
   trigger for an Elasticsearch-backed catalog index later.
