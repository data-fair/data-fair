import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, waitForWorkerIdle } from '../../../support/axios.ts'
import { patchRawDataset } from '../../../support/workers.ts'

const u1 = await axiosAuth('test_user1@test.com')

/**
 * Schema keys reaching the API are not normalized by any producer (the file workers, the UI and
 * the extensions all call escapeKey, an API client does not), so they land verbatim in the
 * Elasticsearch mapping. A dot there is expanded by ES into an object path: silently nested when
 * the column stands alone, and a hard mapping error when a scalar column of the same name exists —
 * which left the dataset stuck in status 'error' with no index at all. A leading _ shadows a
 * calculated column. Every other un-normalized key is harmless and stays accepted.
 */
test.describe('schema keys that corrupt the index are refused', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('refuses to create a REST dataset with a dotted schema key', async () => {
    await assert.rejects(
      u1.post('/api/v1/datasets/keys-create', {
        isRest: true,
        title: 'keys-create',
        schema: [{ key: 'note_c2', type: 'number' }, { key: 'note_c2.1', type: 'number' }]
      }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.match(err.data, /note_c2\.1/)
        assert.match(err.data, /note_c21/)
        return true
      }
    )
  })

  test('refuses a schema patch introducing a dotted key', async () => {
    const id = 'keys-patch'
    // a REST dataset created with a schema is finalized synchronously by the API (no worker run)
    await u1.post('/api/v1/datasets/' + id, { isRest: true, title: id, schema: [{ key: 'note_c2', type: 'number' }] })

    await assert.rejects(
      u1.patch('/api/v1/datasets/' + id, {
        schema: [{ key: 'note_c2', type: 'number' }, { key: 'note_c2.1', type: 'number' }]
      }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.match(err.data, /note_c2\.1/)
        return true
      }
    )

    // the dataset must be left untouched, not wedged in status 'error' without an index
    const after = (await u1.get('/api/v1/datasets/' + id)).data
    assert.equal(after.status, 'finalized')
    assert.equal((await u1.get(`/api/v1/datasets/${id}/lines`)).status, 200)
  })

  test('refuses a schema key with a leading underscore, reserved for calculated columns', async () => {
    await assert.rejects(
      u1.post('/api/v1/datasets/keys-underscore', {
        isRest: true,
        title: 'keys-underscore',
        schema: [{ key: '_i', type: 'string' }]
      }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.match(err.data, /_i/)
        return true
      }
    )
  })

  // processing plugins and client scripts declare such keys (processing-sirene, processing-mdi-icons…)
  test('keeps accepting un-normalized keys that are harmless to the index', async () => {
    const id = 'keys-harmless'
    await u1.post('/api/v1/datasets/' + id, {
      isRest: true,
      title: id,
      schema: [{ key: 'packVersion', type: 'string' }, { key: 'code_DEP', type: 'string' }]
    })
    const patched = await u1.patch('/api/v1/datasets/' + id, {
      schema: [{ key: 'packVersion', type: 'string' }, { key: 'code_DEP', type: 'string' }, { key: 'svgPath', type: 'string' }]
    })
    assert.equal(patched.status, 200)
    await u1.post(`/api/v1/datasets/${id}/lines`, { packVersion: '1.0', code_DEP: '75', svgPath: 'M0' })
    await waitForWorkerIdle()
    const lines = (await u1.get(`/api/v1/datasets/${id}/lines`)).data
    assert.equal(lines.results[0].svgPath, 'M0')
  })

  // compat-ods turns the dot into _ ('note_c2_1') where the default drops it ('note_c21')
  test('suggests the compat-ods form when the dataset is created with that algorithm', async () => {
    await assert.rejects(
      u1.post('/api/v1/datasets/keys-compat-ods', {
        isRest: true,
        title: 'keys-compat-ods',
        analysis: { escapeKeyAlgorithm: 'compat-ods' },
        schema: [{ key: 'note_c2', type: 'number' }, { key: 'note_c2.1', type: 'number' }]
      }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.match(err.data, /note_c2_1/)
        assert.doesNotMatch(err.data, /note_c21/)
        return true
      }
    )
  })

  test('suggests the compat-ods form when the patch sets that algorithm', async () => {
    const id = 'keys-compat-ods-patch'
    await u1.post('/api/v1/datasets/' + id, { isRest: true, title: id })
    await assert.rejects(
      u1.patch('/api/v1/datasets/' + id, {
        analysis: { escapeKeyAlgorithm: 'compat-ods' },
        schema: [{ key: 'a.b', type: 'string' }]
      }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.match(err.data, /a_b/)
        return true
      }
    )
  })

  test('keeps accepting a schema patch on a dataset that already carries a dotted key', async () => {
    const id = 'keys-grandfathered'
    await u1.post('/api/v1/datasets/' + id, { isRest: true, title: id, schema: [{ key: 'ville', type: 'string' }] })
    // simulate a dataset created before this gate existed: a lone dotted key is silently nested
    // by Elasticsearch but does not break the index
    await patchRawDataset(id, { schema: [{ key: 'ville.nom', type: 'string' }] })

    const patched = await u1.patch('/api/v1/datasets/' + id, {
      schema: [{ key: 'ville.nom', type: 'string', title: 'La ville' }]
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.data.schema.find((f: any) => f.key === 'ville.nom').title, 'La ville')
    await waitForWorkerIdle()
    assert.notEqual((await u1.get('/api/v1/datasets/' + id)).data.status, 'error')
  })
})
