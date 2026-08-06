import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { Client } from '@elastic/elasticsearch'

// This is the legacy-compat proof no api suite can give: every api-created dataset is new-shape
// (design §3), so nothing else in the suite ever runs a query against a genuinely LEGACY-shaped ES
// mapping, nor against a mixed fleet (some indexes legacy, some new) at once. Here we build two raw
// ES indexes by hand and drive the REAL query builders (`buildQClauses` / `prepareQuery`) against
// them directly, bypassing the dataset/worker pipeline entirely.
//
// The api result/csv-adjacent modules import `#config` (validated at import) and the ES pipeline
// modules import `#es`. The unit harness doesn't set NODE_CONFIG_DIR, so point node-config at the
// real api/config dir before loading those modules -- same pattern as lines-pipeline.unit.spec.ts /
// lines-stream-parity.unit.spec.ts. NODE_ENV defaults to 'development' inside node-config.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../../api/config')

const {
  buildQClauses,
  buildIndexMappings,
  NEW_INDEX_SHAPE,
  LEGACY_INDEX_SHAPE
} = await import('../../../../api/src/datasets/es/operations.ts')
const { indexBase } = await import('../../../../api/src/datasets/es/manage-indices.ts')
const { prepareQuery } = await import('../../../../api/src/datasets/es/commons.ts')
const config = (await import('../../../../api/src/config.ts')).default as any

// distinctive prefix so these are unambiguous to spot/clean up in the dev ES cluster
const LEGACY_INDEX = 'test-mixed-shape-legacy'
const NEW_INDEX = 'test-mixed-shape-new'

// no auth on the dev ES cluster, same convention as tests/features/infra/es-error.api.spec.ts
const client: any = new Client({ node: `http://localhost:${process.env.ES_PORT}` })

const analyzers = { search: config.elasticsearch.defaultAnalyzer, index: config.elasticsearch.indexTextAnalyzer }

// jsProps mirror what `datasetUtils.extendedSchema` would hand to `buildIndexMappings` for a
// dataset whose schema holds a single plain full-text string column: the column itself, plus `_i`
// (present on every real dataset index) so `prepareQuery`'s default tie-breaker sort resolves
// against an actually-mapped field instead of erroring on an unmapped one.
const jsProps: any[] = [
  { key: 'text1', type: 'string' },
  { key: '_i', type: 'long' }
]

// The real settings a fresh index gets today (indexBase is shape-agnostic: it always defines all
// three french analyzers). A genuinely pre-feature legacy index never had `custom_french_repeat` /
// `custom_french_exact` defined at all -- those were added to `indexBase` by this very feature, and
// `initDatasetIndex` only ever creates NEW_INDEX_SHAPE mappings, so a shape-legacy index only exists
// in the wild as one created BEFORE this deploy. Trimming the settings here -- derived from the real
// `indexBase` output, not hand-copied -- reproduces that gap so the exact-boost 400 risk documented
// in operations.ts (buildQClauses) is actually exercised below (see "sending it would 400"), not
// just asserted against a query object that happens to reference an analyzer the fixture has anyway.
const fullSettings = indexBase({}).settings
const legacySettings = {
  ...fullSettings,
  analysis: {
    ...fullSettings.analysis,
    analyzer: { custom_french: fullSettings.analysis.analyzer.custom_french }
  }
}

const FIXTURES = [
  { index: LEGACY_INDEX, shape: LEGACY_INDEX_SHAPE, settings: legacySettings },
  { index: NEW_INDEX, shape: NEW_INDEX_SHAPE, settings: fullSettings }
]

// 6 French docs, same content in both indexes:
//  - d1/d2: an inflection family (light_french stems "configuration"/"configurations" to the same
//    root) -- also the exact-boost probe pair, kept short and EQUAL LENGTH so BM25 length-norm
//    cannot confound the exact-vs-stem-only score comparison.
//  - d3: a near-miss negative control -- "configurer" is a DIFFERENT light_french stem family from
//    "configuration(s)" (verified via _analyze), so it must never match a "configurations" query;
//    proves the recall/prefix assertions below pin an exact hit SET, not a loose superset.
//  - d4: an accented word ("équipements"), asciifolded away on both shapes.
//  - d5: a stopword-bearing phrase (le/est/pour/tous/les/de/la).
//  - d6: unrelated filler, another negative control.
// "configura" (past the "configu" stem) is the fixed ASCII mid-typing prefix probe for d1/d2/d3.
const DOCS = [
  { id: 'd1', _i: 1, text1: 'Configuration validée.' },
  { id: 'd2', _i: 2, text1: 'Configurations validées.' },
  { id: 'd3', _i: 3, text1: 'Configurer ce service prend cinq minutes.' },
  { id: 'd4', _i: 4, text1: 'Les équipements sportifs municipaux ont été rénovés.' },
  { id: 'd5', _i: 5, text1: 'Le service est disponible pour tous les habitants de la commune.' },
  { id: 'd6', _i: 6, text1: 'Le marché des services municipaux progresse chaque année.' }
]

