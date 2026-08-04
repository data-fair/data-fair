import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, clearDatasetCache } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// `language` lifecycle (see docs/architecture/text-search-evaluation.md status note, and
// api/src/datasets/utils/data-schema.ts's defaultLanguage/stampSchemaLanguage doc comment for the
// full call-site list): every schema write (curateDataset) re-stamps `language` on string columns
// where absent, BEFORE the patch.ts comparison — this covers write-path stamping and the
// patch.ts:231 full-reindex trigger on an actual `language` change exercised below.
test.describe('Schema language meta', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('stamps language on a plain string column, vetoes when text capability is disabled', async () => {
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets/rest-lang-stamp', {
      isRest: true,
      title: 'rest-lang-stamp',
      schema: [
        { key: 'str1', type: 'string' },
        { key: 'std1', type: 'string', 'x-capabilities': { text: false } }
      ]
    })
    assert.equal(res.status, 201)
    const dataset = (await ax.get('/api/v1/datasets/rest-lang-stamp')).data
    assert.equal(dataset.schema.find((p: any) => p.key === 'str1').language, 'fr')
    assert.equal(dataset.schema.find((p: any) => p.key === 'std1').language, undefined)
  })

  test('echo PATCH of the unchanged, fully-stamped schema does not trigger a reindex', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-lang-echo', {
      isRest: true,
      title: 'rest-lang-echo',
      schema: [{ key: 'str1', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest-lang-echo/_bulk_lines', [{ str1: 'lang-echo-line' }])
    const dataset = await waitForFinalize(ax, 'rest-lang-echo')
    assert.equal(dataset.status, 'finalized')
    const str1 = dataset.schema.find((p: any) => p.key === 'str1')
    assert.equal(str1.language, 'fr')

    // GET the schema then PATCH it back unchanged, exactly as a legacy full-schema-echo writer would
    const patchRes = await ax.patch('/api/v1/datasets/rest-lang-echo', { schema: [{ key: str1.key, type: str1.type, language: str1.language }] })
    // preparePatch's if/else-if chain never matches on an unchanged schema, so `status` is never
    // reset off 'finalized' — no worker journal event is expected, and none is waited for here
    assert.equal(patchRes.data.status, 'finalized')
  })

  test('PATCH with language omitted re-stamps to equality before comparison, no reindex', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-lang-restamp', {
      isRest: true,
      title: 'rest-lang-restamp',
      schema: [{ key: 'str1', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest-lang-restamp/_bulk_lines', [{ str1: 'lang-restamp-line' }])
    const dataset = await waitForFinalize(ax, 'rest-lang-restamp')
    assert.equal(dataset.schema.find((p: any) => p.key === 'str1').language, 'fr')

    // omit `language` entirely, as a legacy writer that doesn't know about the new meta would
    const patchRes = await ax.patch('/api/v1/datasets/rest-lang-restamp', { schema: [{ key: 'str1', type: 'string' }] })
    assert.equal(patchRes.data.status, 'finalized')
    // curateDataset re-stamped the incoming schema to 'fr' before the patch.ts comparison, so the
    // stored value is unchanged too (no silent regression to standard analysis)
    assert.equal(patchRes.data.schema.find((p: any) => p.key === 'str1').language, 'fr')
  })

  test('PATCH changing language triggers a reindex, worker keeps the new language', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-lang-change', {
      isRest: true,
      title: 'rest-lang-change',
      schema: [{ key: 'str1', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest-lang-change/_bulk_lines', [{ str1: 'lang-change-line' }])
    await waitForFinalize(ax, 'rest-lang-change')

    // subscribe to the finalize event before firing the patch, then also inspect the immediate
    // patch response: preparePatch's reindexerStatus branch sets `patch.status` synchronously
    // (Object.assign(dataset, patch) in applyPatch happens before the HTTP response is sent), so
    // reading it here is not a race against the background worker
    let immediateStatus: string | undefined
    const dataset = await doAndWaitForFinalize(ax, 'rest-lang-change', async () => {
      const patchRes = await ax.patch('/api/v1/datasets/rest-lang-change', { schema: [{ key: 'str1', type: 'string', language: 'en' }] })
      immediateStatus = patchRes.data.status
      return patchRes
    })
    await clearDatasetCache()
    assert.notEqual(immediateStatus, 'finalized')
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema.find((p: any) => p.key === 'str1').language, 'en')
  })

  test('PATCH adding a text:false veto after stamping triggers reindex via x-capabilities, stored language untouched', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-lang-veto', {
      isRest: true,
      title: 'rest-lang-veto',
      schema: [{ key: 'str1', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest-lang-veto/_bulk_lines', [{ str1: 'lang-veto-line' }])
    const initialDataset = await waitForFinalize(ax, 'rest-lang-veto')
    const stampedLanguage = initialDataset.schema.find((p: any) => p.key === 'str1').language
    assert.equal(stampedLanguage, 'fr')

    // the veto arrives later, on top of the already-stamped language (mirrors the UI's toggle-off
    // flow: the deprecated key is PATCHed while `language` is echoed back untouched)
    const dataset = await doAndWaitForFinalize(ax, 'rest-lang-veto', () =>
      ax.patch('/api/v1/datasets/rest-lang-veto', {
        schema: [{ key: 'str1', type: 'string', language: stampedLanguage, 'x-capabilities': { text: false } }]
      }))
    await clearDatasetCache()
    const str1 = dataset.schema.find((p: any) => p.key === 'str1')
    // stored language is untouched by the veto — it stays the interpretive layer's job to ignore it
    assert.equal(str1.language, stampedLanguage)
    assert.equal(str1['x-capabilities'].text, false)
    // resolveSearchField({ language: 'fr', 'x-capabilities': { text: false } }) -> '.text_standard' is
    // this exact scenario, already pinned by tests/features/datasets/schema/language-meta.unit.spec.ts
    // ("veto and materialization rules from the spec"); not duplicated here since API specs exercise
    // the HTTP surface only, never import api/src directly (see capabilities.api.spec.ts / that unit spec)
  })
})

// spec §4 — q / qs / highlight / words_agg all target the ONE analyzed subfield the column
// materializes. `fr1` is a plain string (write-path stamped to language=fr -> .text, French
// analyzer); `std1` carries the text:false veto (-> .text_standard, standard analyzer, no language).
test.describe('Query routing on the effective analyzed field', () => {
  const datasetId = 'rest-lang-routing'

  test.beforeAll(async () => {
    const ax = testUser1
    await clean()
    await ax.post(`/api/v1/datasets/${datasetId}`, {
      isRest: true,
      title: datasetId,
      schema: [
        { key: 'fr1', type: 'string', 'x-capabilities': { textAgg: true } },
        { key: 'std1', type: 'string', 'x-capabilities': { text: false, textAgg: true } },
        // no analyzed subfield at all
        { key: 'none1', type: 'string', 'x-capabilities': { text: false, textStandard: false } },
        // a scalar whose only possible analyzed subfield is disabled — used to target an unmapped
        // `.text` through the `_search` filter and silently match nothing
        { key: 'num1', type: 'number', 'x-capabilities': { textStandard: false } }
      ]
    })
    await ax.post(`/api/v1/datasets/${datasetId}/_bulk_lines`, [
      { fr1: 'les données publiées', std1: 'les données publiées', none1: 'code-42', num1: 5 }
    ])
    const dataset = await waitForFinalize(ax, datasetId)
    // the write path stamped only the un-vetoed column
    assert.equal(dataset.schema.find((p: any) => p.key === 'fr1').language, 'fr')
    assert.equal(dataset.schema.find((p: any) => p.key === 'std1').language, undefined)
  })

  test.afterAll(async () => {
    await clean()
  })

  test('q uses the French analyzer on the language column and standard analysis on the vetoed one', async () => {
    const ax = testUser1
    // stemming + asciifolding are only available through .text (custom_french)
    let res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { q: 'donnee', q_fields: 'fr1' } })
    assert.equal(res.data.total, 1)
    // the vetoed column is routed to .text_standard, which does neither — the unstemmed,
    // unaccented term must not match there
    res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { q: 'donnee', q_fields: 'std1' } })
    assert.equal(res.data.total, 0)
    // ...but plain whole-token matching still works on it
    res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { q: 'données', q_fields: 'std1' } })
    assert.equal(res.data.total, 1)
  })

  test('qs accepts the materialized subfield and 400s on the other with a language hint', async () => {
    const ax = testUser1
    const res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { qs: 'fr1.text:données' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { qs: 'fr1.text_standard:données' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        // the hint states what IS materialized, not a canned sentence
        assert.ok(err.data.includes('utilise une analyse linguistique (language=fr)'))
        assert.ok(err.data.includes('fr1.text'))
        return true
      }
    )
    // symmetrically, the vetoed column has no .text
    await assert.rejects(
      ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { qs: 'std1.text:données' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('n\'utilise pas d\'analyse linguistique'))
        assert.ok(err.data.includes('std1.text_standard'))
        return true
      }
    )
    // a column with NO analyzed subfield must not be told it "uses a language analysis"
    for (const subfield of ['none1.text', 'none1.text_standard']) {
      await assert.rejects(
        ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { qs: `${subfield}:code-42` } }),
        (err: any) => {
          assert.equal(err.status, 400)
          assert.ok(err.data.includes('Aucune analyse textuelle'))
          assert.ok(!err.data.includes('utilise une analyse linguistique'))
          return true
        }
      )
    }
  })

  test('the _search filter targets the same effective field as q', async () => {
    const ax = testUser1
    // .text (custom_french): stemming + asciifolding, exactly what `q` gets on this column
    let res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { fr1_search: 'donnee' } })
    assert.equal(res.data.total, 1)
    // .text_standard: neither, so only the exact token matches — the two columns must NOT behave
    // alike, which is what the old capability-pair fan-out could not guarantee on a legacy index
    res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { std1_search: 'donnee' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { std1_search: 'données' } })
    assert.equal(res.data.total, 1)
    // no analyzed subfield -> reject, with the same shape as the neighbouring capability gates
    await assert.rejects(
      ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { none1_search: 'code-42' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Opérations disponibles sur ce champ'))
        return true
      }
    )
    // a scalar with textStandard:false used to target an unmapped `.text` and silently return 0
    await assert.rejects(
      ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { num1_search: '5' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('Opérations disponibles sur ce champ'))
        return true
      }
    )
  })

  test('words_agg targets the effective field and constrains the analysis param', async () => {
    const ax = testUser1
    // no analysis param -> whichever field exists
    let res = await ax.get(`/api/v1/datasets/${datasetId}/words_agg`, { params: { field: 'fr1' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    res = await ax.get(`/api/v1/datasets/${datasetId}/words_agg`, { params: { field: 'std1', analysis: 'standard' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    // asking for standard analysis on a language column: that field is not materialized
    await assert.rejects(
      ax.get(`/api/v1/datasets/${datasetId}/words_agg`, { params: { field: 'fr1', analysis: 'standard' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('analysis=standard'))
        return true
      }
    )
  })

  test('highlight targets the effective field', async () => {
    const ax = testUser1
    const res = await ax.get(`/api/v1/datasets/${datasetId}/lines`, { params: { q: 'donnee', q_fields: 'fr1', highlight: 'fr1' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
    assert.ok(res.data.results[0]._highlight.fr1.join('').includes('<em class="highlighted">'))
  })
})
