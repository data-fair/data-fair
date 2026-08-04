import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, clearDatasetCache } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// spec docs/superpowers/specs/2026-08-03-text-indexing-unification-design.md §3
// write-path stamping (curateDataset) + patch.ts reindex trigger on `language` change
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
