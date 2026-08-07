import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, getRawDataset, patchRawDataset, datasetEsMappingProperties, clearDatasetCache } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const adminUser = await axiosAuth('test_superadmin@test.com', undefined, true)

// `_indexShape` (design §3) records the mapping shape a dataset's CURRENT index was built with.
// It is stamped only when a fresh index is built, and every later emission — in particular the
// partial mapping update attempted on a compatible schema patch — follows the stamp so that an
// index never mixes the two emissions. These tests pin that rule against the LIVE ES mapping,
// not against a re-implementation of the emission call.
test.describe('index shape', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  // The initial schema deliberately holds no string column: a scalar's mapping is identical under
  // both shapes, so the partial mapping update below is accepted by elasticsearch either way and
  // the ONLY difference between the two datasets is the shape the new string column is emitted
  // with. A string column in the initial schema would make the legacy-shaped update conflict with
  // the live new-shape mapping and fall back to a full reindex, hiding what we want to observe.
  const createDataset = async (id: string) => {
    const ax = testUser1
    await ax.put(`/api/v1/datasets/${id}`, {
      isRest: true,
      title: id,
      schema: [{ key: 'num1', type: 'number' }]
    })
    await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [{ num1: 1 }, { num1: 2 }])
    await waitForFinalize(ax, id)
    return ax
  }

  const addStringColumn = async (id: string) => {
    const ax = testUser1
    await doAndWaitForFinalize(ax, id, () => ax.patch(`/api/v1/datasets/${id}`, {
      schema: [{ key: 'num1', type: 'number' }, { key: 'str2', type: 'string' }]
    }))
    return await datasetEsMappingProperties(id)
  }

  test('a fresh dataset is stamped new-shape and grows new-shaped columns', async () => {
    await createDataset('shape-new')
    const raw = await getRawDataset('shape-new')
    assert.deepEqual(raw._indexShape, { singleTextField: true, wordAggField: true, noNumericText: true })
    // internal field: stripped from the public representation, surfaced to admins by _diagnose
    assert.equal((await testUser1.get('/api/v1/datasets/shape-new')).data._indexShape, undefined)
    assert.deepEqual((await adminUser.get('/api/v1/datasets/shape-new/_diagnose')).data._indexShape, { singleTextField: true, wordAggField: true, noNumericText: true })

    const properties = await addStringColumn('shape-new')
    // single analyzed field: the repeat index analyzer + a distinct search analyzer, no
    // `.text_standard` twin
    assert.ok(properties.str2.fields.text)
    assert.ok(properties.str2.fields.text.search_analyzer)
    assert.notEqual(properties.str2.fields.text.analyzer, properties.str2.fields.text.search_analyzer)
    assert.equal(properties.str2.fields.text_standard, undefined)
    // the mapping update did not rebuild the index -> the stamp is unchanged
    assert.deepEqual((await getRawDataset('shape-new'))._indexShape, { singleTextField: true, wordAggField: true, noNumericText: true })
  })

  test('a legacy dataset (no stamp) grows LEGACY-shaped columns and stays unstamped', async () => {
    await createDataset('shape-legacy')
    // simulate a dataset whose index predates the new shape: remove the stamp out of band, which
    // is exactly how the whole existing fleet looks
    await patchRawDataset('shape-legacy', { $unset: { _indexShape: '' } })
    await clearDatasetCache()
    assert.equal((await getRawDataset('shape-legacy'))._indexShape, undefined)
    assert.equal((await adminUser.get('/api/v1/datasets/shape-legacy/_diagnose')).data._indexShape, null)

    const properties = await addStringColumn('shape-legacy')
    // the new column must join the index legacy-shaped: dual analyzed fields, `.text` carrying a
    // single (search) analyzer
    assert.ok(properties.str2.fields.text_standard)
    assert.equal(properties.str2.fields.text_standard.analyzer, 'standard')
    assert.ok(properties.str2.fields.text)
    assert.equal(properties.str2.fields.text.search_analyzer, undefined)
    assert.equal(properties.str2.fields.words, undefined)
    // and a mapping update must never stamp: the index was not rebuilt, it is still legacy
    assert.equal((await getRawDataset('shape-legacy'))._indexShape, undefined)
  })

  // The wide/narrow classification is index-dependent state too: it decides whether the mapping
  // carries the `_search` catch-all (+ `copy_to` on every text column) and it is recorded as
  // `_esCopyToSearch`. A *scalar-heavy* schema can sit in the band where the legacy units call it
  // narrow (<= 30 inner fields) while the new units call it wide (> 15) — and there both sides of
  // `updateDatasetMapping`'s crossing guards would agree on "wide", so nothing forces a reindex:
  // elasticsearch accepts adding `_search` + `copy_to` in place, existing rows are NEVER re-copied
  // into it, and `q` then answers from an empty catch-all field.
  test('a legacy dataset in the wide/narrow band never gains _search in place', async () => {
    const ax = testUser1
    const id = 'shape-band'
    // created narrow under BOTH shapes (5 counted inner fields + 3 calculated), so the fresh index
    // genuinely carries no `_search` — like the whole pre-rework fleet. `txt` disables language
    // analysis on purpose: such a column is emitted IDENTICALLY under both shapes (a single
    // `.text_standard`), so it can hold data from the start without making the legacy-shaped
    // mapping update conflict with the live new-shape mapping (see the note on createDataset).
    const txtCol = { key: 'txt', type: 'string', 'x-capabilities': { text: false } }
    const numCols = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'num' + i, type: 'number' }))
    await ax.put(`/api/v1/datasets/${id}`, { isRest: true, title: id, schema: [txtCol, ...numCols(4)] })
    await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [{ txt: 'aubergine', num0: 1 }, { txt: 'courgette', num0: 2 }])
    await waitForFinalize(ax, id)
    assert.equal((await datasetEsMappingProperties(id))._search, undefined)
    assert.notEqual((await getRawDataset(id))._esCopyToSearch, true)

    // simulate the legacy fleet member we cannot create through the API (a fresh index is always
    // built new-shape, and a band-shaped one would be born wide): drop the stamp AND graft the
    // band-shaped schema onto the stored document. 20 numeric columns + `txt` = 21 counted inner
    // fields under both shapes (+3 calculated) — over the new threshold of 15, well under the
    // legacy 30.
    await patchRawDataset(id, { $unset: { _indexShape: '' }, schema: [txtCol, ...numCols(20)] })
    await clearDatasetCache()

    // a compatible schema patch: the partial mapping update path
    await doAndWaitForFinalize(ax, id, () => ax.patch(`/api/v1/datasets/${id}`, {
      schema: [txtCol, ...numCols(21)]
    }))

    const properties = await datasetEsMappingProperties(id)
    // the live legacy index must NOT have gained the catch-all, nor copy_to on its columns
    assert.equal(properties._search, undefined)
    assert.equal(properties.txt.copy_to, undefined)
    const raw = await getRawDataset(id)
    // ... and the flag that routes `q` to that field must not claim it exists
    assert.notEqual(raw._esCopyToSearch, true)
    // no reindex happened, so the dataset is still legacy-shaped
    assert.equal(raw._indexShape, undefined)

    // the decisive symptom: `q` still finds the rows indexed before the patch
    const lines = (await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'aubergine' } })).data
    assert.equal(lines.total, 1)
    assert.equal(lines.results[0].txt, 'aubergine')
  })
})
