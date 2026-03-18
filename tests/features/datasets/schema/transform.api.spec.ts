import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize, sendDataset, waitForDatasetError } from '../../../support/workers.ts'
import FormData from 'form-data'
import fs from 'fs-extra'

const dmeadus = await axiosAuth('dmeadus0@answers.com')

test.describe('file datasets with transformation rules', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('create a dataset and apply a simple transformation', async () => {
    const form = new FormData()
    form.append('file', 'id\n Test\nTest2', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.count, 2)
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, 'Test')
    assert.equal(lines[1].id, 'Test2')
    const schema = dataset.schema
    schema[0]['x-transform'] = { expr: 'PAD_LEFT(LOWER(value), 6, "0")' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await waitForFinalize(ax, dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, '00test')
    assert.equal(lines[1].id, '0test2')
  })

  test('create a dataset and overwrite the type of 2 columns and add an extension', async () => {
    const form = new FormData()
    form.append('file', 'id,col1,col2\ntest,val,2025-04-03T18:00:00+02:00\ntest2,val,\n,val,2025-04-03T19:00:00+02:00', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema[0].type, 'string')
    assert.equal(dataset.schema[2].type, 'string')
    assert.equal(dataset.schema[2].format, 'date-time')
    const schema = dataset.schema
    schema[0]['x-transform'] = { type: 'boolean', expr: 'value == "test"' }
    schema[2]['x-transform'] = { type: 'string', expr: 'EXTRACT(value,"T","+")' }
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, {
      schema,
      extensions: [{
        active: true,
        type: 'exprEval',
        expr: 'CONCATENATE(col1, "_", col2)',
        property: { key: 'concat', type: 'string' }
      }]
    })).data
    assert.equal(dataset.status, 'validated')
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema[0].type, 'boolean')
    assert.equal(dataset.schema[2].type, 'string')
    assert.equal(dataset.schema[2].format, undefined)
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 3)
    assert.equal(lines[0].id, true)
    assert.equal(lines[0].col2, '18:00:00')
    assert.equal(lines[1].id, false)
    assert.equal(lines[1].col2, undefined)
    assert.equal(lines[2].id, undefined)
    assert.equal(lines[2].col2, '19:00:00')
    const form2 = new FormData()
    form2.append('file', 'id,col1,col2\ntest,val,2025-04-03T16:00:00+02:00\ntest2,val', 'dataset1.csv')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })).data
    assert.equal(dataset.status, 'loaded')
    dataset = await waitForFinalize(ax, dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, true)
    assert.equal(lines[0].col2, '16:00:00')
    assert.equal(lines[1].id, false)
    assert.equal(lines[1].col2, undefined)
  })

  test('create a XLSX dataset and apply a transformation on a column', async () => {
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/date-time.xlsx'), 'dataset1.xlsx')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01T00:00:00.000Z')
    assert.equal(lines[1].horodatage, '2050-01-01T01:00:00.000Z')
    const schema = dataset.schema
    const col = schema.find((p: any) => p.key === 'horodatage')
    col['x-transform'] = { type: 'string', format: 'date', expr: 'SUBSTRING(value, 0, 10)' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    await waitForFinalize(ax, dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01')
    assert.equal(lines[1].horodatage, '2050-01-01')
  })

  test('create manage transform type error', async () => {
    const form = new FormData()
    form.append('file', 'id,col1,col2\ntest,val,2025-04-03T18:00:00+02:00\ntest2,val,\n,val,2025-04-03T19:00:00+02:00', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    const schema = dataset.schema
    schema[0]['x-transform'] = { type: 'number', expr: '"test"' }
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema })
    await waitForDatasetError(ax, dataset.id)
    const message = 'échec de l\'évaluation de l\'expression ""test"" : /id doit être de type number (résultat : "test")'
    const journal = await ax.get('/api/v1/datasets/' + dataset.id + '/journal').then(r => r.data)
    assert.equal(journal[0].type, 'error')
    assert.equal(journal[0].data, message)
  })

  test('reload file with transform_date expression', async () => {
    const form = new FormData()
    form.append('file', 'horodate\n2025-11-10 22:30', 'dataset1.csv')
    const ax = dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema[0].type, 'string')
    assert.equal(dataset.schema[0].format, undefined)
    dataset.schema[0]['x-transform'] = {
      expr: 'TRANSFORM_DATE(value, "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm:ssZ", "UTC", "Europe/Paris")',
      type: 'string',
      format: 'date-time'
    }
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })).data
    assert.equal(dataset.status, 'analyzed')
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.schema[0].type, 'string')
    assert.equal(dataset.schema[0].format, 'date-time')
    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:30:00+01:00')
    const form2 = new FormData()
    form2.append('file', 'horodate\n2025-11-10 22:35', 'dataset1.csv')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })).data
    assert.equal(dataset.status, 'loaded')
    await waitForFinalize(ax, dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:35:00+01:00')
    const extensions = [{
      active: true,
      type: 'exprEval',
      expr: "EXTRACT(horodate, '', '-')",
      property: { key: 'annee', 'x-originalName': 'annee', type: 'string', 'x-capabilities': { textAgg: false }, maxLength: 200 }
    }]
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, { extensions })).data
    await waitForFinalize(ax, dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:35:00+01:00')
    let full = (await ax.get('/api/v1/datasets/' + dataset.id + '/full')).data
    assert.equal(full, 'horodate,annee\n2025-11-10T23:35:00+01:00,2025\n')
    const form3 = new FormData()
    form3.append('file', 'horodate\n2025-11-10 22:40', 'dataset1.csv')
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { draft: true } })).data
    assert.equal(dataset.status, 'loaded')
    await waitForFinalize(ax, dataset.id)
    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodate, '2025-11-10T23:40:00+01:00')
    full = (await ax.get('/api/v1/datasets/' + dataset.id + '/full')).data
    assert.equal(full, 'horodate,annee\n2025-11-10T23:40:00+01:00,2025\n')
  })

  test('Should add special calculated fields', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.ok(dataset.schema.find((f: any) => f.key === '_id' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find((f: any) => f.key === '_i' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find((f: any) => f.key === '_rand' && f['x-calculated'] === true))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: '_id,_i,_rand,id' } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0]._i, 1)
    assert.equal(res.data.results[1]._i, 2)
    assert.ok(res.data.results[0]._rand)
    assert.ok(res.data.results[0]._id)
  })

  test('Should split by separator if specified', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/split.csv', ax)
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords.text:opendata' } })
    assert.equal(res.data.total, 1)
    const keywordsProp = dataset.schema.find((p: any) => p.key === 'keywords')
    keywordsProp.separator = ' ; '
    await doAndWaitForFinalize(ax, dataset.id, () => ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema }))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].keywords, 'informatique ; opendata ; sas')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata', arrays: true } })
    assert.equal(res.data.total, 1)
    assert.deepEqual(res.data.results[0].keywords, ['informatique', 'opendata', 'sas'])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=keywords`)
    assert.equal(res.data.aggs.find((agg: any) => agg.value === 'opendata').total, 1)
  })
})
