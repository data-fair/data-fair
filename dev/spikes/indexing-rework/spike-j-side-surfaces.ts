import { es, resetIndex, bulkIndex, finding, assert, ANALYSIS_SETTINGS } from './es.ts'

// Chosen candidate (Spike I): a SINGLE `.text` field per column, analyzer `custom_french_repeat`
// for BOTH index and search (no search_analyzer override, no boost clause). Before implementation,
// three side surfaces need verification that Spike I did not cover:
//   1. HIGHLIGHTING in the exact production shape (unified highlighter, no_match_size:300,
//      fragment_size:100, tags) -- does stacked-token indexing (keyword_repeat) double-mark or
//      mangle fragments?
//   2. words_agg DEDICATED FIELD MODE -- the textAgg opt-in design where a column that wants clean
//      terms-agg buckets gets a SEPARATE `.words` subfield (stemmed-only, agg-optimized), instead of
//      aggregating on the repeat `.text` field directly (which mixes exact-form and stem tokens in
//      the same bucket space).
//   3. UNION-FALLBACK edge cases -- during a rolling reindex, an alias/multi-index query spans
//      OLD-shape indices (`.text` custom_french + `.text_standard` standard) and NEW-shape indices
//      (`.text` custom_french_repeat only). Does querying the union of both field names error, or
//      silently misbehave, across old-alone / new-alone / old+new together?
//
// Do NOT pick a winner here -- gather evidence only, same discipline as Spikes A-I2.

// ---------------------------------------------------------------------------------------------
// Analyzer under test -- verbatim copy from spike-i-keyword-repeat.ts (already validated there:
// section 0 of that spike investigated the filter order live via _analyze before committing to it).
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

// Production highlight block, copied from api/src/datasets/es/commons.ts (the `query.highlight`
// branch): unified highlighter (ES default for `text` fields), no_match_size:300, fragment_size:100,
// pre/post tags. No search_analyzer, no boost -- matches the candidate shape under test.
const HIGHLIGHT_OPTS = { no_match_size: 300, fragment_size: 100, pre_tags: ['<em class="highlighted">'], post_tags: ['</em>'] }

const builtIndices: string[] = []

async function count (index: string, query: any): Promise<{ count: number, failed: number }> {
  const res = await es('POST', `/${index}/_count`, { query })
  return { count: res.count, failed: res._shards.failed }
}

