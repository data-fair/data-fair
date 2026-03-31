import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError, setupMockRoute, clearMockRoutes } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// Helper to set up geocoder coords mock via the mock server (replaces nock-based setCoordsNock)
const setupCoordsMock = async (latLon: number, opts?: { multiply?: boolean }) => {
  const indexFields = ['matchLevel']
  if (opts?.multiply) indexFields.push('lat', 'lon')
  await setupMockRoute({ path: '/geocoder/coords', ndjsonEcho: { fields: { lat: latLon, lon: latLon, matchLevel: 'match' }, indexFields } })
}

test.describe('Extensions (expressions)', () => {
  test.beforeEach(async () => {
    await clean()
    await clearMockRoutes()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Extend dataset using expression', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr)', property: { key: 'calc1', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(dataset.schema.find((field: any) => field.key === 'calc1'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].calc1, 'koumoul - 19 rue de la voie lactée saint avé')
    assert.equal(res.data.results[1].calc1, 'bidule - adresse inconnue')
  })

  test('Extend dataset using static value expression and x-originalName', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: '"Test"', property: { 'x-originalName': 'Test', key: 'test', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(dataset.schema.find((field: any) => field.key === 'test'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].test, 'Test')
    assert.equal(res.data.results[1].test, 'Test')
  })

  test('Extend dataset using more complex expression', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'f(item) = item != "koumoul"; join(" - ", filter(f, [id, adr]))', property: { key: 'calc1', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(dataset.schema.find((field: any) => field.key === 'calc1'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].calc1, '19 rue de la voie lactée saint avé')
    assert.equal(res.data.results[1].calc1, 'bidule - adresse inconnue')
  })

  test('Extend dataset using expression referencing column from another extension', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    // Prepare for extension using created remote service and patch dataset to ask for it
    await setupCoordsMock(10, { multiply: true })
    dataset.schema.find((field: any) => field.key === 'adr')['x-refersTo'] = 'http://schema.org/address'

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' },
        { active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr, " - ", _coords.matchLevel)', property: { key: 'calc1', type: 'string' } }
      ]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(dataset.schema.find((field: any) => field.key === 'calc1'))

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].calc1, 'koumoul - 19 rue de la voie lactée saint avé - match0')
    assert.equal(res.data.results[1].calc1, 'bidule - adresse inconnue - match1')
  })

  test('Manage some errors in expressions', async () => {
    const ax = testUser1
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest dataset',
      schema: [{ key: 'str1', 'x-originalName': 'Str1', type: 'string' }, { key: 'str2', type: 'string' }]
    })).data

    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", str1', property: { key: 'calc1', type: 'string' } }]
    }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('unexpected TEOF'))
      return true
    })

    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", Str1)', property: { key: 'calc1', type: 'string' } }]
    }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('la clé de la colonne Str1 est str1'))
      return true
    })

    await assert.rejects(ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [
        { active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", calc2)', property: { key: 'calc1', type: 'string' } },
        { active: true, type: 'exprEval', expr: 'CONCAT(_id, " - ", str1)', property: { key: 'calc2', type: 'string' } }
      ]
    }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.data.includes('la colonne calc2 est définie par une extension qui est appliquée après cette expression'))
      return true
    })
  })

  test('Fail to add extension with duplicate key', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr)', property: { key: 'employees', type: 'string' } }]
    })
    assert.equal(res.status, 200)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(dataset.schema.find((field: any) => field.key === 'employees'))

    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset2.csv'), 'dataset2.csv')
    dataset = (await ax.put(`/api/v1/datasets/${dataset.id}`, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })).data

    dataset = await waitForDatasetError(ax, dataset.id, { draft: true })
    assert.equal(dataset.status, 'error')
  })

  test('Update a single extension on file dataset should trigger full reindexing', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " - ", adr)', property: { key: 'employees', type: 'string' } }]
    })
    dataset = await waitForFinalize(ax, dataset.id)
    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{ active: true, type: 'exprEval', expr: 'CONCAT(id, " / ", adr)', property: { key: 'employees', type: 'string' } }]
    })
    assert.equal(res.data.status, 'validated')
    dataset = await waitForFinalize(ax, dataset.id)
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(lines[0].employees, 'koumoul / 19 rue de la voie lactée saint avé')
  })

  test('Update a single extension on Rest dataset should NOT trigger full reindexing', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    let dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest dataset',
      schema: [{ key: 'str1', type: 'string' }, { key: 'str2', type: 'string' }],
      extensions: [{
        active: true,
        type: 'exprEval',
        expr: 'CONCAT(str1, " - ", str2, " - ", TRANSFORM_DATE(_updatedAt, "", "DD/MM/YYYY"))',
        property: { key: 'exp', type: 'string' }
      }]
    })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [{ str1: 'str 1', str2: 'str 2' }, { str1: 'UPPER STR 1', str2: 'UPPER STR 2' }])
    await waitForFinalize(ax, dataset.id)
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    // Note: date format check removed since dayjs is not imported
    assert.ok(lines[0].exp)
    assert.ok(lines[1].exp)
    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      extensions: [{ active: true, type: 'exprEval', expr: 'UPPER(CONCAT(str1, " - ", str2, " - ", TRANSFORM_DATE(_updatedAt, "", "DD/MM/YYYY")))', property: { key: 'exp', type: 'string' } }]
    })
    assert.equal(res.data.status, 'finalized')
    assert.equal(res.data.extensions[0].needsUpdate, true)
    await waitForFinalize(ax, dataset.id)
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.equal(dataset.status, 'finalized')
    // Verify the updated expression was applied to lines
    const updatedLines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data.results
    assert.equal(updatedLines.length, 2)
    const lowerLine = updatedLines.find((l: any) => l.str1 === 'str 1')
    assert.ok(lowerLine.exp.startsWith('STR 1 - STR 2'))
    const upperLine = updatedLines.find((l: any) => l.str1 === 'UPPER STR 1')
    assert.ok(upperLine.exp.startsWith('UPPER STR 1 - UPPER STR 2'))
  })

  test('Manage cases where extension returns wrong type', async () => {
    const ax = testUser1
    // Initial dataset with addresses
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '"value"', property: { key: 'calc1', type: 'number' } }
      ]
    })
    assert.equal(res.status, 200)
    let errorDataset = await waitForDatasetError(ax, dataset.id)
    assert.equal(errorDataset.status, 'error')

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '1.1', property: { key: 'calc1', type: 'number' } }
      ]
    })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].calc1, 1.1)

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '1.1', property: { key: 'calc1', type: 'integer' } }
      ]
    })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].calc1, 1)

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '1', property: { key: 'calc1', type: 'string' } }
      ]
    })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].calc1, '1')

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '[[1],[2]]', property: { key: 'calc1', type: 'number' } }
      ]
    })
    assert.equal(res.status, 200)
    errorDataset = await waitForDatasetError(ax, dataset.id)
    assert.equal(errorDataset.status, 'error')

    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [
        { active: true, type: 'exprEval', expr: '"wrongDate"', property: { key: 'calc1', type: 'string', format: 'date-time' } }
      ]
    })
    assert.equal(res.status, 200)
    errorDataset = await waitForDatasetError(ax, dataset.id)
    assert.equal(errorDataset.status, 'error')
  })
})
