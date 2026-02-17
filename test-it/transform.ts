import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, formHeaders } from './utils/index.ts'
import FormData from 'form-data'
import fs from 'node:fs'
import path from 'node:path'

describe('file datasets with transformation rules', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('create a dataset and apply a simple transformation', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', 'id\n Test\nTest2', 'dataset1.csv')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 2)

    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, 'Test')
    assert.equal(lines[1].id, 'Test2')

    const schema = dataset.schema
    schema[0]['x-transform'] = { expr: 'PAD_LEFT(LOWER(value), 6, "0")' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await workers.hook('finalize/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].id, '00test')
    assert.equal(lines[1].id, '0test2')
  })

  it('create a dataset and overwrite the type of 2 columns and add an extension', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', 'id,col1,col2\ntest,val,2025-04-03T18:00:00+02:00\ntest2,val,\n,val,2025-04-03T19:00:00+02:00', 'dataset1.csv')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.schema[0].type, 'string')
    assert.equal(dataset.schema[2].type, 'string')
    assert.equal(dataset.schema[2].format, 'date-time')

    const schema = dataset.schema
    schema[0]['x-transform'] = { type: 'boolean', expr: 'value == "test"' }
    schema[2]['x-transform'] = { type: 'string', expr: 'EXTRACT(value,"T","+")' }
    dataset = (await ax.patch('/api/v1/datasets/' + dataset.id, {
      schema,
      extensions: [
        {
          active: true,
          type: 'exprEval',
          expr: 'CONCATENATE(col1, "_", col2)',
          property: {
            key: 'concat',
            type: 'string'
          }
        }
      ]
    })).data
    assert.equal(dataset.status, 'validated')
    dataset = await workers.hook('finalize/' + dataset.id)
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
    dataset = (await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })).data
    assert.equal(dataset.status, 'loaded')
    dataset = await workers.hook('finalize/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, true)
    assert.equal(lines[0].col2, '16:00:00')
    assert.equal(lines[1].id, false)
    assert.equal(lines[1].col2, undefined)
  })

  it('create a XLSX dataset and apply a transformation on a column', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync(path.resolve('./test/resources/datasets/date-time.xlsx')), 'dataset1.xlsx')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/' + dataset.id)

    let lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01T00:00:00.000Z')
    assert.equal(lines[1].horodatage, '2050-01-01T01:00:00.000Z')

    const schema = dataset.schema
    const col = schema.find((p: any) => p.key === 'horodatage')
    col['x-transform'] = { type: 'string', format: 'date', expr: 'SUBSTRING(value, 0, 10)' }
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'analyzed')
    await workers.hook('finalize/' + dataset.id)

    lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines[0].horodatage, '2050-01-01')
    assert.equal(lines[1].horodatage, '2050-01-01')
  })
})
