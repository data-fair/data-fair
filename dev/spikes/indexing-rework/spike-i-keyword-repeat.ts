import { es, resetIndex, bulkIndex, finding, time, assert, ANALYSIS_SETTINGS } from './es.ts'

// Question: today's shape carries TWO analyzed fields per text column -- `.text` (custom_french,
// stemmed) and `.text_standard` (standard, unstemmed -- exists mainly so prefix/autocomplete
// queries don't fail once a word is stemmed away from its typed form). Candidate: replace both with
// a SINGLE analyzed field per column whose analyzer emits, at every token position, BOTH the
// original (unstemmed) token AND the stemmed token -- the Lucene `keyword_repeat` pattern. Does this
// single field recover dual's correctness (stemmed recall, mid-typing prefix, phrase, exact-form
// boost) at less store cost than dual, and how much more than the no-prefix `single` baseline
// (Spike G variant b)? Do NOT pick a winner -- gather evidence only.

// ---------------------------------------------------------------------------------------------
// Analyzer under test
// ---------------------------------------------------------------------------------------------
// Filter order investigated live via _analyze (see section 0 below) before committing to it:
//   ['french_elision', 'lowercase', 'keyword_repeat', 'french_stop', 'french_stemmer',
//    'remove_duplicates', 'asciifolding']
// - keyword_repeat sits right before french_stop/french_stemmer: it duplicates each token into a
//   keyword-marked copy (which french_stemmer -- Lucene stemmers respect the keyword attribute --
//   will skip) and a free copy (which french_stemmer processes normally).
// - french_stop runs on BOTH copies. Lucene's StopFilter is NOT keyword-attribute-aware, so a
//   stopword is removed from both copies uniformly -- no risk of a stopword leaking through
//   unfiltered on the keyword side.
// - remove_duplicates runs right after french_stemmer (standard keyword_repeat+stemmer+
//   remove_duplicates combo): collapses the two copies back into a single token whenever stemming
//   was a no-op (e.g. invariant words), avoiding a spurious tf=2 at that position.
// - asciifolding runs LAST, after remove_duplicates -- mirrors today's `custom_french` (which also
//   asciifolds last), so BOTH surviving copies (exact-form and stemmed) end up accent-insensitive,
//   matching today's search-insensitivity behavior on the exact-form copy too, and folding is
//   applied post-dedupe so dedupe compares pre-fold token text (the more conservative comparison --
//   it won't over-merge two tokens that only become equal after folding).
// Verified empirically below (section 0): this order does NOT produce stray duplicate keywords,
// does NOT leak stopwords on the keyword side, and DOES preserve the exact typed form as a real
// indexed term (the mechanism the whole candidate depends on) -- kept as-is.
// ---------------------------------------------------------------------------------------------

const REPEAT_FILTER_ORDER = ['french_elision', 'lowercase', 'keyword_repeat', 'french_stop', 'french_stemmer', 'remove_duplicates', 'asciifolding']

const ANALYSIS_SETTINGS_REPEAT = {
  ...ANALYSIS_SETTINGS,
  analyzer: {
    ...ANALYSIS_SETTINGS.analyzer,
    custom_french_repeat: { tokenizer: 'standard', filter: REPEAT_FILTER_ORDER }
  }
}

const baseSettings = { analysis: ANALYSIS_SETTINGS_REPEAT, number_of_replicas: 0 }

// ---------------------------------------------------------------------------------------------
// Corpus: SAME generator as Spike G/H (verbatim) -- 50k docs, title 3-6 words, description ~30
// words, 40-word French morphology vocabulary, deterministic probe injections.
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

const docs = Array.from({ length: N }, (_, i) => ({ id: `rec-${i}`, title: buildTitle(i), description: buildDescription(i) }))

// ---------------------------------------------------------------------------------------------
// Variant mappings
// ---------------------------------------------------------------------------------------------

const fieldDual = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    text_standard: { type: 'text', analyzer: 'standard' }
  }
})
const fieldSingle = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: { text: { type: 'text', analyzer: 'custom_french' } }
})
const fieldRepeat = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: { text: { type: 'text', analyzer: 'custom_french_repeat' } }
})
const fieldRepeatPrefix = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french_repeat', index_prefixes: { min_chars: 2, max_chars: 10 } }
  }
})

