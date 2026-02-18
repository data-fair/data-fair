import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'

const schema = [
  { key: 'id', type: 'string', pattern: '^[a-z]+$' },
  { key: 'adr', type: 'string' },
  { key: 'some_date', type: 'string', format: 'date' },
  { key: 'loc', type: 'string' },
  { key: 'bool', type: 'boolean' },
  { key: 'nb', type: 'number' }
]

const schemaWithFix = [...schema]
schemaWithFix[0] = { ...schemaWithFix[0], 'x-transform': { expr: 'LOWER(value)' } }

describe('file datasets with validation rules', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('create a valid dataset with initial validation rules', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 2)
  })

  it('create an invalid dataset with initial validation rules', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    await assert.rejects(workers.hook('finalize/' + dataset.id), (err: any) => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })

    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: schemaWithFix })).data
    assert.equal(patched.status, 'analyzed')
    const finalizedDataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(finalizedDataset.status, 'finalized')
    const lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, 'test')
  })

  it('create a valid dataset then patch compatible validation rules', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1.csv'), 'dataset1.csv')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 2)
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'validation-updated')
    dataset = await workers.hook('validateFile/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
  })

  it('create a valid dataset then patch incompatible validation rules', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 2)
    let patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'validation-updated')
    await assert.rejects(workers.hook('validateFile/' + dataset.id), (err: any) => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })

    patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: schemaWithFix })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    const lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, 'test')
  })

  it('manage validation rules for multi-valued cols', async function () {
    const schemaMulti = [
      { key: 'id', type: 'string' },
      { key: 'multinb', type: 'number', separator: ';' },
      { key: 'multipattern', type: 'string', pattern: '^test[0-9]$', separator: ', ' }
    ]

    const ax = dmeadus
    const form = new FormData()
    form.append('file', 'id,multinb,multipattern\nkoumoul,"111 ; 222","test1, test2"\nbidule,123,test3', 'dataset1.csv')
    form.append('schema', JSON.stringify(schemaMulti))
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    const workers = await import('../api/src/workers/index.ts')
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.count, 2)
    let lines = await ax.get(`/api/v1/datasets/${dataset.id}/lines`).then(r => r.data.results)
    assert.equal(lines[0].multipattern, 'test1, test2')
    lines = await ax.get(`/api/v1/datasets/${dataset.id}/lines?arrays=true`).then(r => r.data.results)
    assert.deepEqual(lines[0].multipattern, ['test1', 'test2'])

    const form2 = new FormData()
    form2.append('file', 'id,multinb,multipattern\nkoumoul,"111 ; 222","test1, testko"\nbidule,123,test3', 'dataset1.csv')
    form2.append('schema', JSON.stringify(schemaMulti))
    const dataset2 = await ax.post('/api/v1/datasets', form2, { headers: formHeaders(form2) }).then(r => r.data)
    await assert.rejects(workers.hook('finalize/' + dataset2.id), (err: any) => {
      assert.ok(err.message.includes('/multipattern/1 doit correspondre au format'))
      return true
    })
  })
})
