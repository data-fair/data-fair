import { es, resetIndex, bulkIndex, finding, ANALYSIS_SETTINGS, assert } from './es.ts'

// OUTCOME (do not re-derive the wrong conclusion from the framing below): the global `_prefix`
// field priced here was REJECTED. Not on cost — on capability: highlight registration is
// per-column (`esQuery.highlight.fields[<key>.prefix]`, see es/commons.ts), and a single shared
// field cannot tell the caller WHICH column matched. The shipped shape is a per-column `.prefix`
// companion on language columns only (`index_options:'docs', norms:false`, see esProperty). The
// two questions below (index_options tiering, always-on vs gated) were priced for the global
// variant and remain useful evidence, not a live decision.
//
// Follow-up to Spike G (see `## Spike G` in
// docs/superpowers/specs/2026-08-03-indexing-rework-phase0-results.md and
// dev/spikes/indexing-rework/spike-g-prefix-options.ts). Spike G's variant d (GLOBAL CATCH-ALL,
// copy_to a shared `_prefix` field with `index_options:'docs', norms:false`) cost +10.3% vs a
// no-prefix baseline. Two design calls need pricing before a decision:
//
// (A) The global field should ideally preserve TODAY's real full-text scoring (BM25 relevance),
//     not the deliberately lossy `docs`/no-norms shape — positions are only needed for
//     phrase/proximity queries, which this field never serves (it only ever gets a
//     `simple_query_string "<p>*"` prefix query). So price `docs` vs `freqs`(+norms) vs `full`
//     (ES defaults) for BOTH disk cost and actual ranking-quality impact.
// (B) Consider ALWAYS creating the global field, not just past the `hasManyQSearchFields` /
//     `Q_SEARCH_FIELDS_THRESHOLD` wide-dataset gate — price the always-on cost on a NARROW
//     (4-column) dataset, the case that currently pays nothing, and compare against today's
//     per-column `.text`+`.text_standard` duplication shape for context.
//
// Two harness traps from Spike G apply here too:
//  - `simple_query_string` silently DROPS leading-wildcard terms (returns 0, no error) — we only
//    ever use trailing wildcards ("<p>*") here, never leading, so this doesn't bite, but every
//    probe below still asserts hits > 0 to catch silent zero-result failures of any kind.
//  - Querying a field absent from a mapping silently returns 0, not an error — the ranking probes
//    below assert both a nonzero hit count AND (for the controlled probe query) the exact expected
//    id set, so a query silently missing its field would be caught immediately.

// ---------------------------------------------------------------------------------------------
// Corpus: SAME generator as Spike G (verbatim) — 50k docs, title 3-6 words, description ~30 words,
// built from the same 40-word French morphology vocabulary, so the "config*" prefix behaves
// identically to what Spike G already characterized (custom_french stems configuration(s) to
// "configu", configurer/configurée to "configur" — irrelevant here since `_prefix` uses the
// `standard` analyzer, not `custom_french`, but kept for corpus parity with Spike G).
// ---------------------------------------------------------------------------------------------

const VOCAB = [
  'configuration', 'configurations', 'configurer', 'configurée',
  'publication', 'publications', 'publier', 'publiée',
  'commune', 'communes',
  'transporteur', 'transporteurs', 'transport', 'transports',
  'école', 'écoles', 'scolaire',
  'donnée', 'données',
  'ministère', 'ministères',
  'région', 'régions', 'régional',
  'budget', 'budgets',
  'projet', 'projets',
  'contrat', 'contrats',
  'habitant', 'habitants',
  'surface', 'surfaces',
  'service', 'services',
  'marché', 'marchés',
  'département', 'départements'
]

const sentence = (n: number, seed: number) => Array.from({ length: n }, (_, i) => VOCAB[(seed * 7 + i * 13) % VOCAB.length]).join(' ')
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const N = 50_000

function buildTitle (i: number): string {
  if (i % 7 === 0) return `Configurations avancées du système régional numéro ${i}`
  if (i % 101 === 0) return `Transporteurs publics de la région numéro ${i}`
  if (i % 13 === 0) return `Service régional des transporteurs publics ${i}`
  if (i % 29 === 0) return `Nouvelles données publications officielles ${i}`
  const n = 3 + (i % 4)
  const words = sentence(n, i).split(' ')
  return words.map((w, idx) => idx === 0 ? capitalize(w) : w).join(' ')
}