const legacyDataset: any = { id: LEGACY_INDEX, finalizedAt: '2026-08-06T00:00:00.000Z', schema: jsProps }
const newDataset: any = { id: NEW_INDEX, finalizedAt: '2026-08-06T00:00:00.000Z', schema: jsProps, _indexShape: NEW_INDEX_SHAPE }

const hitIds = (res: any): string[] => res.hits.hits.map((h: any) => h._id).sort()

test.describe('mixed-shape fleet (raw ES fixtures)', () => {
  test.beforeAll(async () => {
    await client.indices.delete({ index: `${LEGACY_INDEX},${NEW_INDEX}`, ignore_unavailable: true })
    for (const fx of FIXTURES) {
      const { properties } = buildIndexMappings({}, jsProps, analyzers, fx.shape)
      const createRes = await client.indices.create({
        index: fx.index,
        body: { settings: fx.settings, mappings: { dynamic: 'strict', properties } }
      })
      assert.equal(createRes.acknowledged, true, `index creation not acknowledged for ${fx.index}`)

      const body: any[] = []
      for (const doc of DOCS) {
        body.push({ index: { _index: fx.index, _id: doc.id } })
        body.push({ text1: doc.text1, _i: doc._i })
      }
      const bulkRes = await client.bulk({ body, refresh: true })
      assert.equal(bulkRes.errors, false, `bulk indexing errors on ${fx.index}: ${JSON.stringify(bulkRes.items)}`)
      for (const item of bulkRes.items) assert.equal(item.index._shards.failed, 0, `shard failure indexing into ${fx.index}`)
    }
  })

  test.afterAll(async () => {
    await client.indices.delete({ index: `${LEGACY_INDEX},${NEW_INDEX}`, ignore_unavailable: true })
  })

  test('simple-mode q recall: both indexes contribute hits, legacy pinned to the pre-change query shape', async () => {
    const q = 'configurations'
    const qNew = prepareQuery(newDataset, { q })
    const qLegacy = prepareQuery(legacyDataset, { q })

    // pin the legacy `must[0]` clause byte-for-byte against a hand-built version of TODAY's
    // (pre-branch) dual-field union query -- the union behavior this whole feature must preserve.
    assert.deepEqual(qLegacy.query.bool.must[0], {
      bool: {
        should: [
          { simple_query_string: { query: q, fields: ['text1.text', 'text1.text_standard'] } },
          { simple_query_string: { query: q, fields: ['text1.text_standard'] } }
        ],
        minimum_should_match: 1
      }
    })

    const resNew: any = await client.search({ index: NEW_INDEX, ...qNew })
    assert.equal(resNew._shards.failed, 0)
    assert.deepEqual(hitIds(resNew), ['d1', 'd2'])

    const resLegacy: any = await client.search({ index: LEGACY_INDEX, ...qLegacy })
    assert.equal(resLegacy._shards.failed, 0)
    assert.deepEqual(hitIds(resLegacy), ['d1', 'd2'])

    // multi-index merge, using the legacy (shape-invariant) field-name union
    const resBoth: any = await client.search({ index: `${LEGACY_INDEX},${NEW_INDEX}`, ...qLegacy })
    assert.equal(resBoth._shards.failed, 0)
    assert.equal(resBoth.hits.hits.length, 4)
    assert.ok(resBoth.hits.hits.some((h: any) => h._index === LEGACY_INDEX))
    assert.ok(resBoth.hits.hits.some((h: any) => h._index === NEW_INDEX))
  })

  test('complete-mode mid-typing prefix past the stem: new via .text, legacy via .text_standard, multi-index merges', async () => {
    const q = 'configura' // past the "configu" stem (verified via _analyze), still a literal prefix of "Configuration(s)"
    const qNew = prepareQuery(newDataset, { q, q_mode: 'complete' })
    const qLegacy = prepareQuery(legacyDataset, { q, q_mode: 'complete' })

    const prefixClauseNew = qNew.query.bool.must[0].bool.should[0]
    const prefixClauseLegacy = qLegacy.query.bool.must[0].bool.should[0]
    assert.deepEqual(prefixClauseNew.simple_query_string.fields, ['text1.text', 'text1.text_standard'])
    assert.deepEqual(prefixClauseLegacy.simple_query_string.fields, ['text1.text_standard'])

    const resNew: any = await client.search({ index: NEW_INDEX, ...qNew })
    assert.equal(resNew._shards.failed, 0)
    assert.deepEqual(hitIds(resNew), ['d1', 'd2'])

    const resLegacy: any = await client.search({ index: LEGACY_INDEX, ...qLegacy })
    assert.equal(resLegacy._shards.failed, 0)
    assert.deepEqual(hitIds(resLegacy), ['d1', 'd2'])

    // multi-index merge using the new-shape query (its field union already covers both shapes)
    const resBoth: any = await client.search({ index: `${LEGACY_INDEX},${NEW_INDEX}`, ...qNew })
    assert.equal(resBoth._shards.failed, 0)
    assert.equal(resBoth.hits.hits.length, 4)
    assert.ok(resBoth.hits.hits.some((h: any) => h._index === LEGACY_INDEX))
    assert.ok(resBoth.hits.hits.some((h: any) => h._index === NEW_INDEX))
  })

  test('exact-boost clause: outranks a stem-only match on new, is absent from legacy clauses, and would 400 if sent there', async () => {
    const q = 'configurations'
    const qNew = prepareQuery(newDataset, { q })
    const qLegacy = prepareQuery(legacyDataset, { q })
    const clauseNew = qNew.query.bool.must[0]
    const clauseLegacy = qLegacy.query.bool.must[0]

    // clause-level assertion
    const exactClause = clauseNew.bool.should.find((c: any) => c.simple_query_string?.analyzer === config.elasticsearch.exactMatchAnalyzer)
    assert.ok(exactClause, 'expected an exact-boost should clause on the new-shape dataset')
    assert.equal(exactClause.simple_query_string.boost, config.elasticsearch.exactMatchBoost)
    assert.deepEqual(exactClause.simple_query_string.fields, ['text1.text'])
    assert.equal(
      clauseLegacy.bool.should.some((c: any) => c.simple_query_string?.analyzer === config.elasticsearch.exactMatchAnalyzer),
      false,
      'the exact-boost clause must not be emitted for the legacy dataset object'
    )
    assert.equal(JSON.stringify(clauseLegacy).includes(config.elasticsearch.exactMatchAnalyzer), false)

    // execution: exact-match doc (d2) must outrank the stem-only match (d1) on the new index
    const rankQueryNew = structuredClone(qNew)
    rankQueryNew.query.bool.filter.push({ ids: { values: ['d1', 'd2'] } })
    const rankRes: any = await client.search({ index: NEW_INDEX, ...rankQueryNew })
    assert.equal(rankRes._shards.failed, 0)
    const scoreById: Record<string, number> = Object.fromEntries(rankRes.hits.hits.map((h: any) => [h._id, h._score]))
    assert.ok(scoreById.d2 > scoreById.d1, `expected exact-match doc d2 (score=${scoreById.d2}) to outrank stem-only doc d1 (score=${scoreById.d1})`)

    // legacy-alone execution of ITS OWN (exact-clause-free) query must succeed cleanly
    const rankQueryLegacy = structuredClone(qLegacy)
    rankQueryLegacy.query.bool.filter.push({ ids: { values: ['d1', 'd2'] } })
    const rankResLegacy: any = await client.search({ index: LEGACY_INDEX, ...rankQueryLegacy })
    assert.equal(rankResLegacy._shards.failed, 0)

    // empirical proof of "sending it would 400": force the exact-boost clause onto the legacy
    // dataset object (simulating the bug the gating in commons.ts prevents) and send it to
    // fixture-legacy, whose settings deliberately do not define `custom_french_exact` (see
    // legacySettings above) -- the same gap a genuine pre-feature legacy index has in production.
    const buggyExactMatch = { analyzer: config.elasticsearch.exactMatchAnalyzer, boost: config.elasticsearch.exactMatchBoost }
    const buggyClause = buildQClauses(legacyDataset, q, undefined, undefined, {}, undefined, buggyExactMatch)
    assert.ok(JSON.stringify(buggyClause).includes(config.elasticsearch.exactMatchAnalyzer))
    await assert.rejects(
      client.search({ index: LEGACY_INDEX, query: buggyClause, size: 1 }),
      (err: any) => {
        assert.equal(err.meta?.statusCode ?? err.statusCode, 400)
        return true
      }
    )
  })

  test('highlight through the production shape on both indexes', async () => {
    const q = 'configurations'
    const qNew = prepareQuery(newDataset, { q, highlight: 'text1' })
    const qLegacy = prepareQuery(legacyDataset, { q, highlight: 'text1' })

    const resNew: any = await client.search({ index: NEW_INDEX, ...qNew })
    assert.equal(resNew._shards.failed, 0)
    const newHit = resNew.hits.hits.find((h: any) => h._id === 'd2')
    assert.ok(newHit, 'expected d2 to be hit on the new index')
    const fragsNew = [...(newHit.highlight?.['text1.text'] ?? []), ...(newHit.highlight?.['text1.text_standard'] ?? [])]
    assert.ok(fragsNew.length > 0 && fragsNew.some((f: string) => f.includes('<em class="highlighted">')), `expected a highlighted fragment on new, got ${JSON.stringify(newHit.highlight)}`)

    const resLegacy: any = await client.search({ index: LEGACY_INDEX, ...qLegacy })
    assert.equal(resLegacy._shards.failed, 0)
    const legacyHit = resLegacy.hits.hits.find((h: any) => h._id === 'd2')
    assert.ok(legacyHit, 'expected d2 to be hit on the legacy index')
    const fragsLegacy = [...(legacyHit.highlight?.['text1.text'] ?? []), ...(legacyHit.highlight?.['text1.text_standard'] ?? [])]
    assert.ok(fragsLegacy.length > 0 && fragsLegacy.some((f: string) => f.includes('<em class="highlighted">')), `expected a highlighted fragment on legacy, got ${JSON.stringify(legacyHit.highlight)}`)
  })
})
