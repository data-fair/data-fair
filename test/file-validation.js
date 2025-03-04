import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import fs from 'fs-extra'
import nock from 'nock'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.js'

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .post('/api/1/datasets/').reply(201, { slug: 'my-dataset', page: 'http://test-catalog.com/datasets/my-dataset' })

const schema = [
  {
    key: 'id',
    type: 'string',
    pattern: '^[a-z]+$'
  },
  {
    key: 'adr',
    type: 'string'
  },
  {
    key: 'some_date',
    type: 'string',
    format: 'date'
  },
  {
    key: 'loc',
    type: 'string'
  },
  {
    key: 'bool',
    type: 'boolean'
  },
  {
    key: 'nb',
    type: 'number'
  }
]

const schemaWithFix = [...schema]
schemaWithFix[0] = { ...schemaWithFix[0], 'x-transform': { expr: 'LOWER(value)' } }

describe('file datasets with validation rules', function () {
  it('create a valid dataset with initial validation rules', async function () {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.count, 2)
  })

  it('create an invalid dataset with initial validation rules', async function () {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    form.append('schema', JSON.stringify(schema))
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    await assert.rejects(workers.hook('finalizer/' + dataset.id), err => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })

    // apply a transformation to fix the issue
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: schemaWithFix })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    const lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, 'test')
  })

  it('create a valid dataset then patch compatible validation rules', async function () {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./resources/datasets/dataset1.csv'), 'dataset1.csv')
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.count, 2)
    const patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'validation-updated')
    dataset = await workers.hook('fileValidator/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
  })

  it('create a valid dataset then patch incompatible validation rules', async function () {
    // Create a valid dataset
    const form = new FormData()
    form.append('file', fs.readFileSync('./resources/datasets/dataset1-invalid.csv'), 'dataset1.csv')
    const ax = global.ax.dmeadus
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })).data
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.count, 2)
    let patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema })).data
    assert.equal(patched.status, 'validation-updated')
    await assert.rejects(workers.hook('fileValidator/' + dataset.id), err => {
      assert.ok(err.message.includes('ont une erreur de validation'))
      return true
    })

    // apply a transformation to fix the issue
    patched = (await ax.patch('/api/v1/datasets/' + dataset.id, { schema: schemaWithFix })).data
    assert.equal(patched.status, 'analyzed')
    dataset = await workers.hook('finalizer/' + dataset.id)
    assert.equal(dataset.status, 'finalized')
    const lines = (await ax.get('/api/v1/datasets/' + dataset.id + '/lines')).data.results
    assert.equal(lines.length, 2)
    assert.equal(lines[0].id, 'test')
  })
})