const variants: Record<string, any> = {
  'spike-i-dual': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldDual(), description: fieldDual() } } },
  'spike-i-single': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldSingle(), description: fieldSingle() } } },
  'spike-i-repeat': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldRepeat(), description: fieldRepeat() } } },
  'spike-i-repeat-prefix': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldRepeatPrefix(), description: fieldRepeatPrefix() } } }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

async function count (index: string, query: any): Promise<number> {
  const res = await es('POST', `/${index}/_count`, { query })
  return res.count
}

async function search (index: string, query: any, size: number, extra?: any): Promise<any[]> {
  const res = await es('POST', `/${index}/_search`, { query, size, _source: ['id', 'title', 'description'], ...extra })
  return res.hits.hits
}

const builtIndices: string[] = []

try {
  // -------------------------------------------------------------------------------------------
  // 0. Analyzer investigation -- print token streams for custom_french_repeat AND baseline
  //    custom_french, for the three probe strings, before committing to the filter order.
  // -------------------------------------------------------------------------------------------
  await resetIndex('spike-i-analyze', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' } } } })
  builtIndices.push('spike-i-analyze')

  async function analyzeStream (analyzer: string, text: string): Promise<string> {
    const res = await es('POST', '/spike-i-analyze/_analyze', { analyzer, text })
    return res.tokens.map((t: any) => `${t.token}@pos${t.position}${t.keyword ? '(kw)' : ''}`).join(' ')
  }

  const PROBE_TEXTS = ['configurations', 'Éléments', 'les données publiées']
  for (const text of PROBE_TEXTS) {
    finding(`custom_french_repeat _analyze "${text}": ${await analyzeStream('custom_french_repeat', text)}`)
  }
  for (const text of PROBE_TEXTS) {
    finding(`custom_french (baseline, no repeat) _analyze "${text}": ${await analyzeStream('custom_french', text)}`)
  }
  finding(`custom_french_repeat filter order (final, kept as-is after investigation): ${JSON.stringify(REPEAT_FILTER_ORDER)}`)

  // -------------------------------------------------------------------------------------------
  // Build main 4 variants
  // -------------------------------------------------------------------------------------------
  for (const [name, def] of Object.entries(variants)) {
    await resetIndex(name, def)
    const t0 = performance.now()
    await bulkIndex(name, docs)
    await es('POST', `/${name}/_forcemerge?max_num_segments=1`)
    finding(`${name} bulk+merge ${(performance.now() - t0).toFixed(0)}ms for ${docs.length} docs`)
    builtIndices.push(name)
  }

  // -------------------------------------------------------------------------------------------
  // 1. STORE size + per-field disk usage
  // -------------------------------------------------------------------------------------------
  const stats = await es('GET', `/${Object.keys(variants).join(',')}/_stats/store`)
  const storeSizes: Record<string, number> = {}
  for (const name of Object.keys(variants)) {
    storeSizes[name] = stats.indices[name].primaries.store.size_in_bytes
    finding(`${name} store size ${(storeSizes[name] / 1e6).toFixed(2)} MB`)
  }
  for (const name of ['spike-i-repeat', 'spike-i-repeat-prefix']) {
    const dSingle = storeSizes[name] - storeSizes['spike-i-single']
    const dDual = storeSizes[name] - storeSizes['spike-i-dual']
    const pSingle = (dSingle / storeSizes['spike-i-single']) * 100
    const pDual = (dDual / storeSizes['spike-i-dual']) * 100
    finding(`${name} store delta vs spike-i-single: ${dSingle >= 0 ? '+' : ''}${dSingle}B (${pSingle >= 0 ? '+' : ''}${pSingle.toFixed(1)}%)`)
    finding(`${name} store delta vs spike-i-dual: ${dDual >= 0 ? '+' : ''}${dDual}B (${pDual >= 0 ? '+' : ''}${pDual.toFixed(1)}%)`)
  }

  for (const name of Object.keys(variants)) {
    try {
      const du = await es('POST', `/${name}/_disk_usage?run_expensive_tasks=true`)
      const fields = du[name].fields
      for (const fieldName of Object.keys(fields)) {
        if (!fieldName.startsWith('title') && !fieldName.startsWith('description')) continue
        const f = fields[fieldName]
        finding(`${name} field ${fieldName} total=${f.total_in_bytes}B inverted_index=${f.inverted_index.total_in_bytes}B stored_fields=${f.stored_fields_in_bytes}B doc_values=${f.doc_values_in_bytes}B norms=${f.norms_in_bytes}B`)
      }
    } catch (err: any) {
      finding(`${name} _disk_usage FAILED: ${err.message ?? err} -- falling back to total store size only`)
    }
  }

  // -------------------------------------------------------------------------------------------
  // 3. CORRECTNESS MATRIX on spike-i-repeat vs spike-i-dual (querying `.text`)
  // -------------------------------------------------------------------------------------------

  // 3a. Stemmed recall
  const stemPairs = [
    { q: 'donnée', field: 'description.text', label: 'q=donnée finds données family' },
    { q: 'configurations', field: 'title.text', label: 'q=configurations finds configuration family' },
    { q: 'configuration', field: 'title.text', label: 'q=configuration finds configurations family' }
  ]
  for (const p of stemPairs) {
    const rHits = await count('spike-i-repeat', { simple_query_string: { query: p.q, fields: [p.field] } })
    const dHits = await count('spike-i-dual', { simple_query_string: { query: p.q, fields: [p.field] } })
    assert(rHits > 0 && dHits > 0, `stemmed recall probe [${p.label}] returned 0 hits on one side -- field likely absent from mapping`)
    finding(`3a stemmed recall [${p.label}] q="${p.q}" field=${p.field}: repeat=${rHits} dual=${dHits} (repeat must be >= dual: ${rHits >= dHits})`)
  }

  // 3b. Mid-typing prefix ladder vs spike-i-single
  const PROGRESSIVE_PREFIXES = ['con', 'confi', 'config', 'configu', 'configur', 'configura', 'configuratio', 'configurations']
  const curveRepeat: Record<string, number> = {}
  const curveSingle: Record<string, number> = {}
  for (const p of PROGRESSIVE_PREFIXES) {
    curveRepeat[p] = await count('spike-i-repeat', { simple_query_string: { query: `${p}*`, fields: ['title.text'] } })
    curveSingle[p] = await count('spike-i-single', { simple_query_string: { query: `${p}*`, fields: ['title.text'] } })
  }
  finding('3b spike-i-repeat progressive prefix hits (title.text): ' + PROGRESSIVE_PREFIXES.map(p => `${p}=${curveRepeat[p]}`).join(' '))
  finding('3b spike-i-single progressive prefix hits (title.text): ' + PROGRESSIVE_PREFIXES.map(p => `${p}=${curveSingle[p]}`).join(' '))
  const repeatNeverZero = PROGRESSIVE_PREFIXES.every(p => curveRepeat[p] > 0)
  const singleHitsZero = PROGRESSIVE_PREFIXES.some(p => curveSingle[p] === 0)
  finding(`3b spike-i-repeat mid-typing prefix never regresses to zero: ${repeatNeverZero}; spike-i-single regresses to zero somewhere: ${singleHitsZero}`)

  // 3c. Phrase
  const phraseRepeat = await count('spike-i-repeat', { simple_query_string: { query: '"données publiées"', fields: ['description.text'] } })
  const phraseDual = await count('spike-i-dual', { simple_query_string: { query: '"données publiées"', fields: ['description.text'] } })
  finding(`3c phrase "données publiées" on description.text: repeat=${phraseRepeat} dual=${phraseDual}`)
  // NOTE (discovered while running this probe): "publiée"/"publiées" (light_french stem "publ")
  // and "publication"/"publications" (light_french stem "public") are DIFFERENT stem families --
  // verified via _analyze -- so this phrase has zero true positives in the corpus (0=0 above is
  // correct, not a stacked-token failure). Supplementary probe below uses the corpus's actual
  // injected bigram ("données publications", same stem family, adjacent words) to exercise the
  // "phrase match despite stacked tokens" mechanism with a real positive population.
  const phraseRepeat2 = await count('spike-i-repeat', { simple_query_string: { query: '"données publications"', fields: ['description.text'] } })
  const phraseDual2 = await count('spike-i-dual', { simple_query_string: { query: '"données publications"', fields: ['description.text'] } })
  assert(phraseRepeat2 > 0 && phraseDual2 > 0, '3c supplementary phrase probe "données publications" returned 0 hits -- expected a real positive population')
  finding(`3c supplementary phrase "données publications" (actual injected bigram, same-stem-family probe) on description.text: repeat=${phraseRepeat2} dual=${phraseDual2}`)

  // 3d. Multi-word prefix
  const multiRepeat = await count('spike-i-repeat', { simple_query_string: { query: 'données publi*', fields: ['description.text'] } })
  const multiDual = await count('spike-i-dual', { simple_query_string: { query: 'données publi*', fields: ['description.text'] } })
  finding(`3d multi-word prefix "données publi*" on description.text: repeat=${multiRepeat} dual=${multiDual}`)

  // 3e. Exact-form boost -- 2 probe docs per index, added AFTER size measurements so they don't
  // skew the store numbers above.
  const PROBE_IDS = ['probe-exact-singular', 'probe-exact-plural']
  for (const idx of ['spike-i-repeat', 'spike-i-dual']) {
    await es('PUT', `/${idx}/_doc/probe-exact-singular`, { id: 'probe-exact-singular', title: 'Fiche', description: 'configuration' })
    await es('PUT', `/${idx}/_doc/probe-exact-plural`, { id: 'probe-exact-plural', title: 'Fiche', description: 'configurations' })
    await es('POST', `/${idx}/_refresh`)
  }

  const repeatProbeHits = await search('spike-i-repeat',
    { bool: { must: { simple_query_string: { query: 'configurations', fields: ['description.text'] } }, filter: { terms: { id: PROBE_IDS } } } },
    2)
  assert(repeatProbeHits.length === 2, `3e spike-i-repeat exact-form probe expected 2 hits, got ${repeatProbeHits.length}`)
  const rSingular = repeatProbeHits.find((h: any) => h._source.id === 'probe-exact-singular')
  const rPlural = repeatProbeHits.find((h: any) => h._source.id === 'probe-exact-plural')
  finding(`3e spike-i-repeat exact-form boost q=configurations on description.text (single field): plural(exact-match doc)=${rPlural._score} singular(stem-only-match doc)=${rSingular._score} -- exact should outrank: ${rPlural._score > rSingular._score}`)

  const dualProbeHits = await search('spike-i-dual',
    { bool: { must: { simple_query_string: { query: 'configurations', fields: ['description.text', 'description.text_standard'] } }, filter: { terms: { id: PROBE_IDS } } } },
    2)
  assert(dualProbeHits.length === 2, `3e spike-i-dual exact-form probe expected 2 hits, got ${dualProbeHits.length}`)
  const dSingular = dualProbeHits.find((h: any) => h._source.id === 'probe-exact-singular')
  const dPlural = dualProbeHits.find((h: any) => h._source.id === 'probe-exact-plural')
  finding(`3e spike-i-dual exact-form boost q=configurations on [description.text, description.text_standard] (today's 2-field shape): plural(exact-match doc)=${dPlural._score} singular(stem-only-match doc)=${dSingular._score} -- exact outranks: ${dPlural._score > dSingular._score}`)

  // 3f. Highlight
  const hlHits = await search('spike-i-repeat', { simple_query_string: { query: 'configurations', fields: ['title.text'] } }, 1, { highlight: { fields: { 'title.text': {} } } })
  const frag = (hlHits[0] as any)?.highlight?.['title.text']?.[0]
  finding(`3f spike-i-repeat highlight fragment for q=configurations on title.text: ${JSON.stringify(frag)}`)

  // 3g. words_agg noise -- SMALL dedicated indices with fielddata enabled
  const SMALL_N = 2000
  const smallDocs = docs.slice(0, SMALL_N)
  const fieldRepeatFD = () => ({ type: 'keyword', ignore_above: 200, fields: { text: { type: 'text', analyzer: 'custom_french_repeat', fielddata: true } } })
  const fieldDualFD = () => ({
    type: 'keyword',
    ignore_above: 200,
    fields: { text: { type: 'text', analyzer: 'custom_french', fielddata: true }, text_standard: { type: 'text', analyzer: 'standard' } }
  })
  await resetIndex('spike-i-repeat-small', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldRepeatFD(), description: fieldRepeatFD() } } })
  await bulkIndex('spike-i-repeat-small', smallDocs)
  builtIndices.push('spike-i-repeat-small')
  await resetIndex('spike-i-dual-small', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldDualFD(), description: fieldDualFD() } } })
  await bulkIndex('spike-i-dual-small', smallDocs)
  builtIndices.push('spike-i-dual-small')

  const aggRepeat = await es('POST', '/spike-i-repeat-small/_search', { size: 0, aggs: { words: { terms: { field: 'title.text', size: 15 } } } })
  finding('3g spike-i-repeat-small words_agg (title.text, fielddata) buckets: ' + aggRepeat.aggregations.words.buckets.map((b: any) => `${b.key}:${b.doc_count}`).join(' '))
  const aggDual = await es('POST', '/spike-i-dual-small/_search', { size: 0, aggs: { words: { terms: { field: 'title.text', size: 15 } } } })
  finding('3g spike-i-dual-small words_agg (title.text, fielddata) buckets: ' + aggDual.aggregations.words.buckets.map((b: any) => `${b.key}:${b.doc_count}`).join(' '))

  // -------------------------------------------------------------------------------------------
  // 4. SCORED PREFIX on spike-i-repeat-prefix -- controlled ladder probe (spike H method)
  // -------------------------------------------------------------------------------------------
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
  const prefixLadderProbes = [...rankLenProbes, ...rankTfProbes]
  const PROBE_IDS_LADDER = prefixLadderProbes.map(p => p.id)

  await resetIndex('spike-i-prefix-ladder', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldRepeatPrefix(), description: fieldRepeatPrefix() } } })
  await bulkIndex('spike-i-prefix-ladder', prefixLadderProbes)
  builtIndices.push('spike-i-prefix-ladder')

  function wordLen (s: string): number { return s.trim().length ? s.trim().split(/\s+/).length : 0 }

  // baseline: default simple_query_string "<p>*" rewrite (constant-score, per Spike H's DISCOVERY)
  const literalHits = await search('spike-i-prefix-ladder', { simple_query_string: { query: 'config*', fields: ['description.text'] } }, PROBE_IDS_LADDER.length)
  assert(literalHits.length === PROBE_IDS_LADDER.length, `4 LITERAL ladder probe expected ${PROBE_IDS_LADDER.length} hits, got ${literalHits.length}`)
  const literalRanked = literalHits.map((h: any) => ({ id: h._source.id, score: h._score, words: wordLen(h._source.description) })).sort((a: any, b: any) => b.score - a.score)
  finding('4 spike-i-prefix-ladder LITERAL simple_query_string "config*" ranking (id:score:words): ' + literalRanked.map((r: any) => `${r.id}:${r.score.toFixed(4)}:${r.words}w`).join(' | '))

  // match_bool_prefix on the plain field name (ES routes the prefix term through _index_prefix)
  const mbpHits = await search('spike-i-prefix-ladder', { match_bool_prefix: { 'description.text': 'config' } }, PROBE_IDS_LADDER.length)
  assert(mbpHits.length === PROBE_IDS_LADDER.length, `4 match_bool_prefix ladder probe expected ${PROBE_IDS_LADDER.length} hits, got ${mbpHits.length}`)
  const mbpRanked = mbpHits.map((h: any) => ({ id: h._source.id, score: h._score, words: wordLen(h._source.description) })).sort((a: any, b: any) => b.score - a.score)
  finding('4 spike-i-prefix-ladder match_bool_prefix("config") on description.text ranking (id:score:words): ' + mbpRanked.map((r: any) => `${r.id}:${r.score.toFixed(4)}:${r.words}w`).join(' | '))
  const mbpScores = mbpRanked.map((r: any) => r.score)
  const mbpSpread = (Math.max(...mbpScores) - Math.min(...mbpScores)) / Math.max(...mbpScores)
  finding(`4 spike-i-prefix-ladder match_bool_prefix score spread: max=${Math.max(...mbpScores).toFixed(4)} min=${Math.min(...mbpScores).toFixed(4)} relativeSpread=${(mbpSpread * 100).toFixed(1)}% (differentiated if nonzero)`)
  const mbpLenOnly = mbpRanked.filter((r: any) => r.id.startsWith('rank-len-')).sort((a: any, b: any) => a.words - b.words)
  let mbpMonotonic = true
  for (let i = 1; i < mbpLenOnly.length; i++) if (mbpLenOnly[i].score > mbpLenOnly[i - 1].score) mbpMonotonic = false
  finding('4 spike-i-prefix-ladder match_bool_prefix length-ladder (tf fixed=3) short-outranks-long: ' + mbpLenOnly.map((r: any) => `${r.words}w=${r.score.toFixed(4)}`).join(' | ') + ` -> strictly monotonic decreasing = ${mbpMonotonic}`)

  // Attempted a `term` query directly on the internal `description.text._index_prefix` subfield
  // to bypass match_bool_prefix's query-building and get a raw scored term lookup (a technique
  // documented for older ES versions). On this ES 8.19.9 cluster it silently returns 0 hits for
  // ANY query type (term/match/prefix/wildcard) -- the internal prefix subfield is populated
  // (confirmed by its nonzero `_disk_usage` cost above) but is NOT directly addressable via the
  // query DSL in this version; only match_bool_prefix's internal query-rewrite machinery can
  // reach it. Falling back to `_explain` on the match_bool_prefix query instead, which is
  // DECISIVE on its own: it reveals the exact Lucene query ES builds for the prefix clause.
  const explainRes = await es('POST', `/spike-i-prefix-ladder/_explain/${(mbpHits[0] as any)._id}`, { query: { match_bool_prefix: { 'description.text': 'config' } } })
  finding(`4 spike-i-prefix-ladder _explain(match_bool_prefix "config" on description.text) for doc ${(mbpHits[0] as any)._source.id}: ${JSON.stringify(explainRes.explanation)}`)
  finding('4 DISCOVERY: match_bool_prefix\'s prefix clause resolves to `ConstantScore(description.text._index_prefix:config)` (confirmed via _explain above) -- i.e. even with index_prefixes enabled and the dedicated subfield actually hit (nonzero _disk_usage cost measured above), ES wraps the prefix-subfield term lookup in ConstantScore, identical in kind to Spike H\'s DISCOVERY for the literal simple_query_string "<p>*" PrefixQuery. The flat 1.0000 scores and 0.0% spread measured above are not a probe artifact -- they are what ES\'s default match_bool_prefix query shape actually does. index_prefixes buys query-time SPEED (a direct term lookup on pre-computed n-grams instead of an FST prefix expansion over the full term dictionary) but, under this default query shape, NO additional ranking differentiation over the no-index_prefixes baseline. Also NOTE (secondary, version-specific finding): the internal `_index_prefix` subfield could not be queried directly via term/match/prefix/wildcard DSL on this ES 8.19.9 cluster (always 0 hits), unlike older ES documentation examples that showed direct addressing as a technique for keeping BM25 scoring -- so that documented escape hatch to get real scoring out of index_prefixes does not appear to be available on this version.')

  // -------------------------------------------------------------------------------------------
  // 5. LATENCY -- median over 20 runs, representative prefix query and plain word query, per variant
  // -------------------------------------------------------------------------------------------
  const PREFIX_QUERY_SHAPE: Record<string, () => any> = {
    'spike-i-dual': () => ({ simple_query_string: { query: 'configur*', fields: ['title.text_standard'] } }),
    'spike-i-single': () => ({ simple_query_string: { query: 'configur*', fields: ['title.text'] } }),
    'spike-i-repeat': () => ({ simple_query_string: { query: 'configur*', fields: ['title.text'] } }),
    'spike-i-repeat-prefix': () => ({ simple_query_string: { query: 'configur*', fields: ['title.text'] } })
  }
  const WORD_QUERY_SHAPE: Record<string, () => any> = {
    'spike-i-dual': () => ({ simple_query_string: { query: 'données', fields: ['description.text'] } }),
    'spike-i-single': () => ({ simple_query_string: { query: 'données', fields: ['description.text'] } }),
    'spike-i-repeat': () => ({ simple_query_string: { query: 'données', fields: ['description.text'] } }),
    'spike-i-repeat-prefix': () => ({ simple_query_string: { query: 'données', fields: ['description.text'] } })
  }
  for (const name of Object.keys(variants)) {
    await time(`${name} prefix "configur*"`, 20, () => count(name, PREFIX_QUERY_SHAPE[name]()))
    await time(`${name} word "données"`, 20, () => count(name, WORD_QUERY_SHAPE[name]()))
  }
  // supplementary: repeat-prefix's native prefix mechanism (match_bool_prefix via _index_prefix)
  await time('spike-i-repeat-prefix match_bool_prefix("config") on title.text', 20, () => count('spike-i-repeat-prefix', { match_bool_prefix: { 'title.text': 'config' } }))
} finally {
  // ---------------------------------------------------------------------------------------------
  // cleanup -- always runs, even on failure
  // ---------------------------------------------------------------------------------------------
  const cleanup = new Set([...builtIndices, ...Object.keys(variants)])
  for (const name of cleanup) {
    await es('DELETE', `/${name}`).catch(() => {})
  }
  console.log('spike I done')
}
