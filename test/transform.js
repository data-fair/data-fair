import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.js'
import fs from 'fs-extra'

describe('file datasets with transformation rules', function () {
  it('create a dataset and apply a simple transformation', async function () {
    const form = new FormData()
    form.append('file', 'id\nTest\nTest2', 'dataset1.csv')
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.count, 2)

    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, 'Test')
    assert.equal(lines[1].id, 'Test2')

    const schema = dataset.schema
    schema[0]['x-transform'] = { expr: 'LOWER(value)' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await workers.hook('finalizer/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, 'test')
    assert.equal(lines[1].id, 'test2')
  })

  it('create a dataset and overwrite the type of a column', async function () {
    const form = new FormData()
    form.append('file', 'id,col1\ntest,val\ntest2,val\n,val', 'dataset1.csv')
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('finalizer/' + dataset.id)

    const schema = dataset.schema
    schema[0]['x-transform'] = { type: 'boolean', expr: 'value == "test"' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    await workers.hook('finalizer/' + dataset.id)

    const lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, true)
    assert.equal(lines[1].id, false)
    assert.equal(lines[2].id, null)
  })

  it('create a XLSX dataset and apply a transformation on a column', async function () {
    const form = new FormData()
    form.append('file', fs.readFileSync('resources/datasets/date-time.xlsx'), 'dataset1.xlsx')
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('finalizer/' + dataset.id)

    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01T00:00:00.000Z')
    assert.equal(lines[1].horodatage, '2050-01-01T01:00:00.000Z')

    const schema = dataset.schema
    const col = schema.find(p => p.key === 'horodatage')
    col['x-transform'] = { type: 'string', format: 'date', expr: 'SUBSTRING(value, 0, 10)' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    await workers.hook('finalizer/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01')
    assert.equal(lines[1].horodatage, '2050-01-01')
  })
})