try {
  // ===============================================================================================
  // 1. HIGHLIGHTING (production shape)
  // ===============================================================================================
  // Corpus: same VOCAB / generator style as Spike I/I2, ~1k docs. A handful of hand-written PROBE
  // docs carry the exact word forms the correctness checks need (kept isolated from filler so the
  // probe is unambiguous); filler docs pad the index to a realistic size and DELIBERATELY avoid the
  // probe roots (donn.., configur..) so filler never contaminates the probe assertions.
  const FILLER_VOCAB = [
    'publication', 'publications', 'publier', 'publiée', 'commune', 'communes', 'transporteur',
    'transporteurs', 'transport', 'transports', 'école', 'écoles', 'scolaire', 'ministère',
    'ministères', 'région', 'régions', 'régional', 'budget', 'budgets', 'projet', 'projets',
    'contrat', 'contrats', 'habitant', 'habitants', 'surface', 'surfaces', 'service', 'services',
    'marché', 'marchés', 'département', 'départements'
  ]
  const fillerSentence = (i: number) => {
    const n = 6 + (i % 6)
    return Array.from({ length: n }, (_, k) => FILLER_VOCAB[(i * 7 + k * 13) % FILLER_VOCAB.length]).join(' ')
  }

  const PROBE_ONLY_SINGULAR = { id: 'probe-only-singular', description: 'La donnée officielle est publiée chaque mois par le service régional.' }
  const PROBE_ONLY_PLURAL = { id: 'probe-only-plural', description: 'Les données officielles sont publiées chaque mois par les services régionaux.' }
  const PROBE_CONFIGUR = { id: 'probe-configur', description: 'Configuration avancée du système régional, une configuration complète et fiable.' }
  const PROBE_BIGRAM = { id: 'probe-bigram', description: 'Les données publications officielles ont été mises à jour hier soir.' }

  const N1 = 1000
  const fillerDocs = Array.from({ length: N1 - 4 }, (_, i) => ({ id: `filler-${i}`, description: fillerSentence(i) }))
  const hlDocs = [PROBE_ONLY_SINGULAR, PROBE_ONLY_PLURAL, PROBE_CONFIGUR, PROBE_BIGRAM, ...fillerDocs]

  const fieldRepeat = () => ({ type: 'keyword', ignore_above: 200, fields: { text: { type: 'text', analyzer: 'custom_french_repeat' } } })
  await resetIndex('spike-j-highlight', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, description: fieldRepeat() } } })
  await bulkIndex('spike-j-highlight', hlDocs)
  builtIndices.push('spike-j-highlight')

  async function highlightProbe (probeId: string, query: any, extra: any = {}): Promise<any> {
    const res = await es('POST', '/spike-j-highlight/_search', {
      query: { bool: { must: query, filter: { term: { id: probeId } } } },
      size: 1,
      _source: ['id', 'description'],
      highlight: { fields: { 'description.text': {} }, ...HIGHLIGHT_OPTS, ...extra }
    })
    return res.hits.hits[0]
  }

  // 1a. inflected query "données" (plural) must highlight "donnée" (singular) in a doc that ONLY
  // has the singular form, and vice versa -- proves stemmed recall survives into the highlighter
  // (which by default highlights against the query's analyzed terms, not verbatim substrings).
  const hitPluralQueryOnSingularDoc = await highlightProbe('probe-only-singular', { simple_query_string: { query: 'données', fields: ['description.text'] } })
  assert(hitPluralQueryOnSingularDoc, '1a query "données" did not match probe-only-singular at all -- stemmed recall broken')
  const fragSingular = hitPluralQueryOnSingularDoc.highlight['description.text'][0]
  finding(`1a q="données" (plural) highlight on doc containing only "donnée" (singular): ${JSON.stringify(fragSingular)}`)
  assert(fragSingular.includes('<em class="highlighted">donnée</em>'), '1a expected "donnée" to be marked exactly (inflected form recall)')

  const hitSingularQueryOnPluralDoc = await highlightProbe('probe-only-plural', { simple_query_string: { query: 'donnée', fields: ['description.text'] } })
  assert(hitSingularQueryOnPluralDoc, '1a query "donnée" did not match probe-only-plural at all -- stemmed recall broken')
  const fragPlural = hitSingularQueryOnPluralDoc.highlight['description.text'][0]
  finding(`1a q="donnée" (singular) highlight on doc containing only "données" (plural): ${JSON.stringify(fragPlural)}`)
  assert(fragPlural.includes('<em class="highlighted">données</em>'), '1a expected "données" to be marked exactly (inflected form recall, reverse direction)')

  // 1b. stacked tokens (keyword_repeat indexes BOTH the exact-form and the stemmed copy at the SAME
  // position) must not double-mark or mangle the fragment. The two probes above already exercise the
  // most representative case (a plain single-word query against its own stacked position) --
  // both fragments are re-inspected here for well-formedness. A supplementary two-DIFFERENT-words
  // query checks that adjacent distinct highlighted words don't merge/mangle either.
  for (const [label, frag] of [['1a singular-doc frag', fragSingular], ['1a plural-doc frag', fragPlural]] as const) {
    const openCount = (frag.match(/<em class="highlighted">/g) || []).length
    const closeCount = (frag.match(/<\/em>/g) || []).length
    const backToBackDupe = /<\/em><em class="highlighted">/.test(frag)
    finding(`1b well-formedness [${label}]: opens=${openCount} closes=${closeCount} balanced=${openCount === closeCount} back-to-back-adjacent-marks=${backToBackDupe}`)
    assert(openCount === closeCount, `1b unbalanced highlight tags in ${label}: ${frag}`)
  }
  const hitBigram = await highlightProbe('probe-bigram', { simple_query_string: { query: 'données publications', fields: ['description.text'] } })
  assert(hitBigram, '1b bigram probe query returned no hit')
  const fragBigram = hitBigram.highlight['description.text'][0]
  finding(`1b two-different-words query "données publications" on adjacent-word doc: ${JSON.stringify(fragBigram)}`)

  // 1c. mid-typing prefix "configur*" -- sane single-word highlight, no partial-token mangling
  // (e.g. marking "config" inside "Configuration" and leaving "uration" bare, or double-marking the
  // two "configuration(s)" occurrences in the probe sentence differently).
  const hitPrefix = await highlightProbe('probe-configur', { simple_query_string: { query: 'configur*', fields: ['description.text'] } })
  assert(hitPrefix, '1c prefix probe query returned no hit')
  const fragPrefix = hitPrefix.highlight['description.text'][0]
  finding(`1c mid-typing prefix q="configur*" highlight: ${JSON.stringify(fragPrefix)}`)
  const wholeWordMarks = (fragPrefix.match(/<em class="highlighted">[^<]*<\/em>/g) || [])
  finding(`1c marked spans: ${JSON.stringify(wholeWordMarks)} -- each should be a WHOLE word ("Configuration"/"configuration"), not a partial token`)

  // ===============================================================================================
  // 2. words_agg DEDICATED FIELD MODE (textAgg opt-in design)
  // ===============================================================================================
  // Corpus: same VOCAB-based generator as Spike I (verbatim), SMALL_N docs -- small enough to run
  // fielddata-backed terms aggs cheaply, same scale Spike I used for its own words_agg noise probe.
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
  const SMALL_N = 2000
  function buildDescription (i: number): string {
    const words = Array.from({ length: 30 }, (_, k) => VOCAB[(i * 7 + k * 13) % VOCAB.length])
    if (i % 11 === 0) { words[5] = 'données'; words[6] = 'publications' }
    if (i % 97 === 0) { words[0] = 'données'; words[1] = 'publications' }
    return words.join(' ')
  }
  const wordsCorpus = Array.from({ length: SMALL_N }, (_, i) => ({ id: `rec-${i}`, description: buildDescription(i) }))

  // spike-j-words: BOTH the repeat `.text` (candidate default) AND a dedicated `.words` subfield --
  // stemmed-only, agg-optimized: index_options:'docs' (no positions/freqs beyond doc presence,
  // don't need them for terms/significant_text), norms:false (no length-normalization, irrelevant
  // for a field that's never scored), fielddata:true (aggregatable).
  const fieldRepeatPlusWords = () => ({
    type: 'keyword',
    ignore_above: 200,
    fields: {
      text: { type: 'text', analyzer: 'custom_french_repeat' },
      words: { type: 'text', analyzer: 'custom_french', index_options: 'docs', norms: false, fielddata: true }
    }
  })
  await resetIndex('spike-j-words', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, description: fieldRepeatPlusWords() } } })
  await bulkIndex('spike-j-words', wordsCorpus)
  await es('POST', '/spike-j-words/_forcemerge?max_num_segments=1')
  builtIndices.push('spike-j-words')

  // spike-j-words-mixed: SAME corpus, but the column materializes ONLY the repeat `.text` field
  // (fielddata enabled directly on it, since that's the only way to terms-agg on it at all) --
  // the "aggregate on the repeat field directly, no dedicated .words" alternative, for contrast.
  // Also serves as the exact same-corpus baseline for the .words size-delta measurement in 2d.
  const fieldRepeatFDOnly = () => ({ type: 'keyword', ignore_above: 200, fields: { text: { type: 'text', analyzer: 'custom_french_repeat', fielddata: true } } })
  await resetIndex('spike-j-words-mixed', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, description: fieldRepeatFDOnly() } } })
  await bulkIndex('spike-j-words-mixed', wordsCorpus)
  await es('POST', '/spike-j-words-mixed/_forcemerge?max_num_segments=1')
  builtIndices.push('spike-j-words-mixed')

  // 2a. clean stem-only buckets on `.words`, vs noisy mixed buckets on the repeat `.text` (exact-form
  // and stemmed tokens interleaved in the same bucket space, unpredictable which "spelling" wins).
  const aggWords = await es('POST', '/spike-j-words/_search', { size: 0, aggs: { w: { terms: { field: 'description.words', size: 15 } } } })
  finding('2a spike-j-words terms agg on description.words (dedicated, stem-only): ' + aggWords.aggregations.w.buckets.map((b: any) => `${b.key}:${b.doc_count}`).join(' '))
  const aggMixed = await es('POST', '/spike-j-words-mixed/_search', { size: 0, aggs: { w: { terms: { field: 'description.text', size: 15 } } } })
  finding('2a spike-j-words-mixed terms agg on description.text (repeat field directly, fielddata) -- CONTRAST, expect noisy/mixed buckets: ' + aggMixed.aggregations.w.buckets.map((b: any) => `${b.key}:${b.doc_count}`).join(' '))

  // 2b. significant_text on `.words` with a match query -- same aggs shape as
  // api/src/datasets/es/operations.ts buildWordsAggs (sampler + significant_text, filter_duplicate_text)
  const sigTextRes = await es('POST', '/spike-j-words/_search', {
    size: 0,
    query: { match: { 'description.words': 'configuration' } },
    aggs: { sample: { sampler: { shard_size: 1000 }, aggregations: { words: { significant_text: { field: 'description.words', size: 15, filter_duplicate_text: true } } } } }
  })
  finding('2b significant_text on description.words, query=match(configuration): sample_doc_count=' + sigTextRes.aggregations.sample.doc_count + ' buckets: ' + sigTextRes.aggregations.sample.words.buckets.map((b: any) => `${b.key}:${b.score.toFixed(3)}`).join(' '))

  // 2c. unstem-highlight pass, exact pattern from api/src/datasets/es/words-agg.ts:57 (`unstem`):
  // term filter on the stem + highlight(fragment_size:1, pre/post tags '<>') to recover a readable
  // original word for each stem bucket.
  const topStems = aggWords.aggregations.w.buckets.slice(0, 5).map((b: any) => b.key)
  for (const stem of topStems) {
    const res = await es('POST', '/spike-j-words/_search', {
      size: 20,
      query: { bool: { filter: [{ term: { 'description.words': stem } }] } },
      _source: { excludes: '*' },
      highlight: { fields: { 'description.words': {} }, fragment_size: 1, pre_tags: '<>', post_tags: '<>' }
    })
    const words: Record<string, number> = {}
    for (const hit of res.hits.hits) {
      for (let w of hit.highlight['description.words']) {
        w = w.match(/<>(.*)<>/)[1]
        if (w.toUpperCase() === w) w = w.toLowerCase()
        words[w] = (words[w] || 0) + 1
      }
    }
    const readable = Object.keys(words).sort((a, b) => words[a] < words[b] ? 1 : -1)[0]
    finding(`2c unstem-highlight stem="${stem}" -> readable word "${readable}" (seen forms: ${JSON.stringify(words)})`)
  }

  // 2d. the .words field's size cost -- via _disk_usage, and via the store-size delta against the
  // same-corpus spike-j-words-mixed baseline (which has no .words field at all).
  const duWords = await es('POST', '/spike-j-words/_disk_usage?run_expensive_tasks=true')
  const fields = duWords['spike-j-words'].fields
  finding(`2d spike-j-words description.words disk usage: total=${fields['description.words'].total_in_bytes}B inverted_index=${fields['description.words'].inverted_index.total_in_bytes}B doc_values=${fields['description.words'].doc_values_in_bytes}B norms=${fields['description.words'].norms_in_bytes}B (norms:false in mapping, expect 0)`)
  finding(`2d spike-j-words description.text disk usage (repeat field, for comparison): total=${fields['description.text'].total_in_bytes}B inverted_index=${fields['description.text'].inverted_index.total_in_bytes}B norms=${fields['description.text'].norms_in_bytes}B`)
  const statsWords = await es('GET', '/spike-j-words,spike-j-words-mixed/_stats/store')
  const sizeWords = statsWords.indices['spike-j-words'].primaries.store.size_in_bytes
  const sizeMixed = statsWords.indices['spike-j-words-mixed'].primaries.store.size_in_bytes
  const deltaPct = ((sizeWords - sizeMixed) / sizeMixed) * 100
  finding(`2d store size: spike-j-words (with .words)=${(sizeWords / 1e6).toFixed(2)}MB spike-j-words-mixed (same corpus, no .words)=${(sizeMixed / 1e6).toFixed(2)}MB delta=${(sizeWords - sizeMixed)}B (+${deltaPct.toFixed(1)}%) -- this delta is the textAgg opt-in's price`)

  // ===============================================================================================
  // 3. UNION-FALLBACK EDGE CASES (old-index compat during a rolling reindex)
  // ===============================================================================================
  const VOCAB3 = [...VOCAB, 'équipement', 'équipements']
  const sentence3 = (n: number, seed: number) => Array.from({ length: n }, (_, i) => VOCAB3[(seed * 7 + i * 13) % VOCAB3.length]).join(' ')
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  function buildCol (i: number): string {
    if (i % 11 === 0) return `Les données publiées décrivent les équipements sportifs de la région numéro ${i}`
    if (i % 13 === 0) return `Aucune donnée disponible pour les équipements municipaux ${i}`
    if (i % 17 === 0) return `Configuration avancée des équipements techniques du ministère ${i}`
    return capitalize(sentence3(6 + (i % 8), i))
  }
  const N3 = 60
  const PROBE_PHRASE = { id: 'probe-phrase', col: 'Les données publiées hier ont été mises à jour au ministère' }
  const PROBE_ACCENT = { id: 'probe-accent', col: 'Rénovation complète des équipements sportifs municipaux cette année' }
  const sideDocs = [PROBE_PHRASE, PROBE_ACCENT, ...Array.from({ length: N3 }, (_, i) => ({ id: `rec-${i}`, col: buildCol(i) }))]

  const fieldOld = () => ({
    type: 'keyword',
    ignore_above: 200,
    fields: { text: { type: 'text', analyzer: 'custom_french' }, text_standard: { type: 'text', analyzer: 'standard' } }
  })
  const fieldNew = () => ({ type: 'keyword', ignore_above: 200, fields: { text: { type: 'text', analyzer: 'custom_french_repeat' } } })

  await resetIndex('spike-j-old', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, col: fieldOld() } } })
  await bulkIndex('spike-j-old', sideDocs)
  builtIndices.push('spike-j-old')
  await resetIndex('spike-j-new', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, col: fieldNew() } } })
  await bulkIndex('spike-j-new', sideDocs)
  builtIndices.push('spike-j-new')

  // 3a. SQS with fields [col.text, col.text_standard] -- the transitional field-name union a caller
  // uses when it doesn't statically know an index's shape -- against each index alone and both
  // together. `col.text_standard` is simply UNMAPPED on spike-j-new: per resolveSearchField's own
  // documented invariant (operations.ts), an unmapped field in a multi-field query matches nothing,
  // no error.
  const sqs3a = (index: string) => es('POST', `/${index}/_search`, { query: { simple_query_string: { query: 'données', fields: ['col.text', 'col.text_standard'] } }, size: 0 })
  const oldRes = await sqs3a('spike-j-old')
  const newRes = await sqs3a('spike-j-new')
  const bothRes = await sqs3a('spike-j-old,spike-j-new')
  finding(`3a SQS fields=[col.text,col.text_standard] q="données": old alone hits=${oldRes.hits.total.value} shards_failed=${oldRes._shards.failed}`)
  finding(`3a SQS fields=[col.text,col.text_standard] q="données": new alone hits=${newRes.hits.total.value} shards_failed=${newRes._shards.failed} (col.text_standard unmapped on new -- silently ignored, not an error)`)
  finding(`3a SQS fields=[col.text,col.text_standard] q="données": old+new together hits=${bothRes.hits.total.value} shards_failed=${bothRes._shards.failed}`)
  assert(oldRes.hits.total.value > 0 && newRes.hits.total.value > 0, '3a expected nonzero hits on both old and new alone')
  assert(oldRes._shards.failed === 0 && newRes._shards.failed === 0 && bothRes._shards.failed === 0, '3a expected zero shard failures everywhere')

  // per-index query analysis: same query, same field-name list, but each index applies its OWN
  // mapping's analyzer to build the actual Lucene query -- _validate/query?rewrite=true&explain=true
  // makes the difference concrete (custom_french vs custom_french_repeat term expansion).
  const validateOld = await es('POST', '/spike-j-old/_validate/query?rewrite=true&explain=true', { query: { simple_query_string: { query: 'données', fields: ['col.text', 'col.text_standard'] } } })
  const validateNew = await es('POST', '/spike-j-new/_validate/query?rewrite=true&explain=true', { query: { simple_query_string: { query: 'données', fields: ['col.text', 'col.text_standard'] } } })
  finding(`3a per-index rewritten query (old, custom_french + standard): ${validateOld.explanations[0].explanation}`)
  finding(`3a per-index rewritten query (new, custom_french_repeat, col.text_standard absent): ${validateNew.explanations[0].explanation}`)

  // 3b. accented mid-typing prefix "equipe*" (unaccented) for "équipements" (accented in the source
  // text). On OLD, mid-typing prefix targets `.text_standard` (plain `standard` analyzer -- no
  // asciifolding) -- this is the KNOWN production bug: the indexed token stays accented, so an
  // unaccented query prefix never matches. On NEW, the single `.text` field's exact-form copy (the
  // keyword_repeat-preserved token) IS asciifolded (custom_french_repeat's filter chain ends with
  // asciifolding, same as custom_french) -- so it should match directly.
  const oldPrefixStd = await count('spike-j-old', { simple_query_string: { query: 'equipe*', fields: ['col.text_standard'] } })
  finding(`3b OLD col.text_standard (standard analyzer, no asciifolding) q="equipe*" (unaccented) vs "équipements" (accented, in source): hits=${oldPrefixStd.count} shards_failed=${oldPrefixStd.failed} -- KNOWN BUG expects 0`)
  assert(oldPrefixStd.count === 0, '3b expected the known accented-prefix bug to reproduce as ZERO hits on OLD col.text_standard')

  const newPrefixText = await count('spike-j-new', { simple_query_string: { query: 'equipe*', fields: ['col.text'] } })
  finding(`3b NEW col.text (custom_french_repeat, asciifolded exact-form copy) q="equipe*" (unaccented): hits=${newPrefixText.count} shards_failed=${newPrefixText.failed} -- expects a match`)
  assert(newPrefixText.count > 0, '3b expected NEW col.text to match the unaccented prefix (asciifolding on the exact-form copy)')

  // multi-index, using the SAME transitional field-name union as 3a: the new-side match must
  // surface, and (measured, not assumed) how much the old side contributes through this exact
  // 2-field query shape.
  const oldViaUnion = await count('spike-j-old', { simple_query_string: { query: 'equipe*', fields: ['col.text', 'col.text_standard'] } })
  const newViaUnion = await count('spike-j-new', { simple_query_string: { query: 'equipe*', fields: ['col.text', 'col.text_standard'] } })
  const multiViaUnion = await count('spike-j-old,spike-j-new', { simple_query_string: { query: 'equipe*', fields: ['col.text', 'col.text_standard'] } })
  finding(`3b multi-index fields=[col.text,col.text_standard] q="equipe*": old-alone=${oldViaUnion.count} new-alone=${newViaUnion.count} old+new=${multiViaUnion.count} shards_failed(multi)=${multiViaUnion.failed}`)
  finding(`3b old-alone contribution via this 2-field union is ${oldViaUnion.count} (NOT via col.text_standard, which is 0 per the bug above -- if nonzero it comes from col.text's own asciifolding, custom_french also asciifolds last, same as custom_french_repeat) -- reported as measured, not assumed`)
  assert(multiViaUnion.failed === 0, '3b expected zero shard failures on the multi-index accented-prefix query')
  assert(multiViaUnion.count >= newViaUnion.count, '3b expected the new-side match to surface in the multi-index total')

  // 3c. quoted phrase -- positions exist on both `.text` variants (custom_french and
  // custom_french_repeat both carry position data; `.text_standard` too) so this must not hit ES's
  // "field was indexed without position data" error, old alone / new alone / together.
  const phraseQuery = { simple_query_string: { query: '"données publiées"', fields: ['col.text', 'col.text_standard'] } }
  const phraseOld = await count('spike-j-old', phraseQuery)
  const phraseNew = await count('spike-j-new', phraseQuery)
  const phraseBoth = await count('spike-j-old,spike-j-new', phraseQuery)
  finding(`3c quoted phrase "données publiées" fields=[col.text,col.text_standard]: old=${phraseOld.count}(failed=${phraseOld.failed}) new=${phraseNew.count}(failed=${phraseNew.failed}) both=${phraseBoth.count}(failed=${phraseBoth.failed})`)
  assert(phraseOld.failed === 0 && phraseNew.failed === 0 && phraseBoth.failed === 0, '3c expected zero shard failures for the quoted-phrase query on both variants and the union')

  // 3d. highlight across the multi-index pair, on BOTH field names at once (production highlight
  // shape) -- must not error, and each side's fragment should come from its own field/analyzer.
  const hlBoth = await es('POST', '/spike-j-old,spike-j-new/_search', {
    query: { simple_query_string: { query: 'données', fields: ['col.text', 'col.text_standard'] } },
    size: 10,
    _source: ['id', 'col'],
    highlight: { fields: { 'col.text': {}, 'col.text_standard': {} }, ...HIGHLIGHT_OPTS }
  })
  finding(`3d multi-index highlight fields=[col.text,col.text_standard]: hits=${hlBoth.hits.total.value} shards_failed=${hlBoth._shards.failed}`)
  assert(hlBoth._shards.failed === 0, '3d expected zero shard failures on the multi-index highlight query')
  const oldHit = hlBoth.hits.hits.find((h: any) => h._index === 'spike-j-old')
  const newHit = hlBoth.hits.hits.find((h: any) => h._index === 'spike-j-new')
  finding(`3d fragment from OLD-shape hit: ${oldHit ? JSON.stringify(oldHit.highlight) : '(no old-shape hit in top 10)'}`)
  finding(`3d fragment from NEW-shape hit: ${newHit ? JSON.stringify(newHit.highlight) : '(no new-shape hit in top 10)'}`)
} finally {
  for (const name of builtIndices) {
    await es('DELETE', `/${name}`).catch(() => {})
  }
  console.log('spike J done')
}
