import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, getRawDataset, patchRawDataset, datasetEsMappingProperties, clearDatasetCache } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

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
    assert.deepEqual(raw._indexShape, { singleTextField: true, wordAggField: true })

    const properties = await addStringColumn('shape-new')
    // single analyzed field: the repeat index analyzer + a distinct search analyzer, no
    // `.text_standard` twin
    assert.ok(properties.str2.fields.text)
    assert.ok(properties.str2.fields.text.search_analyzer)
    assert.notEqual(properties.str2.fields.text.analyzer, properties.str2.fields.text.search_analyzer)
    assert.equal(properties.str2.fields.text_standard, undefined)
    // the mapping update did not rebuild the index -> the stamp is unchanged
    assert.deepEqual((await getRawDataset('shape-new'))._indexShape, { singleTextField: true, wordAggField: true })
  })

  test('a legacy dataset (no stamp) grows LEGACY-shaped columns and stays unstamped', async () => {
    await createDataset('shape-legacy')
    // simulate a dataset whose index predates the new shape: remove the stamp out of band, which
    // is exactly how the whole existing fleet looks
    await patchRawDataset('shape-legacy', { $unset: { _indexShape: '' } })
    await clearDatasetCache()
    assert.equal((await getRawDataset('shape-legacy'))._indexShape, undefined)

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
})