function buildDescription (i: number): string {
  const words = Array.from({ length: 30 }, (_, k) => VOCAB[(i * 7 + k * 13) % VOCAB.length])
  if (i % 11 === 0) { words[5] = 'données'; words[6] = 'publications' }
  if (i % 997 === 0) { words[0] = 'données'; words[1] = 'publications' }
  return words.join(' ')
}

const organicDocs = Array.from({ length: N }, (_, i) => ({ id: `rec-${i}`, title: buildTitle(i), description: buildDescription(i) }))

// ---------------------------------------------------------------------------------------------
// Ranking-quality probes: deterministic docs of DIFFERING length, all matching "config*" via a
// literal "Configuration" token, so the ranking test in section 2 has a clean, controlled ladder
// to check "do SHORT values outrank LONG values" (what norms buy) independent of organic-corpus
// noise. Title is held constant ("Fiche") across all probes so it never contributes extra length
// or extra matches; all variation lives in `description`.
//   - LENGTH_LADDER: fixed term-frequency (3 occurrences of "Configuration"), length 5..320 words
//     -> isolates the length-normalization (norms) effect.
//   - TF_LADDER: fixed length (40 words), term-frequency 1/3/10 occurrences ("...tf-3" reuses the
//     length-40 length-ladder probe) -> isolates the term-frequency effect.
// ---------------------------------------------------------------------------------------------

const NONCONFIG_VOCAB = VOCAB.filter(w => !w.toLowerCase().startsWith('config'))
const fillerWords = (n: number, seed: number) => Array.from({ length: n }, (_, k) => NONCONFIG_VOCAB[(seed * 11 + k * 17) % NONCONFIG_VOCAB.length])

function buildRankProbe (id: string, totalWords: number, repeatCount: number) {
  const filler = fillerWords(Math.max(0, totalWords - repeatCount), id.length * 13 + totalWords)
  const words = [...Array.from({ length: repeatCount }, () => 'Configuration'), ...filler]
  return { id, title: 'Fiche', description: words.join(' ') }
}

const LENGTH_LADDER = [5, 10, 20, 40, 80, 160, 320]
const rankLenProbes = LENGTH_LADDER.map(n => buildRankProbe(`rank-len-${n}`, n, 3))
const rankTfProbes = [1, 10].map(tf => buildRankProbe(`rank-tf-${tf}`, 40, tf))
const rankProbes = [...rankLenProbes, ...rankTfProbes]
const RANK_PROBE_IDS = rankProbes.map(p => p.id)

const docs = [...organicDocs, ...rankProbes]

// ---------------------------------------------------------------------------------------------
// Section 1 — SIZE/COST VARIANTS
// ---------------------------------------------------------------------------------------------

const baseSettings = { analysis: ANALYSIS_SETTINGS, number_of_replicas: 0 }

const fieldTextOnly = (copyTo?: string) => ({
  type: 'keyword',
  ignore_above: 200,
  ...(copyTo ? { copy_to: copyTo } : {}),
  fields: { text: { type: 'text', analyzer: 'custom_french' } }
})

// The three `_prefix` shapes under test. "full" omits index_options/norms entirely so ES applies
// its text-field defaults (index_options: 'positions', norms: true) -- i.e. identical to today's
// global full-text field shape, scoped to this one field.
const PREFIX_FIELD: Record<string, any> = {
  docs: { type: 'text', analyzer: 'standard', index_options: 'docs', norms: false },
  freqs: { type: 'text', analyzer: 'standard', index_options: 'freqs', norms: true },
  full: { type: 'text', analyzer: 'standard' }
}

const sizeVariants: Record<string, any> = {
  'spike-h-nopfx': {
    settings: baseSettings,
    mappings: { properties: { id: { type: 'keyword' }, title: fieldTextOnly(), description: fieldTextOnly() } }
  },
  'spike-h-docs': {
    settings: baseSettings,
    mappings: { properties: { id: { type: 'keyword' }, title: fieldTextOnly('_prefix'), description: fieldTextOnly('_prefix'), _prefix: PREFIX_FIELD.docs } }
  },
  'spike-h-freqs': {
    settings: baseSettings,
    mappings: { properties: { id: { type: 'keyword' }, title: fieldTextOnly('_prefix'), description: fieldTextOnly('_prefix'), _prefix: PREFIX_FIELD.freqs } }
  },
  'spike-h-full': {
    settings: baseSettings,
    mappings: { properties: { id: { type: 'keyword' }, title: fieldTextOnly('_prefix'), description: fieldTextOnly('_prefix'), _prefix: PREFIX_FIELD.full } }
  }
}

// ---------------------------------------------------------------------------------------------
// Section 3 — ALWAYS-ON COST on a NARROW (4-column) dataset
// ---------------------------------------------------------------------------------------------

const NARROW_COLS = ['col1', 'col2', 'col3', 'col4']

const narrowFieldNoPfx = () => ({ type: 'keyword', ignore_above: 200, fields: { text: { type: 'text', analyzer: 'custom_french' } } })
const narrowFieldFreqs = () => ({ type: 'keyword', ignore_above: 200, copy_to: '_prefix', fields: { text: { type: 'text', analyzer: 'custom_french' } } })
const narrowFieldToday = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: { text: { type: 'text', analyzer: 'custom_french' }, text_standard: { type: 'text', analyzer: 'standard' } }
})

function buildNarrowDoc (i: number) {
  const doc: any = { id: `nrec-${i}` }
  NARROW_COLS.forEach((col, ci) => {
    const n = 3 + ((i + ci) % 4)
    doc[col] = capitalize(sentence(n, i * 31 + ci * 997))
  })
  return doc
}
const narrowDocs = Array.from({ length: N }, (_, i) => buildNarrowDoc(i))

const narrowVariants: Record<string, any> = {
  'spike-h-narrow-nopfx': {
    settings: baseSettings,
    mappings: { properties: { id: { type: 'keyword' }, ...Object.fromEntries(NARROW_COLS.map(c => [c, narrowFieldNoPfx()])) } }
  },
  'spike-h-narrow-freqs': {
    settings: baseSettings,
    mappings: { properties: { id: { type: 'keyword' }, ...Object.fromEntries(NARROW_COLS.map(c => [c, narrowFieldFreqs()])), _prefix: PREFIX_FIELD.freqs } }
  },
  'spike-h-narrow-today': {
    settings: baseSettings,
    mappings: { properties: { id: { type: 'keyword' }, ...Object.fromEntries(NARROW_COLS.map(c => [c, narrowFieldToday()])) } }
  }
}

// ---------------------------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------------------------

const builtIndices: string[] = []

async function buildIndex (name: string, def: any, docSet: any[]) {
  await resetIndex(name, def)
  const t0 = performance.now()
  await bulkIndex(name, docSet)
  await es('POST', `/${name}/_forcemerge?max_num_segments=1`)
  finding(`${name} bulk+merge ${(performance.now() - t0).toFixed(0)}ms for ${docSet.length} docs`)
  builtIndices.push(name)
}

async function storeSize (name: string): Promise<number> {
  const stats = await es('GET', `/${name}/_stats/store`)
  return stats.indices[name].primaries.store.size_in_bytes
}

async function prefixDiskUsage (name: string): Promise<any> {
  const du = await es('POST', `/${name}/_disk_usage?run_expensive_tasks=true`)
  return du[name].fields._prefix
}

async function count (index: string, query: any): Promise<number> {
  const res = await es('POST', `/${index}/_count`, { query })
  return res.count
}

async function search (index: string, query: any, size: number): Promise<any[]> {
  // NB: ES's own `_id` is a random auto-generated bulk id (the harness's bulkIndex doesn't pin
  // `_id`), so it differs across the docs/freqs/full indices even for the "same" logical document.
  // Cross-variant comparisons (Kendall tau below) must key off the document's own `id` field
  // instead, which is identical content across all variant indices -- always include it in _source.
  const res = await es('POST', `/${index}/_search`, { query, size, _source: ['id', 'title', 'description'] })
  return res.hits.hits
}

function wordLen (s: string): number { return s.trim().length ? s.trim().split(/\s+/).length : 0 }

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

try {
  // ---- Section 1: build size/cost variants ----
  for (const [name, def] of Object.entries(sizeVariants)) {
    await buildIndex(name, def, docs)
  }

  const sizes: Record<string, number> = {}
  for (const name of Object.keys(sizeVariants)) {
    sizes[name] = await storeSize(name)
    finding(`${name} store size ${(sizes[name] / 1e6).toFixed(2)} MB`)
  }
  const baseline = sizes['spike-h-nopfx']
  for (const name of ['spike-h-docs', 'spike-h-freqs', 'spike-h-full']) {
    const deltaPct = ((sizes[name] - baseline) / baseline) * 100
    finding(`${name} store size delta vs spike-h-nopfx: ${(sizes[name] - baseline) >= 0 ? '+' : ''}${(sizes[name] - baseline)}B (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`)
  }

  const prefixDU: Record<string, any> = {}
  for (const name of ['spike-h-docs', 'spike-h-freqs', 'spike-h-full']) {
    const f = await prefixDiskUsage(name)
    prefixDU[name] = f
    finding(`${name} field _prefix total=${f.total_in_bytes}B inverted_index=${f.inverted_index.total_in_bytes}B stored_fields=${f.stored_fields_in_bytes}B doc_values=${f.doc_values_in_bytes}B norms=${f.norms_in_bytes}B`)
  }
  // ES's _disk_usage does not split `inverted_index` further into terms/postings/positions -- derive
  // the positions- and freq-count-specific cost by subtraction across the three variants that differ
  // by exactly one index_options step each. norms_in_bytes IS reported directly (OBSERVED) per variant.
  const invDocs = prefixDU['spike-h-docs'].inverted_index.total_in_bytes
  const invFreqs = prefixDU['spike-h-freqs'].inverted_index.total_in_bytes
  const invFull = prefixDU['spike-h-full'].inverted_index.total_in_bytes
  finding(`_prefix inverted_index breakdown (INFERRED by subtraction): freq-counts cost (freqs - docs) = ${invFreqs - invDocs}B; positions cost (full - freqs) = ${invFull - invFreqs}B`)
  finding(`_prefix norms cost (OBSERVED, norms_in_bytes directly): docs=${prefixDU['spike-h-docs'].norms_in_bytes}B freqs=${prefixDU['spike-h-freqs'].norms_in_bytes}B full=${prefixDU['spike-h-full'].norms_in_bytes}B`)

  // ---- Section 2: ranking-quality comparison ----
  // 2a. LITERAL query shape q_mode=complete actually emits.
  const RANK_VARIANTS = ['spike-h-docs', 'spike-h-freqs', 'spike-h-full']
  const literalQuery = (field: string) => ({ simple_query_string: { query: 'config*', fields: [field] } })
  const top10Literal: Record<string, any[]> = {}
  for (const name of RANK_VARIANTS) {
    const hits = await search(name, literalQuery('_prefix'), 10)
    assert(hits.length > 0, `${name} full-corpus "config*" query on _prefix returned 0 hits -- field not actually hit`)
    top10Literal[name] = hits
    finding(`${name} LITERAL-QUERY full-corpus top10 "config*" on _prefix: ` + hits.map((h: any, i: number) =>
      `#${i + 1} id=${h._source.id} score=${h._score.toFixed(4)} len=${wordLen(h._source.title) + wordLen(h._source.description)}w`).join(' | '))
    const scores = hits.map((h: any) => h._score)
    const spread = (Math.max(...scores) - Math.min(...scores)) / Math.max(...scores)
    finding(`${name} LITERAL-QUERY top10 score spread: max=${Math.max(...scores).toFixed(4)} min=${Math.min(...scores).toFixed(4)} relativeSpread=${(spread * 100).toFixed(1)}% (near-flat if small)`)
  }
  // DECISIVE DISCOVERY, made while building this section (not anticipated going in): ES's default
  // rewrite method for the PrefixQuery that `simple_query_string "<p>*"` compiles down to is Lucene's
  // constant-score rewrite -- every match gets an identical score of exactly 1.0, REGARDLESS of the
  // field's index_options/norms. Confirmed via `_explain` on a 2-doc probe index (one short, one 30x
  // longer, same term-frequency): explanation was literally `{"value":1.0,"description":"_prefix:config*","details":[]}`
  // for both docs, on a norms:true/freqs field. This means TODAY's literal q_mode=complete query shape
  // gets ZERO ranking benefit from freqs or full's extra disk spend -- the query, not just the field,
  // would need to change (e.g. an explicit scoring `rewrite` param) to realize any of it. Verified this
  // isn't a fluke of the 50k corpus specifically -- see the isolated 2-doc repro in the report.
  finding('DISCOVERY: simple_query_string "<p>*" compiles to a Lucene PrefixQuery with the default constant_score rewrite -- every match scores exactly 1.0 regardless of index_options/norms on the target field. Confirmed via _explain: {"value":1.0,"description":"_prefix:config*","details":[]} identically for a 3-word doc and a 30x-longer doc on a norms:true/freqs-indexed field. Implication: TODAY\'S LITERAL q_mode=complete query gets NO ranking benefit from freqs/full -- the query shape itself, not just the mapping, would need to change (e.g. an explicit scoring `rewrite`) to realize any BM25 differentiation.')

  // 2b. SUPPLEMENTARY probe: what freqs/full WOULD buy if the query opted into real scoring instead of
  // the default constant-score rewrite. NOT what q_mode=complete emits today -- built purely to isolate
  // whether the mapping-side investment (freqs/norms) has any scoring payoff available to it at all.
  // `wildcard` query with `rewrite: scoring_boolean` forces Lucene to score each matched term normally
  // (BM25-style) instead of constant-scoring the whole clause.
  const scoredQuery = (field: string) => ({ wildcard: { [field]: { value: 'config*', rewrite: 'scoring_boolean' } } })
  const top10Scored: Record<string, any[]> = {}
  for (const name of RANK_VARIANTS) {
    const hits = await search(name, scoredQuery('_prefix'), 10)
    assert(hits.length > 0, `${name} SCORED full-corpus "config*" query on _prefix returned 0 hits -- field not actually hit`)
    top10Scored[name] = hits
    finding(`${name} SCORED(rewrite=scoring_boolean) full-corpus top10 "config*" on _prefix: ` + hits.map((h: any, i: number) =>
      `#${i + 1} id=${h._source.id} score=${h._score.toFixed(4)} len=${wordLen(h._source.title) + wordLen(h._source.description)}w`).join(' | '))
    const scores = hits.map((h: any) => h._score)
    const spread = (Math.max(...scores) - Math.min(...scores)) / Math.max(...scores)
    finding(`${name} SCORED top10 score spread: max=${Math.max(...scores).toFixed(4)} min=${Math.min(...scores).toFixed(4)} relativeSpread=${(spread * 100).toFixed(1)}% (near-flat if small)`)
  }
  // Tie-density check: the organic 50k corpus is built from a small fixed vocabulary, so many docs
  // share the exact same (length, term-frequency) shape for "config*" and therefore the exact same
  // BM25 score -- explains why the SCORED top10 ids above don't overlap across variants (Kendall tau
  // over a tie-dominated top10 is noise, not signal; see controlled ladder probe below for the real
  // evidence). Confirm by counting how many of the top 200 hits share the max score.
  for (const name of RANK_VARIANTS) {
    const top200 = await search(name, scoredQuery('_prefix'), 200)
    const maxScore = top200[0]._score
    const tiedCount = top200.filter((h: any) => Math.abs(h._score - maxScore) < 1e-6).length
    finding(`${name} SCORED tie-density check: ${tiedCount}/200 of the top-200 hits share the exact max score (${maxScore.toFixed(4)}) -- top10 comparisons above are tie-break artifacts, not ranking disagreement, whenever this is high`)
  }

  // Kendall-tau-like agreement of docs/freqs top10 ordering vs full's top10 as reference, computed on
  // the SCORED runs (the literal-query runs are all-tied at 1.0, so their "ordering" is an artifact of
  // ES's internal tie-break, not a meaningful ranking -- comparing tau on ties would be noise, not
  // signal). Method: restrict both orderings to the intersection of ids (keyed by the document's own
  // `id` field, not ES's random per-index `_id`), then count concordant vs discordant pairs relative to
  // the reference (full) order; tau = (concordant - discordant) / (concordant + discordant).
  function kendallTauVsReference (referenceIds: string[], variantIds: string[]) {
    const varIndex = new Map(variantIds.map((id, i) => [id, i]))
    const common = referenceIds.filter(id => varIndex.has(id))
    let concordant = 0; let discordant = 0
    for (let i = 0; i < common.length; i++) {
      for (let j = i + 1; j < common.length; j++) {
        if (varIndex.get(common[i])! < varIndex.get(common[j])!) concordant++
        else discordant++
      }
    }
    const pairs = concordant + discordant
    return { overlapCount: common.length, common, tau: pairs > 0 ? (concordant - discordant) / pairs : null, pairs }
  }
  const fullScoredIds = top10Scored['spike-h-full'].map((h: any) => h._source.id)
  for (const name of ['spike-h-docs', 'spike-h-freqs']) {
    const variantIds = top10Scored[name].map((h: any) => h._source.id)
    const r = kendallTauVsReference(fullScoredIds, variantIds)
    finding(`${name} vs spike-h-full SCORED top10 agreement (method: pairwise concordance on the id-intersection, ordered by reference rank): overlap=${r.overlapCount}/10 common ids=[${r.common.join(',')}] tau=${r.tau === null ? 'n/a (fewer than 2 common ids)' : r.tau.toFixed(2)}`)
  }

  // Controlled ladder probe (SCORED query): restrict the scored "config*" / _prefix query to exactly
  // our 9 designed probe docs (via `terms` filter on id), so length- and tf-effects are read cleanly
  // without organic-corpus noise. Assert we get back exactly the 9 probes -- catches a silently-missed
  // field. Also run the LITERAL query shape on the same probe set for a direct before/after contrast.
  for (const name of RANK_VARIANTS) {
    const literalHits = await search(name, {
      bool: { must: literalQuery('_prefix'), filter: { terms: { id: RANK_PROBE_IDS } } }
    }, RANK_PROBE_IDS.length)
    assert(literalHits.length === RANK_PROBE_IDS.length, `${name} LITERAL controlled ladder probe expected ${RANK_PROBE_IDS.length} hits, got ${literalHits.length} -- probes not all matched`)
    const literalRanked = literalHits.map((h: any) => ({ id: h._source.id, score: h._score, words: wordLen(h._source.description) })).sort((a: any, b: any) => b.score - a.score)
    finding(`${name} LITERAL controlled ladder probe ranking (id:score:descriptionWords, sorted by score desc): ` + literalRanked.map((r: any) => `${r.id}:${r.score.toFixed(4)}:${r.words}w`).join(' | '))

    const hits = await search(name, {
      bool: { must: scoredQuery('_prefix'), filter: { terms: { id: RANK_PROBE_IDS } } }
    }, RANK_PROBE_IDS.length)
    assert(hits.length === RANK_PROBE_IDS.length, `${name} SCORED controlled ladder probe expected ${RANK_PROBE_IDS.length} hits, got ${hits.length} -- probes not all matched`)
    const ranked = hits.map((h: any) => ({ id: h._source.id, score: h._score, words: wordLen(h._source.description) }))
      .sort((a: any, b: any) => b.score - a.score)
    finding(`${name} SCORED controlled ladder probe ranking (id:score:descriptionWords, sorted by score desc): ` + ranked.map((r: any) => `${r.id}:${r.score.toFixed(4)}:${r.words}w`).join(' | '))
    // length-ladder-only view (tf fixed at 3): does score strictly decrease as length increases?
    const lenOnly = ranked.filter((r: any) => r.id.startsWith('rank-len-')).sort((a: any, b: any) => a.words - b.words)
    let monotonicDecreasing = true
    for (let i = 1; i < lenOnly.length; i++) if (lenOnly[i].score > lenOnly[i - 1].score) monotonicDecreasing = false
    finding(`${name} SCORED length-ladder (tf fixed=3) short-outranks-long check, ascending length order: ` + lenOnly.map((r: any) => `${r.words}w=${r.score.toFixed(4)}`).join(' | ') + ` -> strictly monotonic decreasing (short always beats long) = ${monotonicDecreasing}`)
  }

  // ---- Section 3: always-on narrow-dataset cost ----
  for (const [name, def] of Object.entries(narrowVariants)) {
    await buildIndex(name, def, narrowDocs)
  }
  const narrowSizes: Record<string, number> = {}
  for (const name of Object.keys(narrowVariants)) {
    narrowSizes[name] = await storeSize(name)
    finding(`${name} store size ${(narrowSizes[name] / 1e6).toFixed(2)} MB`)
  }
  const narrowBaseline = narrowSizes['spike-h-narrow-nopfx']
  for (const name of ['spike-h-narrow-freqs', 'spike-h-narrow-today']) {
    const deltaPct = ((narrowSizes[name] - narrowBaseline) / narrowBaseline) * 100
    finding(`${name} store size delta vs spike-h-narrow-nopfx: ${(narrowSizes[name] - narrowBaseline) >= 0 ? '+' : ''}${(narrowSizes[name] - narrowBaseline)}B (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`)
  }
  // sanity: confirm the narrow-freqs global field actually matches across all 4 columns, not just one
  const narrowHits = await count('spike-h-narrow-freqs', { simple_query_string: { query: 'config*', fields: ['_prefix'] } })
  assert(narrowHits > 0, 'spike-h-narrow-freqs "config*" on _prefix returned 0 hits -- copy_to fanout not actually hit')
  finding(`spike-h-narrow-freqs sanity: "config*" on _prefix (fed by copy_to from all 4 columns) = ${narrowHits} hits`)
} finally {
  // ---------------------------------------------------------------------------------------------
  // cleanup -- always runs, even on failure
  // ---------------------------------------------------------------------------------------------
  for (const name of builtIndices) {
    await es('DELETE', `/${name}`).catch(() => {})
  }
  console.log('spike H done')
}
